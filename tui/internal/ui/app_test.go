package ui

import (
	"context"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/zeSchlausKwab/wavefunc/tui/internal/auth"
	"github.com/zeSchlausKwab/wavefunc/tui/internal/config"
	nostrclient "github.com/zeSchlausKwab/wavefunc/tui/internal/nostr"
	"github.com/zeSchlausKwab/wavefunc/tui/internal/player"
	"github.com/zeSchlausKwab/wavefunc/tui/internal/ui/anim"
	"github.com/zeSchlausKwab/wavefunc/tui/internal/ui/theme"
)

func TestAppOnboardingSkipAndNavigation(t *testing.T) {
	t.Setenv("WF_CONFIG_DIR", t.TempDir())
	t.Setenv("WF_DISABLE_KEYRING", "1")

	app := NewApp(LaunchOptions{RelayOverride: "ws://localhost:3334"})
	defer app.Cleanup()

	if !app.onboard.active {
		t.Fatal("expected onboarding active on fresh config dir")
	}

	// Render onboarding at both narrow and wide dimensions without panicking.
	for _, sz := range []tea.WindowSizeMsg{{Width: 80, Height: 24}, {Width: 140, Height: 42}} {
		app.Update(sz)
		view := app.View()
		if !strings.Contains(view, "WAVEFUNC") {
			t.Fatalf("expected WAVEFUNC branding in onboarding view for %+v", sz)
		}
	}

	// Esc skips onboarding immediately into TRANSMIT tab.
	app.Update(tea.KeyMsg{Type: tea.KeyEsc})
	if app.onboard.active {
		t.Fatal("expected Esc to dismiss onboarding")
	}

	// Inject sample stations and verify TRANSMIT view, tab switches, modals, and theme toggle.
	app.Update(stationsLoadedMsg{
		stations: []nostrclient.Station{
			{
				Address:     "31237:abc:fip",
				Name:        "FIP Radio",
				CountryCode: "FR",
				Genres:      []string{"jazz", "world"},
				Streams:     []nostrclient.Stream{{URL: "https://example.com/fip.aac", Primary: true}},
			},
		},
	})
	if !strings.Contains(app.View(), "FIP Radio") {
		t.Fatal("expected FIP Radio in TRANSMIT view")
	}

	// Switch tabs 2 -> 3 -> 4 -> 1.
	for _, key := range []string{"2", "3", "4", "1"} {
		app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(key)})
		if app.View() == "" {
			t.Fatalf("empty view on tab %s", key)
		}
	}

	// Open Station Inspector drawer with 'i' and close with Esc.
	app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("i")})
	if app.overlay != overlayStationDrawer || !strings.Contains(app.View(), "STATION SIGNAL") {
		t.Fatal("expected station inspector drawer to open")
	}
	app.Update(tea.KeyMsg{Type: tea.KeyEsc})
	if app.overlay != overlayNone {
		t.Fatal("expected drawer to close on Esc")
	}

	// Toggle theme dark -> light.
	app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("t")})
	if app.cfg.Theme != config.ThemePaperLight {
		t.Fatalf("expected paper light theme after toggle, got %s", app.cfg.Theme)
	}

	// Open Account modal with 'a' and Help with '?'.
	app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("a")})
	if app.overlay != overlayAccount || !strings.Contains(app.View(), "ACCOUNT & SETTINGS") {
		t.Fatal("expected account modal")
	}
	app.Update(tea.KeyMsg{Type: tea.KeyEsc})
	app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("?")})
	if app.overlay != overlayHelp || !strings.Contains(app.View(), "KEYBINDINGS") {
		t.Fatal("expected help overlay")
	}
}

