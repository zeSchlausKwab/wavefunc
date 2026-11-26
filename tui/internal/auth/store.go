package auth

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"fiatjaf.com/nostr"
	"github.com/zalando/go-keyring"

	"github.com/zeSchlausKwab/wavefunc/tui/internal/config"
)

const (
	keyringService = "live.wavefunc.wf"
	keyringUser    = "default-session"
)

// StoredCredential describes persisted metadata in credentials.json.
// When KeyringStored is true, sensitive key material lives in the OS keychain.
type StoredCredential struct {
	Mode            Mode     `json:"mode"`
	PubKeyHex       string   `json:"pubkey_hex,omitempty"`
	Npub            string   `json:"npub,omitempty"`
	KeyringStored   bool     `json:"keyring_stored,omitempty"`
	Ncryptsec       string   `json:"ncryptsec,omitempty"`
	SecretHex       string   `json:"secret_hex,omitempty"` // fallback only when keyring unavailable & no passphrase
	BunkerRemoteHex string   `json:"bunker_remote_hex,omitempty"`
	BunkerRelays    []string `json:"bunker_relays,omitempty"`
}

func keyringDisabled() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("WF_DISABLE_KEYRING")))
	return v == "1" || v == "true" || v == "yes"
}

func credentialsPath() (string, error) {
	dir, err := config.Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "credentials.json"), nil
}

// SaveSession persists the active session using OS Keychain when available,
// falling back to 0600 credentials.json (NIP-49 encrypted when passphrase set).
func SaveSession(session Session, passphrase string) error {
	if session == nil || session.Mode() == ModeGuest {
		return ClearStoredSession()
	}

	var rec StoredCredential
	rec.Mode = session.Mode()
	rec.PubKeyHex = session.PubKey().Hex()
	rec.Npub = session.Npub()

	var secretPayload string

	switch s := session.(type) {
	case *ReadOnlySession:
		// No secret to store.
	case *LocalSession:
		if passphrase != "" {
			enc, err := s.Ncryptsec(passphrase)
			if err != nil {
				return err
			}
			rec.Ncryptsec = enc
		} else {
			secretPayload = s.SecretKey().Hex()
		}
	case *BunkerSession:
		rec.BunkerRemoteHex = s.RemotePubKeyHex()
		rec.BunkerRelays = s.Relays()
		secretPayload = s.ClientSecretHex()
	default:
		return errors.New("unsupported session type")
	}

	if secretPayload != "" {
		if !keyringDisabled() {
			if err := keyring.Set(keyringService, keyringUser, secretPayload); err == nil {
				rec.KeyringStored = true
			} else {
				rec.SecretHex = secretPayload
			}
		} else {
			rec.SecretHex = secretPayload
		}
	}

	path, err := credentialsPath()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(rec, "", "  ")
	if err != nil {
		return err
	}
	return config.AtomicWriteFile(path, append(data, '\n'), 0o600)
}

// LoadStoredMetadata reads credentials.json without unlocking secrets.
func LoadStoredMetadata() (*StoredCredential, error) {
	path, err := credentialsPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	var rec StoredCredential
	if err := json.Unmarshal(data, &rec); err != nil {
		return nil, err
	}
	return &rec, nil
}

// RestoreSession loads the persisted session (using passphrase if NIP-49 encrypted).
func RestoreSession(pool *nostr.Pool, passphrase string) (Session, error) {
	rec, err := LoadStoredMetadata()
	if err != nil || rec == nil {
		return NewGuestSession(), err
	}

	switch rec.Mode {
	case ModeReadOnly:
		return ImportReadOnly(rec.Npub)
	case ModeLocalKey:
		if rec.Ncryptsec != "" {
			return ImportSecret(rec.Ncryptsec, passphrase)
		}
		secretHex := rec.SecretHex
		if rec.KeyringStored && !keyringDisabled() {
			if s, err := keyring.Get(keyringService, keyringUser); err == nil && s != "" {
				secretHex = s
			}
		}
		if secretHex == "" {
			return NewGuestSession(), errors.New("stored key unavailable in keychain")
		}
		return ImportSecret(secretHex, "")
	case ModeBunker:
		clientSecretHex := rec.SecretHex
		if rec.KeyringStored && !keyringDisabled() {
			if s, err := keyring.Get(keyringService, keyringUser); err == nil && s != "" {
				clientSecretHex = s
			}
		}
		if clientSecretHex == "" {
			return NewGuestSession(), errors.New("stored bunker key unavailable")
		}
		return RestoreBunker(pool, clientSecretHex, rec.BunkerRemoteHex, rec.PubKeyHex, rec.BunkerRelays)
	default:
		return NewGuestSession(), nil
	}
}

// ClearStoredSession removes persisted credentials from disk and OS keychain.
func ClearStoredSession() error {
	if !keyringDisabled() {
		_ = keyring.Delete(keyringService, keyringUser)
	}
	path, err := credentialsPath()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
