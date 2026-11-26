package player

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	nostrclient "github.com/zeSchlausKwab/wavefunc/tui/internal/nostr"
)

type Status string

const (
	StatusIdle      Status = "idle"
	StatusTuning    Status = "tuning"
	StatusPlaying   Status = "playing"
	StatusBuffering Status = "buffering"
	StatusPaused    Status = "paused"
	StatusFailed    Status = "failed"
)

// Snapshot is an immutable view of player state emitted to the TUI on changes.
type Snapshot struct {
	Status      Status
	Station     *nostrclient.Station
	Stream      *nostrclient.Stream
	StreamIndex int
	Streams     []nostrclient.Stream
	Track       TrackInfo
	Volume      int
	Muted       bool
	Backend     BackendInfo
	Error       string
	SleepUntil  time.Time
}

func (s Snapshot) SleepRemaining(now time.Time) time.Duration {
	if s.SleepUntil.IsZero() {
		return 0
	}
	rem := s.SleepUntil.Sub(now)
	if rem < 0 {
		return 0
	}
	return rem
}

// OrderStreams ranks station streams: primary first, HTTPS over HTTP, higher bitrate first.
func OrderStreams(streams []nostrclient.Stream) []nostrclient.Stream {
	out := make([]nostrclient.Stream, 0, len(streams))
	for _, st := range streams {
		if strings.TrimSpace(st.URL) != "" {
			out = append(out, st)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Primary != out[j].Primary {
			return out[i].Primary
		}
		iHTTPS := strings.HasPrefix(strings.ToLower(out[i].URL), "https://")
		jHTTPS := strings.HasPrefix(strings.ToLower(out[j].URL), "https://")
		if iHTTPS != jHTTPS {
			return iHTTPS
		}
		return out[i].Quality.Bitrate > out[j].Quality.Bitrate
	})
	return out
}

// Supervisor coordinates audio playback, candidate stream fallback, ICY polling,
// and sleep timer lifecycle.
type Supervisor struct {
	mu          sync.Mutex
	preferred   string
	backend     BackendInfo
	status      Status
	station     *nostrclient.Station
	streams     []nostrclient.Stream
	streamIdx   int
	track       TrackInfo
	volume      int
	muted       bool
	errMsg      string
	sleepUntil  time.Time
	sleepTimer  *time.Timer
	handle      AudioHandle
	sessionSeq  uint64
	icyCancel   context.CancelFunc
	updates     chan Snapshot
	closed      bool
	startRunner func(info BackendInfo, url string, vol int, muted bool) (AudioHandle, error)
}

func NewSupervisor(preferredBackend string, volume int) *Supervisor {
	if volume < 0 {
		volume = 0
	}
	if volume > 100 {
		volume = 100
	}
	return &Supervisor{
		preferred:   preferredBackend,
		backend:     DetectBackend(preferredBackend),
		status:      StatusIdle,
		volume:      volume,
		updates:     make(chan Snapshot, 32),
		startRunner: startBackend,
	}
}

func (s *Supervisor) Updates() <-chan Snapshot {
	return s.updates
}

func (s *Supervisor) Backend() BackendInfo {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.backend
}

func (s *Supervisor) SetPreferredBackend(pref string) BackendInfo {
	s.mu.Lock()
	s.preferred = pref
	s.backend = DetectBackend(pref)
	info := s.backend
	snap := s.snapshotLocked()
	s.mu.Unlock()
	s.notify(snap)
	return info
}

func (s *Supervisor) Snapshot() Snapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.snapshotLocked()
}

func (s *Supervisor) snapshotLocked() Snapshot {
	snap := Snapshot{
		Status:      s.status,
		StreamIndex: s.streamIdx,
		Streams:     append([]nostrclient.Stream(nil), s.streams...),
		Track:       s.track,
		Volume:      s.volume,
		Muted:       s.muted,
		Backend:     s.backend,
		Error:       s.errMsg,
		SleepUntil:  s.sleepUntil,
	}
	if s.station != nil {
		st := *s.station
		snap.Station = &st
	}
	if s.streamIdx >= 0 && s.streamIdx < len(s.streams) {
		stream := s.streams[s.streamIdx]
		snap.Stream = &stream
	}
	return snap
}