func TestConsistentOuterContainerSizeAcrossAllScreens(t *testing.T) {
	t.Setenv("WF_CONFIG_DIR", t.TempDir())
	t.Setenv("WF_DISABLE_KEYRING", "1")

	app := NewApp(LaunchOptions{RelayOverride: "ws://localhost:3334"})
	defer app.Cleanup()

	const termW, termH = 120, 32
	app.Update(tea.WindowSizeMsg{Width: termW, Height: termH})
	app.Update(stationsLoadedMsg{
		stations: []nostrclient.Station{
			{
				Address:     "31237:abc:fip",
				Name:        "FIP Radio",
				CountryCode: "FR",
				Streams:     []nostrclient.Stream{{URL: "https://example.com/fip.aac", Primary: true}},
			},
		},
	})

	measureBox := func(label, rendered string) (int, int) {
		lines := strings.Split(rendered, "\n")
		if len(lines) != termH {
			t.Errorf("[%s] viewport height=%d, want %d", label, len(lines), termH)
		}
		// Find first top border row ("┏") and last bottom border row ("┗") to verify exact box geometry.
		topRow, botRow, boxW := -1, -1, 0
		for i, line := range lines {
			if strings.Contains(line, "┏") && topRow == -1 {
				topRow = i
				boxW = lipgloss.Width(strings.TrimSpace(line))
			}
			if strings.Contains(line, "┗") {
				botRow = i
			}
		}
		if topRow == -1 || botRow == -1 {
			t.Fatalf("[%s] missing outer thick border box", label)
		}
		return boxW, botRow - topRow + 1
	}

	// Step 1: Boot
	baseW, baseH := measureBox("onboard-boot", app.View())

	// Step 2: Tune In
	app.onboard.step = onboardTuneIn
	if w, h := measureBox("onboard-tune", app.View()); w != baseW || h != baseH {
		t.Fatalf("onboard-tune box=%dx%d, want %dx%d", w, h, baseW, baseH)
	}

	// Step 3: Identity menu
	app.onboard.step = onboardIdentity
	if w, h := measureBox("onboard-identity", app.View()); w != baseW || h != baseH {
		t.Fatalf("onboard-identity box=%dx%d, want %dx%d", w, h, baseW, baseH)
	}

	// Step 3: QR code screen with real NIP-46 URI
	pairing, err := auth.PrepareNostrConnect(context.Background(), nil, nostrclient.DefaultNIP46Relays)
	if err != nil {
		t.Fatalf("PrepareNostrConnect: %v", err)
	}
	art, cols, rows, err := anim.RenderQR(pairing.URI)
	if err != nil {
		t.Fatalf("RenderQR: %v", err)
	}
	app.onboard.authSub = onboardAuthQR
	app.qrURI = pairing.URI
	app.qrArt = art
	app.qrCols = cols
	app.qrRows = rows
	if w, h := measureBox("onboard-qr", app.View()); w != baseW || h != baseH {
		t.Fatalf("onboard-qr box=%dx%d, want %dx%d", w, h, baseW, baseH)
	}

	// Main TUI tabs
	app.onboard.active = false
	for _, tab := range []Tab{TabTransmit, TabArchive, TabCrate, TabAssembly} {
		app.tab = tab
		if w, h := measureBox("tab", app.View()); w != baseW || h != baseH {
			t.Fatalf("tab %d box=%dx%d, want %dx%d", tab, w, h, baseW, baseH)
		}
	}

	// Overlays: Station Inspector, Account, Help
	app.openStationDrawer(app.stations[0])
	if w, h := measureBox("station-drawer", app.View()); w != baseW || h != baseH {
		t.Fatalf("station-drawer box=%dx%d, want %dx%d", w, h, baseW, baseH)
	}
	app.openAccountModal()
	if w, h := measureBox("account-modal", app.View()); w != baseW || h != baseH {
		t.Fatalf("account-modal box=%dx%d, want %dx%d", w, h, baseW, baseH)
	}
	app.overlay = overlayHelp
	if w, h := measureBox("help-overlay", app.View()); w != baseW || h != baseH {
		t.Fatalf("help-overlay box=%dx%d, want %dx%d", w, h, baseW, baseH)
	}
}

func TestRenderMascotBoxAlignmentAcrossAllStates(t *testing.T) {
	a := anim.New()
	st := theme.ForName(config.ThemeSonicDark)
	for _, status := range []player.Status{player.StatusIdle, player.StatusTuning, player.StatusPlaying, player.StatusPaused} {
		a.Step(status, false)
		mascot := a.RenderMascot(status, st.Accent, st.Primary, st.Text, st.Muted)
		lines := strings.Split(mascot, "\n")
		if len(lines) < 5 {
			t.Fatalf("mascot too short for status %s: %d lines", status, len(lines))
		}
		// Every chassis line (lines[1:]) must have identical rendered width so right border aligns.
		expectedW := lipgloss.Width(lines[1])
		for i := 1; i < len(lines); i++ {
			if got := lipgloss.Width(lines[i]); got != expectedW {
				t.Fatalf("status=%s line %d width=%d, want %d:\n%s", status, i, got, expectedW, mascot)
			}
		}
	}
}

func TestRenderQRCompactAndUniformRows(t *testing.T) {
	pairing, err := auth.PrepareNostrConnect(context.Background(), nil, nostrclient.DefaultNIP46Relays)
	if err != nil {
		t.Fatalf("PrepareNostrConnect: %v", err)
	}
	art, cols, rows, err := anim.RenderQR(pairing.URI)
	if err != nil {
		t.Fatalf("RenderQR failed: %v", err)
	}
	if cols > 43 || rows > 22 {
		t.Fatalf("QR too large for 80x24 terminals: %dx%d (URI len=%d)", cols, rows, len(pairing.URI))
	}
	lines := strings.Split(art, "\n")
	if len(lines) != rows {
		t.Fatalf("expected %d rows, got %d", rows, len(lines))
	}
	for i, line := range lines {
		if got := lipgloss.Width(line); got != cols {
			t.Fatalf("QR row %d width=%d, want %d", i, got, cols)
		}
	}
}

