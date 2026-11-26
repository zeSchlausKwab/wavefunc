package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	DefaultAppRelay   = "wss://relay.wavefunc.live"
	ThemeSonicDark    = "sonic-dark"
	ThemePaperLight   = "constructivist-paper"
	BackendAuto       = "auto"
	MaxHistoryEntries = 50
)

// Config holds persisted user preferences for the WaveFunc TUI.
type Config struct {
	OnboardingCompleted bool     `json:"onboarding_completed"`
	Theme               string   `json:"theme"`
	AppRelay            string   `json:"app_relay"`
	PreferredBackend    string   `json:"preferred_backend"`
	Volume              int      `json:"volume"`
	NIP38Broadcast      bool     `json:"nip38_broadcast"`
	LastStationAddress  string   `json:"last_station_address,omitempty"`
	StarterGenres       []string `json:"starter_genres,omitempty"`
}

// HistoryEntry records a recently played station.
type HistoryEntry struct {
	Address     string   `json:"address"`
	Name        string   `json:"name"`
	CountryCode string   `json:"country_code,omitempty"`
	Genres      []string `json:"genres,omitempty"`
	PlayedAt    int64    `json:"played_at"`
}

// DefaultConfig returns sensible defaults for a fresh installation.
func DefaultConfig() Config {
	return Config{
		OnboardingCompleted: false,
		Theme:               ThemeSonicDark,
		AppRelay:            DefaultAppRelay,
		PreferredBackend:    BackendAuto,
		Volume:              80,
		NIP38Broadcast:      false,
	}
}

// Dir resolves the WaveFunc config directory (respecting WF_CONFIG_DIR for tests/overrides).
func Dir() (string, error) {
	if override := strings.TrimSpace(os.Getenv("WF_CONFIG_DIR")); override != "" {
		return override, nil
	}
	base, err := os.UserConfigDir()
	if err != nil {
		home, herr := os.UserHomeDir()
		if herr != nil {
			return "", err
		}
		base = filepath.Join(home, ".config")
	}
	return filepath.Join(base, "wavefunc"), nil
}

// ConfigPath returns the full path to config.json.
func ConfigPath() (string, error) {
	dir, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.json"), nil
}

// HistoryPath returns the full path to history.json.
func HistoryPath() (string, error) {
	dir, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "history.json"), nil
}

// Load reads config.json, returning DefaultConfig and exists=false when absent.
func Load() (Config, bool, error) {
	cfg := DefaultConfig()
	path, err := ConfigPath()
	if err != nil {
		return cfg, false, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return cfg, false, nil
		}
		return cfg, false, err
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return DefaultConfig(), false, err
	}
	cfg.normalize()
	return cfg, true, nil
}

// Save atomically persists config.json with 0600 permissions.
func Save(cfg Config) error {
	cfg.normalize()
	path, err := ConfigPath()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return AtomicWriteFile(path, append(data, '\n'), 0o600)
}

func (c *Config) normalize() {
	if c.Theme != ThemeSonicDark && c.Theme != ThemePaperLight {
		c.Theme = ThemeSonicDark
	}
	if strings.TrimSpace(c.AppRelay) == "" {
		c.AppRelay = DefaultAppRelay
	}
	switch c.PreferredBackend {
	case BackendAuto, "mpv", "ffplay", "vlc":
	default:
		c.PreferredBackend = BackendAuto
	}
	if c.Volume < 0 {
		c.Volume = 0
	}
	if c.Volume > 100 {
		c.Volume = 100
	}
}

// LoadHistory loads recently played stations from history.json.
func LoadHistory() ([]HistoryEntry, error) {
	path, err := HistoryPath()
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
	var entries []HistoryEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, err
	}
	return entries, nil
}

// RecordHistory prepends/updates a station in history.json and caps at MaxHistoryEntries.
func RecordHistory(entry HistoryEntry) ([]HistoryEntry, error) {
	if entry.Address == "" {
		return LoadHistory()
	}
	if entry.PlayedAt == 0 {
		entry.PlayedAt = time.Now().Unix()
	}
	existing, _ := LoadHistory()
	out := make([]HistoryEntry, 0, MaxHistoryEntries)
	out = append(out, entry)
	for _, item := range existing {
		if item.Address == entry.Address {
			continue
		}
		out = append(out, item)
		if len(out) >= MaxHistoryEntries {
			break
		}
	}
	path, err := HistoryPath()
	if err != nil {
		return out, err
	}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return out, err
	}
	return out, AtomicWriteFile(path, append(data, '\n'), 0o600)
}

// AtomicWriteFile writes data to a temporary sibling file and renames it into place.
func AtomicWriteFile(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".wf-tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpName)
		}
	}()
	if err := tmp.Chmod(perm); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		return err
	}
	cleanup = false
	return nil
}