func (s *Supervisor) notify(snap Snapshot) {
	select {
	case s.updates <- snap:
	default:
		// Drop oldest stale snapshot so UI always gets freshest state.
		select {
		case <-s.updates:
		default:
		}
		select {
		case s.updates <- snap:
		default:
		}
	}
}

// Play tunes into station starting at streamIdx (-1 uses automatic ordering).
func (s *Supervisor) Play(station nostrclient.Station, streamIdx int) {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	ordered := OrderStreams(station.Streams)
	if len(ordered) == 0 {
		s.stopActiveLocked()
		stCopy := station
		s.station = &stCopy
		s.streams = nil
		s.status = StatusFailed
		s.errMsg = "station has no playable streams"
		snap := s.snapshotLocked()
		s.mu.Unlock()
		s.notify(snap)
		return
	}
	if streamIdx < 0 || streamIdx >= len(ordered) {
		streamIdx = 0
	}
	s.stopActiveLocked()
	stCopy := station
	s.station = &stCopy
	s.streams = ordered
	s.streamIdx = streamIdx
	s.track = TrackInfo{}
	s.errMsg = ""
	s.status = StatusTuning
	s.sessionSeq++
	seq := s.sessionSeq
	snap := s.snapshotLocked()
	s.mu.Unlock()

	s.notify(snap)
	go s.launchCandidate(seq, streamIdx, 0)
}

func (s *Supervisor) launchCandidate(seq uint64, idx int, attempt int) {
	s.mu.Lock()
	if s.closed || seq != s.sessionSeq || idx < 0 || idx >= len(s.streams) {
		s.mu.Unlock()
		return
	}
	backend := s.backend
	stream := s.streams[idx]
	vol := s.volume
	muted := s.muted
	runner := s.startRunner
	s.streamIdx = idx
	s.status = StatusTuning
	snap := s.snapshotLocked()
	s.mu.Unlock()
	s.notify(snap)

	handle, err := runner(backend, stream.URL, vol, muted)
	if err != nil {
		s.handleFailure(seq, idx, attempt, err)
		return
	}

	icyCtx, icyCancel := context.WithCancel(context.Background())

	s.mu.Lock()
	if s.closed || seq != s.sessionSeq {
		s.mu.Unlock()
		icyCancel()
		handle.Stop()
		return
	}
	s.handle = handle
	s.icyCancel = icyCancel
	s.mu.Unlock()

	// Start direct ICY polling alongside playback (especially helpful for ffplay/vlc).
	go s.pollICYLoop(icyCtx, seq, stream.URL, handle.Kind())

	startedAt := time.Now()
	for ev := range handle.Events() {
		s.mu.Lock()
		if s.closed || seq != s.sessionSeq {
			s.mu.Unlock()
			return
		}
		switch ev.Kind {
		case BackendEventPlaying:
			if s.status != StatusPaused {
				s.status = StatusPlaying
				s.errMsg = ""
			}
			snap := s.snapshotLocked()
			s.mu.Unlock()
			s.notify(snap)
		case BackendEventBuffering:
			if s.status == StatusPlaying {
				s.status = StatusBuffering
				snap := s.snapshotLocked()
				s.mu.Unlock()
				s.notify(snap)
			} else {
				s.mu.Unlock()
			}
		case BackendEventMetadata:
			if !ev.Track.Empty() && ev.Track.Display() != s.track.Display() {
				s.track = ev.Track
				snap := s.snapshotLocked()
				s.mu.Unlock()
				s.notify(snap)
			} else {
				s.mu.Unlock()
			}
		case BackendEventExited:
			s.mu.Unlock()
			// If it played for >= 15s and dropped, retry the same stream first.
			if time.Since(startedAt) >= 15*time.Second && attempt < 2 {
				backoff := time.Duration(2<<attempt) * time.Second
				time.Sleep(backoff)
				go s.launchCandidate(seq, idx, attempt+1)
				return
			}
			s.handleFailure(seq, idx, attempt, ev.Err)
			return
		}
	}
}

