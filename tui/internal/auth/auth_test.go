package auth

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"fiatjaf.com/nostr"
)

func TestGenerateAndImportSecrets(t *testing.T) {
	acct := GenerateAccount()
	if acct.Mode() != ModeLocalKey || !acct.CanSign() {
		t.Fatalf("expected signable local account")
	}
	if !strings.HasPrefix(acct.Npub(), "npub1") || !strings.HasPrefix(acct.Nsec(), "nsec1") {
		t.Fatalf("unexpected bech32 encodings: %s / %s", acct.Npub(), acct.Nsec())
	}

	// Import from nsec.
	fromNsec, err := ImportSecret(acct.Nsec(), "")
	if err != nil || fromNsec.PubKey() != acct.PubKey() {
		t.Fatalf("ImportSecret(nsec) failed: err=%v", err)
	}

	// NIP-49 encrypt/decrypt round-trip.
	enc, err := acct.Ncryptsec("radio-wave-pass")
	if err != nil || !strings.HasPrefix(enc, "ncryptsec1") {
		t.Fatalf("Ncryptsec failed: %v", err)
	}
	if _, err := ImportSecret(enc, ""); !errors.Is(err, ErrPassphraseRequired) {
		t.Fatalf("expected ErrPassphraseRequired, got %v", err)
	}
	fromEnc, err := ImportSecret(enc, "radio-wave-pass")
	if err != nil || fromEnc.PubKey() != acct.PubKey() {
		t.Fatalf("ImportSecret(ncryptsec) failed: %v", err)
	}

	// Signing works and verifies.
	evt := nostr.Event{Kind: 1, CreatedAt: nostr.Now(), Content: "hello"}
	if err := acct.SignEvent(context.Background(), &evt); err != nil {
		t.Fatalf("SignEvent failed: %v", err)
	}
	if !evt.VerifySignature() {
		t.Fatal("signed event failed signature verification")
	}
}

func TestReadOnlySessionCannotSign(t *testing.T) {
	acct := GenerateAccount()
	ro, err := ImportReadOnly(acct.Npub())
	if err != nil {
		t.Fatalf("ImportReadOnly failed: %v", err)
	}
	if ro.CanSign() || ro.Mode() != ModeReadOnly || ro.PubKey() != acct.PubKey() {
		t.Fatalf("unexpected readonly session: %+v", ro)
	}
	evt := nostr.Event{Kind: 1}
	if err := ro.SignEvent(context.Background(), &evt); err == nil {
		t.Fatal("expected readonly SignEvent to fail")
	}
}

func TestCredentialPersistenceFallback(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("WF_CONFIG_DIR", dir)
	t.Setenv("WF_DISABLE_KEYRING", "1")

	acct := GenerateAccount()
	if err := SaveSession(acct, "test-pass"); err != nil {
		t.Fatalf("SaveSession failed: %v", err)
	}

	info, err := os.Stat(filepath.Join(dir, "credentials.json"))
	if err != nil {
		t.Fatalf("stat credentials.json: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Fatalf("expected 0600 perms, got %o", perm)
	}

	// Encrypted file needs passphrase.
	if _, err := RestoreSession(nil, ""); !errors.Is(err, ErrPassphraseRequired) {
		t.Fatalf("expected ErrPassphraseRequired, got %v", err)
	}
	restored, err := RestoreSession(nil, "test-pass")
	if err != nil || restored.PubKey() != acct.PubKey() {
		t.Fatalf("RestoreSession failed: err=%v", err)
	}

	if err := ClearStoredSession(); err != nil {
		t.Fatalf("ClearStoredSession failed: %v", err)
	}
	after, err := RestoreSession(nil, "")
	if err != nil || after.Mode() != ModeGuest {
		t.Fatalf("expected guest after clear, got mode=%s err=%v", after.Mode(), err)
	}
}

func TestPrepareNostrConnectURI(t *testing.T) {
	pairing, err := PrepareNostrConnect(context.Background(), nil, []string{"wss://relay.nsec.app"})
	if err != nil {
		t.Fatalf("PrepareNostrConnect failed: %v", err)
	}
	if !strings.HasPrefix(pairing.URI, "nostrconnect://") {
		t.Fatalf("unexpected URI: %s", pairing.URI)
	}
	if !strings.Contains(pairing.URI, "secret="+pairing.Secret) || !strings.Contains(pairing.URI, "name=wf") {
		t.Fatalf("URI missing expected params: %s", pairing.URI)
	}
}
