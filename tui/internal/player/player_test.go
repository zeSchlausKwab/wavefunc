package player

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	nostrclient "github.com/zeSchlausKwab/wavefunc/tui/internal/nostr"
)

func TestProbeICYStreamMetadata(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Icy-MetaData") != "1" {
			t.Errorf("expected Icy-MetaData: 1 header")
		}
		w.Header().Set("icy-metaint", "16")
		w.WriteHeader(http.StatusOK)
		// 16 bytes of dummy audio payload
		_, _ = w.Write(bytes.Repeat([]byte{0xAA}, 16))
		// ICY metadata block (padded to multiple of 16)
		meta := []byte("StreamTitle='Miles Davis - So What';")
		blocks := (len(meta) + 15) / 16
		padded := make([]byte, blocks*16)
		copy(padded, meta)
		_, _ = w.Write([]byte{byte(blocks)})
		_, _ = w.Write(padded)
	}))
	defer srv.Close()

	tr, err := ProbeICY(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("ProbeICY failed: %v", err)
	}
	if tr.Artist != "Miles Davis" || tr.Song != "So What" || tr.Display() != "Miles Davis — So What" {
		t.Fatalf("unexpected track: %+v", tr)
	}
}

func TestOrderStreamsPrioritizesPrimaryHTTPSBitrate(t *testing.T) {
	streams := []nostrclient.Stream{
		{URL: "http://example.com/low.mp3", Quality: nostrclient.StreamQuality{Bitrate: 64000}},
		{URL: "https://example.com/high.aac", Quality: nostrclient.StreamQuality{Bitrate: 192000}},
		{URL: "https://example.com/primary.mp3", Primary: true, Quality: nostrclient.StreamQuality{Bitrate: 128000}},
		{URL: "https://example.com/mid.mp3", Quality: nostrclient.StreamQuality{Bitrate: 128000}},
	}
	ordered := OrderStreams(streams)
	if ordered[0].URL != "https://example.com/primary.mp3" {
		t.Fatalf("expected primary first, got %s", ordered[0].URL)
	}
	if ordered[1].URL != "https://example.com/high.aac" {
		t.Fatalf("expected highest HTTPS bitrate second, got %s", ordered[1].URL)
	}
	if ordered[3].URL != "http://example.com/low.mp3" {
		t.Fatalf("expected HTTP stream last, got %s", ordered[3].URL)
	}
}

type fakeHandle struct {
	events chan BackendEvent
}

func (f *fakeHandle) Kind() BackendKind           { return BackendMPV }
func (f *fakeHandle) SupportsLiveControl() bool   { return true }
func (f *fakeHandle) SetVolume(_ int) error       { return nil }
func (f *fakeHandle) SetMuted(_ bool) error       { return nil }
func (f *fakeHandle) SetPaused(_ bool) error      { return nil }
func (f *fakeHandle) Stop()                       {}
func (f *fakeHandle) Events() <-chan BackendEvent { return f.events }

func TestSupervisorCandidateFallbackAndSleepTimer(t *testing.T) {
	sup := NewSupervisor("auto", 75)
	defer sup.Close()
	sup.backend = BackendInfo{Kind: BackendMPV, Path: "/fake/mpv"}

	attempts := 0
	sup.startRunner = func(_ BackendInfo, url string, _ int, _ bool) (AudioHandle, error) {
		attempts++
		if attempts == 1 {
			return nil, errors.New("connection refused")
		}
		h := &fakeHandle{events: make(chan BackendEvent, 4)}
		h.events <- BackendEvent{Kind: BackendEventPlaying}
		return h, nil
	}

	st := nostrclient.Station{
		Address: "31237:abc:test",
		Name:    "Test FM",
		Streams: []nostrclient.Stream{
			{URL: "https://dead.example/stream", Primary: true},
			{URL: "https://live.example/stream"},
		},
	}
	sup.Play(st, 0)

	deadline := time.After(2 * time.Second)
	for {
		select {
		case snap := <-sup.Updates():
			if snap.Status == StatusPlaying {
				if snap.StreamIndex != 1 {
					t.Fatalf("expected fallback to index 1, got %d", snap.StreamIndex)
				}
				goto sleepCheck
			}
		case <-deadline:
			t.Fatalf("timed out waiting for fallback playback, status=%s", sup.Snapshot().Status)
		}
	}

sleepCheck:
	sup.SetSleepDuration(80 * time.Millisecond)
	time.Sleep(180 * time.Millisecond)
	if sup.Snapshot().Status != StatusIdle {
		t.Fatalf("expected sleep timer to stop playback, got %s", sup.Snapshot().Status)
	}
}