func (s *Supervisor) handleFailure(seq uint64, idx int, _ int, err error) {
	s.mu.Lock()
	if s.closed || seq != s.sessionSeq {
		s.mu.Unlock()
		return
	}
	if s.icyCancel != nil {
		s.icyCancel()
		s.icyCancel = nil
	}
	if s.handle != nil {
		s.handle.Stop()
		s.handle = nil
	}
	// Try next candidate stream if available and a backend actually exists.
	if s.backend.Available() && idx+1 < len(s.streams) {
		nextIdx := idx + 1
		s.mu.Unlock()
		go s.launchCandidate(seq, nextIdx, 0)
		return
	}
	s.status = StatusFailed
	if err != nil {
		s.errMsg = err.Error()
	} else {
		s.errMsg = "stream disconnected"
	}
	snap := s.snapshotLocked()
	s.mu.Unlock()
	s.notify(snap)
}

func (s *Supervisor) pollICYLoop(ctx context.Context, seq uint64, streamURL string, kind BackendKind) {
	// If mpv IPC is running, wait slightly longer so native mpv metadata wins first.
	initialWait := 1200 * time.Millisecond
	if kind == BackendMPV {
		initialWait = 4 * time.Second
	}
	select {
	case <-ctx.Done():
		return
	case <-time.After(initialWait):
	}

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		tr, err := ProbeICY(ctx, streamURL)
		if err == nil && !tr.Empty() {
			s.mu.Lock()
			if !s.closed && seq == s.sessionSeq && tr.Display() != s.track.Display() {
				// Let mpv's own live title take priority if already populated.
				if s.track.Source != "mpv" || s.track.Empty() {
					s.track = tr
					snap := s.snapshotLocked()
					s.mu.Unlock()
					s.notify(snap)
					goto waitNext
				}
			}
			s.mu.Unlock()
		}
	waitNext:
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// SetFallbackTrack applies relay observer now-playing (31239) if direct ICY is absent.
func (s *Supervisor) SetFallbackTrack(stationAddress string, tr TrackInfo) {
	if tr.Empty() {
		return
	}
	s.mu.Lock()
	if s.station == nil || s.station.Address != stationAddress || !s.track.Empty() {
		s.mu.Unlock()
		return
	}
	s.track = tr
	snap := s.snapshotLocked()
	s.mu.Unlock()
	s.notify(snap)
}

func (s *Supervisor) TogglePause() {
	s.mu.Lock()
	if s.station == nil {
		s.mu.Unlock()
		return
	}
	if s.status == StatusPaused {
		if s.handle != nil && s.handle.SupportsLiveControl() {
			_ = s.handle.SetPaused(false)
			s.status = StatusPlaying
			snap := s.snapshotLocked()
			s.mu.Unlock()
			s.notify(snap)
			return
		}
		// Restart stream cleanly for backends without live pause.
		st := *s.station
		idx := s.streamIdx
		s.mu.Unlock()
		s.Play(st, idx)
		return
	}
	if s.status == StatusPlaying || s.status == StatusBuffering || s.status == StatusTuning {
		if s.handle != nil && s.handle.SupportsLiveControl() {
			_ = s.handle.SetPaused(true)
			s.status = StatusPaused
			snap := s.snapshotLocked()
			s.mu.Unlock()
			s.notify(snap)
			return
		}
		s.sessionSeq++
		s.stopActiveLocked()
		s.status = StatusPaused
		snap := s.snapshotLocked()
		s.mu.Unlock()
		s.notify(snap)
		return
	}
	if s.status == StatusFailed || s.status == StatusIdle {
		st := *s.station
		idx := s.streamIdx
		s.mu.Unlock()
		s.Play(st, idx)
		return
	}
	s.mu.Unlock()
}

func (s *Supervisor) Stop() {
	s.mu.Lock()
	s.sessionSeq++
	s.stopActiveLocked()
	s.status = StatusIdle
	s.track = TrackInfo{}
	s.errMsg = ""
	snap := s.snapshotLocked()
	s.mu.Unlock()
	s.notify(snap)
}

func (s *Supervisor) SetVolume(vol int) int {
	if vol < 0 {
		vol = 0
	}
	if vol > 100 {
		vol = 100
	}
	s.mu.Lock()
	s.volume = vol
	if vol > 0 && s.muted {
		s.muted = false
	}
	live := s.handle != nil && s.handle.SupportsLiveControl()
	if live {
		_ = s.handle.SetVolume(vol)
		_ = s.handle.SetMuted(s.muted)
	}
	shouldRestart := !live && (s.status == StatusPlaying || s.status == StatusBuffering) && s.station != nil
	var restartStation nostrclient.Station
	var restartIdx int
	if shouldRestart {
		restartStation = *s.station
		restartIdx = s.streamIdx
	}
	snap := s.snapshotLocked()
	s.mu.Unlock()
	s.notify(snap)
	if shouldRestart {
		s.Play(restartStation, restartIdx)
	}
	return vol
}

func (s *Supervisor) DeltaVolume(delta int) int {
	s.mu.Lock()
	cur := s.volume
	s.mu.Unlock()
	return s.SetVolume(cur + delta)
}

func (s *Supervisor) ToggleMute() bool {
	s.mu.Lock()
	s.muted = !s.muted
	muted := s.muted
	live := s.handle != nil && s.handle.SupportsLiveControl()
	if live {
		_ = s.handle.SetMuted(muted)
	}
	shouldRestart := !live && (s.status == StatusPlaying || s.status == StatusBuffering) && s.station != nil
	var restartStation nostrclient.Station
	var restartIdx int
	if shouldRestart {
		restartStation = *s.station
		restartIdx = s.streamIdx
	}
	snap := s.snapshotLocked()
	s.mu.Unlock()
	s.notify(snap)
	if shouldRestart {
		s.Play(restartStation, restartIdx)
	}
	return muted
}

// CycleSleepTimer cycles off -> 15m -> 30m -> 60m -> off.
func (s *Supervisor) CycleSleepTimer() string {
	s.mu.Lock()
	rem := time.Duration(0)
	if !s.sleepUntil.IsZero() {
		rem = time.Until(s.sleepUntil)
	}
	var next time.Duration
	switch {
	case rem <= 0:
		next = 15 * time.Minute
	case rem <= 20*time.Minute:
		next = 30 * time.Minute
	case rem <= 40*time.Minute:
		next = 60 * time.Minute
	default:
		next = 0
	}
	label := s.setSleepLocked(next)
	snap := s.snapshotLocked()
	s.mu.Unlock()
	s.notify(snap)
	return label
}

func (s *Supervisor) SetSleepDuration(d time.Duration) string {
	s.mu.Lock()
	label := s.setSleepLocked(d)
	snap := s.snapshotLocked()
	s.mu.Unlock()
	s.notify(snap)
	return label
}

func (s *Supervisor) setSleepLocked(d time.Duration) string {
	if s.sleepTimer != nil {
		s.sleepTimer.Stop()
		s.sleepTimer = nil
	}
	if d <= 0 {
		s.sleepUntil = time.Time{}
		return "Sleep timer off"
	}
	s.sleepUntil = time.Now().Add(d)
	s.sleepTimer = time.AfterFunc(d, func() {
		s.mu.Lock()
		s.sleepUntil = time.Time{}
		s.sleepTimer = nil
		s.mu.Unlock()
		s.Stop()
	})
	return fmt.Sprintf("Sleep timer set: %dm", int(d.Minutes()))
}

func (s *Supervisor) stopActiveLocked() {
	if s.icyCancel != nil {
		s.icyCancel()
		s.icyCancel = nil
	}
	if s.handle != nil {
		s.handle.Stop()
		s.handle = nil
	}
}

func (s *Supervisor) Close() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	s.sessionSeq++
	if s.sleepTimer != nil {
		s.sleepTimer.Stop()
		s.sleepTimer = nil
	}
	s.stopActiveLocked()
	s.mu.Unlock()
}
