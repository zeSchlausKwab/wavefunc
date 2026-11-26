package player

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type BackendKind string

const (
	BackendAuto   BackendKind = "auto"
	BackendMPV    BackendKind = "mpv"
	BackendFFplay BackendKind = "ffplay"
	BackendVLC    BackendKind = "vlc"
	BackendNone   BackendKind = "none"
)

type BackendInfo struct {
	Kind BackendKind
	Path string
}

func (b BackendInfo) Available() bool {
	return b.Kind != BackendNone && b.Path != ""
}

func InstallHint() string {
	switch runtime.GOOS {
	case "darwin":
		return "brew install mpv   (or: brew install ffmpeg)"
	case "windows":
		return "winget install mpv   (or: winget install Gyan.FFmpeg)"
	default:
		return "sudo apt install mpv   (or: pacman -S mpv / dnf install mpv)"
	}
}

// DetectBackend checks installed audio players in preference order.
func DetectBackend(preferred string) BackendInfo {
	candidates := []BackendKind{BackendMPV, BackendFFplay, BackendVLC}
	switch BackendKind(strings.ToLower(strings.TrimSpace(preferred))) {
	case BackendMPV:
		candidates = []BackendKind{BackendMPV, BackendFFplay, BackendVLC}
	case BackendFFplay:
		candidates = []BackendKind{BackendFFplay, BackendMPV, BackendVLC}
	case BackendVLC:
		candidates = []BackendKind{BackendVLC, BackendMPV, BackendFFplay}
	}

	for _, kind := range candidates {
		bin := string(kind)
		if kind == BackendVLC {
			if p, err := exec.LookPath("cvlc"); err == nil {
				return BackendInfo{Kind: BackendVLC, Path: p}
			}
		}
		if p, err := exec.LookPath(bin); err == nil {
			return BackendInfo{Kind: kind, Path: p}
		}
	}
	return BackendInfo{Kind: BackendNone}
}

type BackendEventKind int

const (
	BackendEventPlaying BackendEventKind = iota
	BackendEventBuffering
	BackendEventMetadata
	BackendEventExited
)

type BackendEvent struct {
	Kind  BackendEventKind
	Track TrackInfo
	Err   error
}

type AudioHandle interface {
	Kind() BackendKind
	SupportsLiveControl() bool
	SetVolume(vol int) error
	SetMuted(muted bool) error
	SetPaused(paused bool) error
	Stop()
	Events() <-chan BackendEvent
}

var sockSeq atomic.Uint64

func startBackend(info BackendInfo, streamURL string, volume int, muted bool) (AudioHandle, error) {
	if !info.Available() {
		return nil, fmt.Errorf("no audio player found; install one with: %s", InstallHint())
	}
	switch info.Kind {
	case BackendMPV:
		return startMPV(info.Path, streamURL, volume, muted)
	case BackendFFplay:
		return startFFplay(info.Path, streamURL, volume, muted)
	case BackendVLC:
		return startVLC(info.Path, streamURL, volume, muted)
	default:
		return nil, errors.New("unsupported audio backend")
	}
}

// --- mpv backend (preferred, full live JSON IPC) ---

type mpvHandle struct {
	cmd      *exec.Cmd
	sockPath string
	events   chan BackendEvent

	mu     sync.Mutex
	conn   net.Conn
	closed bool
}

func startMPV(binPath, streamURL string, volume int, muted bool) (*mpvHandle, error) {
	args := []string{
		"--no-video",
		"--no-terminal",
		"--idle=no",
		"--really-quiet",
		"--cache=yes",
		"--demuxer-max-bytes=4MiB",
		fmt.Sprintf("--volume=%d", volume),
	}
	if muted {
		args = append(args, "--mute=yes")
	}

	var sockPath string
	if runtime.GOOS != "windows" {
		sockPath = filepath.Join(os.TempDir(), fmt.Sprintf("wf-mpv-%d-%d.sock", os.Getpid(), sockSeq.Add(1)))
		_ = os.Remove(sockPath)
		args = append(args, "--input-ipc-server="+sockPath)
	}
	args = append(args, streamURL)

	cmd := exec.Command(binPath, args...)
	configureProcGroup(cmd)
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	h := &mpvHandle{
		cmd:      cmd,
		sockPath: sockPath,
		events:   make(chan BackendEvent, 16),
	}

	go h.watchProcess()
	if sockPath != "" {
		go h.connectIPC()
	} else {
		go func() {
			time.Sleep(1200 * time.Millisecond)
			h.emit(BackendEvent{Kind: BackendEventPlaying})
		}()
	}
	return h, nil
}

