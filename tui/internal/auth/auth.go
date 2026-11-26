package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"fiatjaf.com/nostr"
	"fiatjaf.com/nostr/nip19"
	"fiatjaf.com/nostr/nip49"
)

type Mode string

const (
	ModeGuest    Mode = "guest"
	ModeLocalKey Mode = "local"
	ModeBunker   Mode = "bunker"
	ModeReadOnly Mode = "readonly"
)

// Session represents an active user identity (or guest session) in wf.
type Session interface {
	Mode() Mode
	PubKey() nostr.PubKey
	Npub() string
	CanSign() bool
	SignEvent(ctx context.Context, evt *nostr.Event) error
	Close() error
}

// --- Guest Session ---

type GuestSession struct{}

func NewGuestSession() *GuestSession { return &GuestSession{} }

func (*GuestSession) Mode() Mode                                       { return ModeGuest }
func (*GuestSession) PubKey() nostr.PubKey                             { return nostr.ZeroPK }
func (*GuestSession) Npub() string                                     { return "" }
func (*GuestSession) CanSign() bool                                    { return false }
func (*GuestSession) Close() error                                     { return nil }
func (*GuestSession) SignEvent(_ context.Context, _ *nostr.Event) error {
	return errors.New("guest session cannot sign events; press 'a' to sign in")
}

// --- Read-Only Session (npub) ---

type ReadOnlySession struct {
	pk   nostr.PubKey
	npub string
}

func NewReadOnlySession(pk nostr.PubKey) *ReadOnlySession {
	return &ReadOnlySession{
		pk:   pk,
		npub: nip19.EncodeNpub(pk),
	}
}

func ImportReadOnly(input string) (*ReadOnlySession, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return nil, errors.New("enter an npub or 64-character hex public key")
	}
	if strings.HasPrefix(trimmed, "npub1") {
		prefix, val, err := nip19.Decode(trimmed)
		if err != nil {
			return nil, fmt.Errorf("invalid npub: %w", err)
		}
		if prefix != "npub" {
			return nil, fmt.Errorf("expected npub, got %s", prefix)
		}
		pk, ok := val.(nostr.PubKey)
		if !ok {
			return nil, errors.New("unexpected decoded npub payload")
		}
		return NewReadOnlySession(pk), nil
	}
	pk, err := nostr.PubKeyFromHex(trimmed)
	if err != nil {
		return nil, fmt.Errorf("invalid public key: %w", err)
	}
	return NewReadOnlySession(pk), nil
}

func (s *ReadOnlySession) Mode() Mode           { return ModeReadOnly }
func (s *ReadOnlySession) PubKey() nostr.PubKey { return s.pk }
func (s *ReadOnlySession) Npub() string         { return s.npub }
func (s *ReadOnlySession) CanSign() bool        { return false }
func (s *ReadOnlySession) Close() error         { return nil }
func (s *ReadOnlySession) SignEvent(_ context.Context, _ *nostr.Event) error {
	return errors.New("read-only npub session cannot sign; sign in with NIP-46 or nsec to write")
}

// --- Local Key Session (generated or imported nsec / ncryptsec) ---

type LocalSession struct {
	sk   nostr.SecretKey
	pk   nostr.PubKey
	npub string
}

func NewLocalSession(sk nostr.SecretKey) *LocalSession {
	pk := sk.Public()
	return &LocalSession{
		sk:   sk,
		pk:   pk,
		npub: nip19.EncodeNpub(pk),
	}
}

func GenerateAccount() *LocalSession {
	return NewLocalSession(nostr.Generate())
}

// ImportSecret parses nsec1..., ncryptsec1... (with passphrase), or 64-char hex.
func ImportSecret(input, passphrase string) (*LocalSession, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return nil, errors.New("enter an nsec, ncryptsec, or 64-character hex key")
	}
	switch {
	case strings.HasPrefix(trimmed, "ncryptsec1"):
		if passphrase == "" {
			return nil, ErrPassphraseRequired
		}
		sk, err := nip49.Decrypt(trimmed, passphrase)
		if err != nil {
			return nil, fmt.Errorf("decrypt ncryptsec: %w", err)
		}
		return NewLocalSession(sk), nil
	case strings.HasPrefix(trimmed, "nsec1"):
		prefix, val, err := nip19.Decode(trimmed)
		if err != nil {
			return nil, fmt.Errorf("invalid nsec: %w", err)
		}
		if prefix != "nsec" {
			return nil, fmt.Errorf("expected nsec, got %s", prefix)
		}
		sk, ok := val.(nostr.SecretKey)
		if !ok {
			return nil, errors.New("unexpected decoded nsec payload")
		}
		return NewLocalSession(sk), nil
	default:
		sk, err := nostr.SecretKeyFromHex(trimmed)
		if err != nil {
			return nil, fmt.Errorf("invalid secret key: %w", err)
		}
		return NewLocalSession(sk), nil
	}
}

func (s *LocalSession) Mode() Mode           { return ModeLocalKey }
func (s *LocalSession) PubKey() nostr.PubKey { return s.pk }
func (s *LocalSession) Npub() string         { return s.npub }
func (s *LocalSession) CanSign() bool        { return true }
func (s *LocalSession) Close() error         { return nil }
func (s *LocalSession) SecretKey() nostr.SecretKey {
	return s.sk
}
func (s *LocalSession) Nsec() string {
	return nip19.EncodeNsec(s.sk)
}
func (s *LocalSession) Ncryptsec(passphrase string) (string, error) {
	if passphrase == "" {
		return "", errors.New("passphrase required for NIP-49 encryption")
	}
	return nip49.Encrypt(s.sk, passphrase, 16, nip49.KnownToHaveBeenHandledInsecurely)
}
func (s *LocalSession) SignEvent(_ context.Context, evt *nostr.Event) error {
	evt.PubKey = s.pk
	return evt.Sign(s.sk)
}

var ErrPassphraseRequired = errors.New("passphrase required to unlock encrypted key")
