package nostrclient

import (
	"context"
	"sync"
	"time"
)

// ListeningPublisher broadcasts opt-in NIP-38 (kind 30315 d=music) listening
// status updates, serializing signer calls and refreshing every 2 minutes while
// active. Mirrors src/lib/nostr/listeningStatus.ts.
type ListeningPublisher struct {
	client *Client

	mu       sync.Mutex
	enabled  bool
	signer   Signer
	current  *ListeningTrack
	revision uint64
	sent     bool
	lastTime int64
	stopCh   chan struct{}
	closed   bool
}

func NewListeningPublisher(client *Client) *ListeningPublisher {
	lp := &ListeningPublisher{
		client: client,
		stopCh: make(chan struct{}),
	}
	go lp.refreshLoop()
	return lp
}

func (lp *ListeningPublisher) Configure(enabled bool, signer Signer) {
	lp.mu.Lock()
	wasEnabled := lp.enabled
	prevSigner := lp.signer
	lp.enabled = enabled
	lp.signer = signer
	cur := lp.current
	lp.mu.Unlock()

	if !enabled && wasEnabled && prevSigner != nil && prevSigner.CanSign() {
		go lp.clearWith(prevSigner)
		return
	}
	if enabled && cur != nil && signer != nil && signer.CanSign() {
		lp.Update(cur)
	}
}

func (lp *ListeningPublisher) Update(track *ListeningTrack) {
	lp.mu.Lock()
	if lp.closed {
		lp.mu.Unlock()
		return
	}
	lp.revision++
	rev := lp.revision
	if track != nil {
		cp := *track
		lp.current = &cp
	} else {
		lp.current = nil
	}
	enabled := lp.enabled
	signer := lp.signer
	sent := lp.sent
	lp.mu.Unlock()

	if !enabled || signer == nil || !signer.CanSign() {
		return
	}
	if track == nil && !sent {
		return
	}
	go lp.publishRevision(rev, track, signer)
}

func (lp *ListeningPublisher) publishRevision(rev uint64, track *ListeningTrack, signer Signer) {
	lp.mu.Lock()
	if lp.closed || rev != lp.revision {
		lp.mu.Unlock()
		return
	}
	now := time.Now().Unix()
	if now <= lp.lastTime {
		now = lp.lastTime + 1
	}
	lp.lastTime = now
	lp.sent = true
	lp.mu.Unlock()

	evt := BuildListeningStatusEvent(track, now)
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if _, err := lp.client.PublishSigned(ctx, signer, evt, nil); err == nil {
		lp.mu.Lock()
		if rev == lp.revision {
			lp.sent = track != nil
		}
		lp.mu.Unlock()
	}
}

func (lp *ListeningPublisher) clearWith(signer Signer) {
	lp.mu.Lock()
	if !lp.sent {
		lp.mu.Unlock()
		return
	}
	now := time.Now().Unix()
	if now <= lp.lastTime {
		now = lp.lastTime + 1
	}
	lp.lastTime = now
	lp.mu.Unlock()

	evt := BuildListeningStatusEvent(nil, now)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := lp.client.PublishSigned(ctx, signer, evt, nil); err == nil {
		lp.mu.Lock()
		lp.sent = false
		lp.mu.Unlock()
	}
}

func (lp *ListeningPublisher) refreshLoop() {
	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-lp.stopCh:
			return
		case <-ticker.C:
			lp.mu.Lock()
			enabled := lp.enabled
			signer := lp.signer
			cur := lp.current
			rev := lp.revision
			lp.mu.Unlock()
			if enabled && cur != nil && signer != nil && signer.CanSign() {
				cp := *cur
				go lp.publishRevision(rev, &cp, signer)
			}
		}
	}
}

// Stop clears any active listening status synchronously (bounded to 3s) before exit.
func (lp *ListeningPublisher) Stop() {
	lp.mu.Lock()
	if lp.closed {
		lp.mu.Unlock()
		return
	}
	lp.closed = true
	close(lp.stopCh)
	sent := lp.sent
	signer := lp.signer
	lp.mu.Unlock()

	if sent && signer != nil && signer.CanSign() {
		now := time.Now().Unix()
		evt := BuildListeningStatusEvent(nil, now)
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_, _ = lp.client.PublishSigned(ctx, signer, evt, nil)
	}
}