func (h *mpvHandle) Kind() BackendKind         { return BackendMPV }
func (h *mpvHandle) SupportsLiveControl() bool { return h.sockPath != "" }
func (h *mpvHandle) Events() <-chan BackendEvent {
	return h.events
}

func (h *mpvHandle) emit(ev BackendEvent) {
	h.mu.Lock()
	closed := h.closed
	h.mu.Unlock()
	if closed {
		return
	}
	select {
	case h.events <- ev:
	default:
	}
}

func (h *mpvHandle) watchProcess() {
	err := h.cmd.Wait()
	h.mu.Lock()
	wasClosed := h.closed
	if h.conn != nil {
		_ = h.conn.Close()
		h.conn = nil
	}
	h.mu.Unlock()
	if h.sockPath != "" {
		_ = os.Remove(h.sockPath)
	}
	if !wasClosed {
		h.emit(BackendEvent{Kind: BackendEventExited, Err: err})
	}
}

func (h *mpvHandle) connectIPC() {
	var conn net.Conn
	var err error
	for i := 0; i < 30; i++ {
		h.mu.Lock()
		closed := h.closed
		h.mu.Unlock()
		if closed {
			return
		}
		conn, err = net.DialTimeout("unix", h.sockPath, 200*time.Millisecond)
		if err == nil {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if err != nil || conn == nil {
		h.emit(BackendEvent{Kind: BackendEventPlaying})
		return
	}

	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		_ = conn.Close()
		return
	}
	h.conn = conn
	h.mu.Unlock()

	_ = h.sendIPC([]any{"observe_property", 1, "media-title"})
	_ = h.sendIPC([]any{"observe_property", 2, "core-idle"})
	_ = h.sendIPC([]any{"observe_property", 3, "paused-for-cache"})

	scanner := bufio.NewScanner(conn)
	scanner.Buffer(make([]byte, 0, 16*1024), 128*1024)
	for scanner.Scan() {
		var msg struct {
			Event string `json:"event"`
			Name  string `json:"name"`
			Data  any    `json:"data"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &msg); err != nil {
			continue
		}
		switch msg.Event {
		case "file-loaded", "playback-restart":
			h.emit(BackendEvent{Kind: BackendEventPlaying})
		case "property-change":
			switch msg.Name {
			case "media-title":
				if title, ok := msg.Data.(string); ok && title != "" {
					if tr := ParseStreamTitle(title, "mpv"); !tr.Empty() {
						h.emit(BackendEvent{Kind: BackendEventMetadata, Track: tr})
					}
				}
			case "paused-for-cache":
				if buffering, ok := msg.Data.(bool); ok {
					if buffering {
						h.emit(BackendEvent{Kind: BackendEventBuffering})
					} else {
						h.emit(BackendEvent{Kind: BackendEventPlaying})
					}
				}
			case "core-idle":
				if idle, ok := msg.Data.(bool); ok && !idle {
					h.emit(BackendEvent{Kind: BackendEventPlaying})
				}
			}
		}
	}
}

func (h *mpvHandle) sendIPC(cmd []any) error {
	h.mu.Lock()
	conn := h.conn
	h.mu.Unlock()
	if conn == nil {
		return errors.New("mpv ipc not ready")
	}
	payload, err := json.Marshal(map[string]any{"command": cmd})
	if err != nil {
		return err
	}
	payload = append(payload, '\n')
	_ = conn.SetWriteDeadline(time.Now().Add(500 * time.Millisecond))
	_, err = conn.Write(payload)
	return err
}

func (h *mpvHandle) SetVolume(vol int) error {
	return h.sendIPC([]any{"set_property", "volume", vol})
}

func (h *mpvHandle) SetMuted(muted bool) error {
	return h.sendIPC([]any{"set_property", "mute", muted})
}

func (h *mpvHandle) SetPaused(paused bool) error {
	return h.sendIPC([]any{"set_property", "pause", paused})
}

func (h *mpvHandle) Stop() {
	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		return
	}
	h.closed = true
	conn := h.conn
	h.conn = nil
	h.mu.Unlock()

	if conn != nil {
		_ = conn.Close()
	}
	killProcGroup(h.cmd)
	if h.sockPath != "" {
		_ = os.Remove(h.sockPath)
	}
}

// --- ffplay backend (works out-of-the-box whenever ffmpeg is installed) ---

type ffplayHandle struct {
	cmd    *exec.Cmd
	events chan BackendEvent

	mu     sync.Mutex
	closed bool
}

var ffplayTitleRe = regexp.MustCompile(`(?i)StreamTitle\s*:\s*(.+)`)

func startFFplay(binPath, streamURL string, volume int, muted bool) (*ffplayHandle, error) {
	vol := volume
	if muted {
		vol = 0
	}
	args := []string{
		"-nodisp",
		"-autoexit",
		"-loglevel", "info",
		"-volume", strconv.Itoa(vol),
		streamURL,
	}
	cmd := exec.Command(binPath, args...)
	configureProcGroup(cmd)
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	h := &ffplayHandle{
		cmd:    cmd,
		events: make(chan BackendEvent, 16),
	}

	go func() {
		scanner := bufio.NewScanner(stderr)
		scanner.Buffer(make([]byte, 0, 16*1024), 128*1024)
		playingSignaled := false
		for scanner.Scan() {
			line := scanner.Text()
			if !playingSignaled && (strings.Contains(line, "Audio:") || strings.Contains(line, "aq=")) {
				playingSignaled = true
				h.emit(BackendEvent{Kind: BackendEventPlaying})
			}
			if m := ffplayTitleRe.FindStringSubmatch(line); len(m) >= 2 {
				if tr := ParseStreamTitle(m[1], "ffplay"); !tr.Empty() {
					h.emit(BackendEvent{Kind: BackendEventMetadata, Track: tr})
				}
			}
		}
	}()

	go func() {
		time.Sleep(1800 * time.Millisecond)
		h.emit(BackendEvent{Kind: BackendEventPlaying})
	}()

	go func() {
		err := cmd.Wait()
		h.mu.Lock()
		wasClosed := h.closed
		h.mu.Unlock()
		if !wasClosed {
			h.emit(BackendEvent{Kind: BackendEventExited, Err: err})
		}
	}()

	return h, nil
}

func (h *ffplayHandle) Kind() BackendKind         { return BackendFFplay }
func (h *ffplayHandle) SupportsLiveControl() bool { return false }
func (h *ffplayHandle) Events() <-chan BackendEvent {
	return h.events
}
func (h *ffplayHandle) SetVolume(_ int) error  { return errors.New("restart required") }
func (h *ffplayHandle) SetMuted(_ bool) error  { return errors.New("restart required") }
func (h *ffplayHandle) SetPaused(_ bool) error { return errors.New("restart required") }

func (h *ffplayHandle) emit(ev BackendEvent) {
	h.mu.Lock()
	closed := h.closed
	h.mu.Unlock()
	if closed {
		return
	}
	select {
	case h.events <- ev:
	default:
	}
}

func (h *ffplayHandle) Stop() {
	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		return
	}
	h.closed = true
	h.mu.Unlock()
	killProcGroup(h.cmd)
}

// --- vlc / cvlc backend ---

type vlcHandle struct {
	cmd    *exec.Cmd
	events chan BackendEvent

	mu     sync.Mutex
	closed bool
}

func startVLC(binPath, streamURL string, volume int, muted bool) (*vlcHandle, error) {
	gain := float64(volume) / 100.0
	if muted {
		gain = 0
	}
	args := []string{
		"--intf", "dummy",
		"--no-video",
		"--quiet",
		fmt.Sprintf("--gain=%.2f", gain),
		streamURL,
	}
	cmd := exec.Command(binPath, args...)
	configureProcGroup(cmd)
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	h := &vlcHandle{
		cmd:    cmd,
		events: make(chan BackendEvent, 8),
	}

	go func() {
		time.Sleep(1500 * time.Millisecond)
		h.emit(BackendEvent{Kind: BackendEventPlaying})
	}()
	go func() {
		err := cmd.Wait()
		h.mu.Lock()
		wasClosed := h.closed
		h.mu.Unlock()
		if !wasClosed {
			h.emit(BackendEvent{Kind: BackendEventExited, Err: err})
		}
	}()
	return h, nil
}

func (h *vlcHandle) Kind() BackendKind           { return BackendVLC }
func (h *vlcHandle) SupportsLiveControl() bool   { return false }
func (h *vlcHandle) Events() <-chan BackendEvent { return h.events }
func (h *vlcHandle) SetVolume(_ int) error       { return errors.New("restart required") }
func (h *vlcHandle) SetMuted(_ bool) error       { return errors.New("restart required") }
func (h *vlcHandle) SetPaused(_ bool) error      { return errors.New("restart required") }

func (h *vlcHandle) emit(ev BackendEvent) {
	h.mu.Lock()
	closed := h.closed
	h.mu.Unlock()
	if closed {
		return
	}
	select {
	case h.events <- ev:
	default:
	}
}

func (h *vlcHandle) Stop() {
	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		return
	}
	h.closed = true
	h.mu.Unlock()
	killProcGroup(h.cmd)
}
