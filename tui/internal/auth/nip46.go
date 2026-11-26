package auth

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"net/url"
	"strings"
	"time"

	"fiatjaf.com/nostr"
	"fiatjaf.com/nostr/nip19"
	"fiatjaf.com/nostr/nip46"
)

var DefaultNIP46Permissions = []string{
	"sign_event:0",
	"sign_event:1",
	"sign_event:5",
	"sign_event:7",
	"sign_event:1111",
	"sign_event:30078",
	"sign_event:30315",
	"sign_event:31337",
}

// BunkerSession signs events remotely via NIP-46 without storing the user's
// private key on this machine.
type BunkerSession struct {
	bunker       *nip46.BunkerClient
	clientSecret nostr.SecretKey
	remotePubKey nostr.PubKey
	userPubKey   nostr.PubKey
	npub         string
	relays       []string
	cancel       context.CancelFunc
}

func (b *BunkerSession) Mode() Mode           { return ModeBunker }
func (b *BunkerSession) PubKey() nostr.PubKey { return b.userPubKey }
func (b *BunkerSession) Npub() string         { return b.npub }
func (b *BunkerSession) CanSign() bool        { return true }
func (b *BunkerSession) Relays() []string     { return append([]string(nil), b.relays...) }
func (b *BunkerSession) ClientSecretHex() string {
	return b.clientSecret.Hex()
}
func (b *BunkerSession) RemotePubKeyHex() string {
	return b.remotePubKey.Hex()
}

func (b *BunkerSession) SignEvent(ctx context.Context, evt *nostr.Event) error {
	if b.bunker == nil {
		return errors.New("bunker connection is closed")
	}
	evt.PubKey = b.userPubKey
	sctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	return b.bunker.SignEvent(sctx, evt)
}

func (b *BunkerSession) Close() error {
	if b.cancel != nil {
		b.cancel()
	}
	return nil
}

// NostrConnectPairing holds an active nostrconnect:// QR pairing attempt.
type NostrConnectPairing struct {
	URI          string
	Secret       string
	Relays       []string
	ClientSecret nostr.SecretKey
	pool         *nostr.Pool
}

const base62Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

func randomBase62(length int) (string, error) {
	max := big.NewInt(int64(len(base62Alphabet)))
	out := make([]byte, length)
	for i := 0; i < length; i++ {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		out[i] = base62Alphabet[n.Int64()]
	}
	return string(out), nil
}

// PrepareNostrConnect generates a compact, standard NIP-46 nostrconnect:// URI
// (<=134 bytes → QR Version 6, 41x41 modules → 43x22 terminal cells) so the
// QR scans reliably even inside a standard 80x24 terminal window.
func PrepareNostrConnect(_ context.Context, pool *nostr.Pool, relays []string) (*NostrConnectPairing, error) {
	if len(relays) == 0 {
		relays = []string{"wss://relay.nsec.app"}
	}
	qrRelay := strings.TrimSpace(relays[0])
	if qrRelay == "" {
		qrRelay = "wss://relay.nsec.app"
	}

	clientSK := nostr.Generate()
	// 12 base62 characters ≈ 71.4 bits of cryptographic entropy.
	secret, err := randomBase62(12)
	if err != nil {
		return nil, fmt.Errorf("generate connect secret: %w", err)
	}

	// Per RFC 3986 §3.4, ":" and "/" are valid unescaped in query strings and
	// accepted by url.Parse / JS URL / Amber / Primal, saving 6 bytes so the
	// URI stays within QR Version 6 capacity.
	connectURL := fmt.Sprintf(
		"nostrconnect://%s?relay=%s&secret=%s&name=wf",
		clientSK.Public().Hex(),
		qrRelay,
		secret,
	)
	if _, err := url.Parse(connectURL); err != nil {
		return nil, err
	}
	return &NostrConnectPairing{
		URI:          connectURL,
		Secret:       secret,
		Relays:       []string{qrRelay},
		ClientSecret: clientSK,
		pool:         pool,
	}, nil
}