func TestRender3DCubeDimensionsAndMotion(t *testing.T) {
	a := anim.New()
	st := theme.ForName(config.ThemeSonicDark)

	// Test onboarding hero cube (18x9), enlarged player dock cube (12x5 with core),
	// compact dock cube (10x4), and setup side cube (12x6).
	for _, tc := range []struct {
		cols, rows int
		core       bool
	}{
		{18, 9, true},
		{12, 6, false},
		{12, 5, true},
		{10, 4, false},
	} {
		frame1 := a.RenderCube(tc.cols, tc.rows, player.StatusPlaying, false, tc.core, st.Accent, st.Primary, st.Muted)
		lines := strings.Split(frame1, "\n")
		if len(lines) != tc.rows {
			t.Fatalf("cube %dx%d: got %d rows, want %d", tc.cols, tc.rows, len(lines), tc.rows)
		}
		for i, line := range lines {
			if got := lipgloss.Width(line); got != tc.cols {
				t.Fatalf("cube %dx%d row %d: width=%d, want %d", tc.cols, tc.rows, i, got, tc.cols)
			}
		}

		// Advance animation and confirm the cube actually rotates between frames.
		for i := 0; i < 6; i++ {
			a.Step(player.StatusPlaying, false)
		}
		frame2 := a.RenderCube(tc.cols, tc.rows, player.StatusPlaying, false, tc.core, st.Accent, st.Primary, st.Muted)
		if frame1 == frame2 {
			t.Fatalf("cube %dx%d did not animate across frames", tc.cols, tc.rows)
		}
	}
}

func TestNoVariationSelectorEmojiOrZeroKBitrateInViews(t *testing.T) {
	t.Setenv("WF_CONFIG_DIR", t.TempDir())
	t.Setenv("WF_DISABLE_KEYRING", "1")

	app := NewApp(LaunchOptions{RelayOverride: "ws://localhost:3334", SkipOnboarding: true})
	defer app.Cleanup()
	app.Update(tea.WindowSizeMsg{Width: 130, Height: 34})
	app.Update(stationsLoadedMsg{
		stations: []nostrclient.Station{
			{
				Address:     "31237:abc:zero-bitrate",
				Name:        "Zero Bitrate FM",
				CountryCode: "DE",
				Streams: []nostrclient.Stream{
					{URL: "https://example.com/stream.mp3", Format: "audio/mpeg", Quality: nostrclient.StreamQuality{Bitrate: 0, Codec: "mp3"}, Primary: true},
				},
			},
		},
	})

	views := []struct {
		name string
		out  string
	}{
		{"transmit", app.View()},
	}
	app.openStationDrawer(app.stations[0])
	views = append(views, struct{ name, out string }{"drawer", app.View()})
	app.overlay = overlayHelp
	views = append(views, struct{ name, out string }{"help", app.View()})
	app.overlay = overlayNone
	app.tab = TabAssembly
	views = append(views, struct{ name, out string }{"assembly", app.View()})

	for _, v := range views {
		if strings.ContainsRune(v.out, '\ufe0f') {
			t.Fatalf("view %s contains variation-selector emoji (U+FE0F) which causes terminal border misalignment", v.name)
		}
		if strings.Contains(v.out, "0k") {
			t.Fatalf("view %s displays '0k' for unknown bitrate", v.name)
		}
	}
}

func TestNowPlayingDockAlwaysVisibleOnTransmit(t *testing.T) {
	t.Setenv("WF_CONFIG_DIR", t.TempDir())
	t.Setenv("WF_DISABLE_KEYRING", "1")

	app := NewApp(LaunchOptions{RelayOverride: "ws://localhost:3334", SkipOnboarding: true})
	defer app.Cleanup()
	app.Update(tea.WindowSizeMsg{Width: 114, Height: 30})
	app.Update(stationsLoadedMsg{
		stations: []nostrclient.Station{
			{
				Address:     "31237:abc:fip",
				Name:        "FIP Radio",
				CountryCode: "FR",
				Location:    "Paris, France",
				Description: "Long description text to make sure the Signal Inspector panel never pushes the Now Playing Dock out of the frame on a 30-row terminal.",
				Genres:      []string{"jazz", "world", "electronic"},
				Streams:     []nostrclient.Stream{{URL: "https://example.com/fip.aac", Quality: nostrclient.StreamQuality{Bitrate: 192000, Codec: "aac"}, Primary: true}},
			},
		},
	})
	app.DemoSetPlayback(player.StatusPlaying, &app.stations[0], player.TrackInfo{
		Raw:    "Miles Davis - Blue in Green",
		Artist: "Miles Davis",
		Song:   "Blue in Green",
		Source: "icy",
	})

	view := app.View()
	if !strings.Contains(view, "108 MHz") || !strings.Contains(view, "Miles Davis") {
		t.Fatalf("expected Now Playing Dock with FM dial and ICY track to remain visible inside frame:\n%s", view)
	}
}
