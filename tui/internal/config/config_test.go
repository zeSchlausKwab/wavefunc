package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestConfigSaveLoadRoundTrip(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("WF_CONFIG_DIR", dir)

	cfg, exists, err := Load()
	if err != nil {
		t.Fatalf("Load missing config failed: %v", err)
	}
	if exists {
		t.Fatal("expected exists=false for missing config")
	}
	if cfg.Theme != ThemeSonicDark || cfg.Volume != 80 {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}

	cfg.OnboardingCompleted = true
	cfg.Theme = ThemePaperLight
	cfg.Volume = 140 // clamped to 100
	cfg.NIP38Broadcast = true
	cfg.StarterGenres = []string{"jazz", "ambient"}
	if err := Save(cfg); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	info, err := os.Stat(filepath.Join(dir, "config.json"))
	if err != nil {
		t.Fatalf("stat config.json: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Fatalf("expected 0600 perms, got %o", perm)
	}

	loaded, exists, err := Load()
	if err != nil || !exists {
		t.Fatalf("Load after Save failed: exists=%v err=%v", exists, err)
	}
	if loaded.Volume != 100 || loaded.Theme != ThemePaperLight || !loaded.NIP38Broadcast {
		t.Fatalf("unexpected loaded config: %+v", loaded)
	}
}

func TestHistoryDeduplicationAndCap(t *testing.T) {
	t.Setenv("WF_CONFIG_DIR", t.TempDir())

	for i := 0; i < MaxHistoryEntries+10; i++ {
		_, err := RecordHistory(HistoryEntry{
			Address:  "31237:abc:" + string(rune('a'+i%26)) + string(rune('0'+i/26)),
			Name:     "Station",
			PlayedAt: int64(1000 + i),
		})
		if err != nil {
			t.Fatalf("RecordHistory failed: %v", err)
		}
	}

	entries, err := RecordHistory(HistoryEntry{
		Address:  "31237:abc:a0",
		Name:     "Station A0 Again",
		PlayedAt: 9999,
	})
	if err != nil {
		t.Fatalf("RecordHistory update failed: %v", err)
	}
	if len(entries) != MaxHistoryEntries {
		t.Fatalf("expected %d entries, got %d", MaxHistoryEntries, len(entries))
	}
	if entries[0].Address != "31237:abc:a0" || entries[0].Name != "Station A0 Again" {
		t.Fatalf("expected bumped entry first, got %+v", entries[0])
	}
}