// Wait blocks until the remote signer acknowledges the QR pairing or ctx expires.
func (p *NostrConnectPairing) Wait(ctx context.Context) (*BunkerSession, error) {
	bunkerCtx, cancel := context.WithCancel(context.Background())

	// Wait using caller ctx for cancellation/deadline, then bind the long-lived
	// bunker listener to bunkerCtx once connected.
	type result struct {
		bunker *nip46.BunkerClient
		err    error
	}
	waitCtx, waitCancel := context.WithCancel(ctx)
	defer waitCancel()

	bunker, err := nip46.NewBunkerFromNostrConnect(waitCtx, p.ClientSecret, p.Relays, p.Secret, p.pool)
	if err != nil {
		cancel()
		return nil, fmt.Errorf("nostrconnect pairing failed: %w", err)
	}

	pkCtx, pkCancel := context.WithTimeout(ctx, 15*time.Second)
	defer pkCancel()
	userPK, err := bunker.GetPublicKey(pkCtx)
	if err != nil {
		cancel()
		return nil, fmt.Errorf("fetch remote pubkey: %w", err)
	}

	relays := bunker.Relays
	if len(relays) == 0 {
		relays = p.Relays
	}

	// Re-anchor a clean long-lived bunker listener so waitCancel doesn't tear it down.
	liveBunker := nip46.NewBunker(bunkerCtx, p.ClientSecret, userPK, relays, p.pool, func(string) {})
	return &BunkerSession{
		bunker:       liveBunker,
		clientSecret: p.ClientSecret,
		remotePubKey: userPK,
		userPubKey:   userPK,
		npub:         nip19.EncodeNpub(userPK),
		relays:       relays,
		cancel:       cancel,
	}, nil
}

// ConnectBunker establishes a NIP-46 session from a bunker:// URI (or NIP-05).
func ConnectBunker(ctx context.Context, pool *nostr.Pool, bunkerURI string) (*BunkerSession, error) {
	trimmed := strings.TrimSpace(bunkerURI)
	if trimmed == "" {
		return nil, errors.New("enter a bunker:// URI")
	}
	clientSK := nostr.Generate()
	parsed, err := nip46.ParseBunkerInput(ctx, trimmed)
	if err != nil {
		return nil, err
	}
	bunkerCtx, cancel := context.WithCancel(context.Background())
	bunker, err := nip46.ConnectBunker(bunkerCtx, clientSK, trimmed, pool, func(string) {})
	if err != nil {
		cancel()
		return nil, fmt.Errorf("bunker connect failed: %w", err)
	}
	pkCtx, pkCancel := context.WithTimeout(ctx, 15*time.Second)
	defer pkCancel()
	userPK, err := bunker.GetPublicKey(pkCtx)
	if err != nil {
		cancel()
		return nil, fmt.Errorf("bunker get_public_key failed: %w", err)
	}
	relays := bunker.Relays
	if len(relays) == 0 {
		relays = parsed.Relays
	}
	return &BunkerSession{
		bunker:       bunker,
		clientSecret: clientSK,
		remotePubKey: parsed.HostPubKey,
		userPubKey:   userPK,
		npub:         nip19.EncodeNpub(userPK),
		relays:       relays,
		cancel:       cancel,
	}, nil
}

// RestoreBunker reconnects a previously paired bunker session from persisted state.
func RestoreBunker(pool *nostr.Pool, clientSecretHex, remotePubKeyHex, userPubKeyHex string, relays []string) (*BunkerSession, error) {
	clientSK, err := nostr.SecretKeyFromHex(clientSecretHex)
	if err != nil {
		return nil, fmt.Errorf("stored bunker client key: %w", err)
	}
	remotePK, err := nostr.PubKeyFromHex(remotePubKeyHex)
	if err != nil {
		return nil, fmt.Errorf("stored bunker remote key: %w", err)
	}
	userPK := remotePK
	if userPubKeyHex != "" {
		if parsed, err := nostr.PubKeyFromHex(userPubKeyHex); err == nil {
			userPK = parsed
		}
	}
	if len(relays) == 0 {
		return nil, errors.New("stored bunker has no relays")
	}
	bunkerCtx, cancel := context.WithCancel(context.Background())
	bunker := nip46.NewBunker(bunkerCtx, clientSK, remotePK, relays, pool, func(string) {})
	return &BunkerSession{
		bunker:       bunker,
		clientSecret: clientSK,
		remotePubKey: remotePK,
		userPubKey:   userPK,
		npub:         nip19.EncodeNpub(userPK),
		relays:       relays,
		cancel:       cancel,
	}, nil
}
