package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/zeSchlausKwab/wavefunc/tui/internal/auth"
	nostrclient "github.com/zeSchlausKwab/wavefunc/tui/internal/nostr"
	"github.com/zeSchlausKwab/wavefunc/tui/internal/player"
)

type onboardStep int

const (
	onboardBoot onboardStep = iota
	onboardTuneIn
	onboardIdentity
)

type onboardAuthSub int

const (
	onboardAuthMenu onboardAuthSub = iota
	onboardAuthCreateName
	onboardAuthCreateBackup
	onboardAuthQR
	onboardAuthImport
	onboardAuthReadOnly
)

type onboardingState struct {
	active        bool
	step          onboardStep
	stationCursor int
	vibeIndex     int
	authMenuIdx   int
	authSub       onboardAuthSub
	nameInput     textinput.Model
	secretInput   textinput.Model
	passInput     textinput.Model
	focusPass     bool
	createdNpub   string
	createdNsec   string
	authError     string
	authBusy      bool
}

var starterVibes = []struct {
	Label string
	Query string
}{
	{"FEATURED", ""},
	{"JAZZ & LO-FI", "jazz"},
	{"ELECTRONIC", "electronic"},
	{"AMBIENT", "ambient"},
	{"WORLD & INDIE", "indie"},
}

func newOnboardingState(active bool) onboardingState {
	nameIn := textinput.New()
	nameIn.Placeholder = "e.g. synthwave_listener"
	nameIn.CharLimit = 48
	nameIn.Width = 36

	secIn := textinput.New()
	secIn.Placeholder = "bunker://... or nsec1... or ncryptsec1..."
	secIn.CharLimit = 512
	secIn.Width = 48

	passIn := textinput.New()
	passIn.Placeholder = "Optional passphrase (NIP-49)"
	passIn.EchoMode = textinput.EchoPassword
	passIn.CharLimit = 128
	passIn.Width = 36

	return onboardingState{
		active:      active,
		step:        onboardBoot,
		nameInput:   nameIn,
		secretInput: secIn,
		passInput:   passIn,
	}
}

func (m *AppModel) onboardingStations() []nostrclient.Station {
	vibe := starterVibes[m.onboard.vibeIndex]
	if vibe.Query == "" {
		if len(m.featuredStations) > 0 {
			return m.featuredStations
		}
		return m.stations
	}
	var filtered []nostrclient.Station
	pool := m.stations
	if len(pool) == 0 {
		pool = m.featuredStations
	}
	for _, st := range pool {
		if nostrclient.MatchesStationSearch(st, vibe.Query) {
			filtered = append(filtered, st)
			if len(filtered) >= 12 {
				break
			}
		}
	}
	if len(filtered) == 0 {
		if len(m.featuredStations) > 0 {
			return m.featuredStations
		}
		return m.stations
	}
	return filtered
}

func (m *AppModel) finishOnboarding() tea.Cmd {
	m.onboard.active = false
	m.cancelQRPairing()
	m.cfg.OnboardingCompleted = true
	m.saveConfigAsync()
	return nil
}

func (m *AppModel) updateOnboarding(msg tea.KeyMsg) tea.Cmd {
	k := msg.String()
	if k == "ctrl+c" {
		return m.quitCmd()
	}

	// Handle sub-forms inside Step 3 (Identity).
	if m.onboard.step == onboardIdentity && m.onboard.authSub != onboardAuthMenu {
		return m.updateOnboardingAuthSub(msg)
	}

	switch k {
	case "esc":
		return m.finishOnboarding()
	}

	switch m.onboard.step {
	case onboardBoot:
		switch k {
		case "enter", " ", "right", "l":
			m.onboard.step = onboardTuneIn
		case "s":
			return m.finishOnboarding()
		}
	case onboardTuneIn:
		stations := m.onboardingStations()
		switch k {
		case "left", "h":
			m.onboard.vibeIndex = (m.onboard.vibeIndex - 1 + len(starterVibes)) % len(starterVibes)
			m.onboard.stationCursor = 0
		case "right", "l":
			m.onboard.vibeIndex = (m.onboard.vibeIndex + 1) % len(starterVibes)
			m.onboard.stationCursor = 0
		case "up", "k":
			if m.onboard.stationCursor > 0 {
				m.onboard.stationCursor--
			}
		case "down", "j":
			if m.onboard.stationCursor+1 < len(stations) && m.onboard.stationCursor < 7 {
				m.onboard.stationCursor++
			}
		case "enter":
			if len(stations) > 0 && m.onboard.stationCursor < len(stations) {
				m.playStation(stations[m.onboard.stationCursor], 0)
			}
		case "r":
			return m.playLuckyCmd()
		case "tab", "n":
			m.onboard.step = onboardIdentity
		case "b":
			m.onboard.step = onboardBoot
		}
	case onboardIdentity:
		switch k {
		case "up", "k":
			if m.onboard.authMenuIdx > 0 {
				m.onboard.authMenuIdx--
			}
		case "down", "j":
			if m.onboard.authMenuIdx < 4 {
				m.onboard.authMenuIdx++
			}
		case "1":
			return m.finishOnboarding()
		case "2":
			m.onboard.authMenuIdx = 1
			return m.enterOnboardAuthChoice()
		case "3":
			m.onboard.authMenuIdx = 2
			return m.enterOnboardAuthChoice()
		case "4":
			m.onboard.authMenuIdx = 3
			return m.enterOnboardAuthChoice()
		case "5":
			m.onboard.authMenuIdx = 4
			return m.enterOnboardAuthChoice()
		case "enter":
			return m.enterOnboardAuthChoice()
		case "b", "left":
			m.onboard.step = onboardTuneIn
		}
	}
	return nil
}

func (m *AppModel) enterOnboardAuthChoice() tea.Cmd {
	m.onboard.authError = ""
	switch m.onboard.authMenuIdx {
	case 0: // Skip as guest
		return m.finishOnboarding()
	case 1: // Create new Nostr account
		m.onboard.authSub = onboardAuthCreateName
		m.onboard.nameInput.SetValue("")
		m.onboard.passInput.SetValue("")
		m.onboard.focusPass = false
		m.onboard.nameInput.Focus()
		m.onboard.passInput.Blur()
		return textinput.Blink
	case 2: // QR NIP-46
		m.onboard.authSub = onboardAuthQR
		m.onboard.authBusy = true
		return m.startQRPairingCmd()
	case 3: // Paste bunker:// or nsec/ncryptsec
		m.onboard.authSub = onboardAuthImport
		m.onboard.secretInput.SetValue("")
		m.onboard.passInput.SetValue("")
		m.onboard.focusPass = false
		m.onboard.secretInput.Placeholder = "bunker://... or nsec1... or ncryptsec1..."
		m.onboard.secretInput.Focus()
		m.onboard.passInput.Blur()
		return textinput.Blink
	case 4: // Read-only npub
		m.onboard.authSub = onboardAuthReadOnly
		m.onboard.secretInput.SetValue("")
		m.onboard.secretInput.Placeholder = "npub1... or 64-char hex pubkey"
		m.onboard.secretInput.Focus()
		return textinput.Blink
	}
	return nil
}

func (m *AppModel) updateOnboardingAuthSub(msg tea.KeyMsg) tea.Cmd {
	k := msg.String()
	switch m.onboard.authSub {
	case onboardAuthCreateName:
		switch k {
		case "esc":
			m.onboard.authSub = onboardAuthMenu
			return nil
		case "tab":
			m.onboard.focusPass = !m.onboard.focusPass
			if m.onboard.focusPass {
				m.onboard.nameInput.Blur()
				m.onboard.passInput.Focus()
			} else {
				m.onboard.passInput.Blur()
				m.onboard.nameInput.Focus()
			}
			return nil
		case "enter":
			name := strings.TrimSpace(m.onboard.nameInput.Value())
			pass := m.onboard.passInput.Value()
			m.onboard.authBusy = true
			return m.createNewAccountCmd(name, pass)
		}
		var cmd tea.Cmd
		if m.onboard.focusPass {
			m.onboard.passInput, cmd = m.onboard.passInput.Update(msg)
		} else {
			m.onboard.nameInput, cmd = m.onboard.nameInput.Update(msg)
		}
		return cmd

	case onboardAuthCreateBackup:
		if k == "enter" || k == "esc" || k == " " {
			return m.finishOnboarding()
		}
		return nil

	case onboardAuthQR:
		if k == "esc" {
			m.cancelQRPairing()
			m.onboard.authSub = onboardAuthMenu
			m.onboard.authBusy = false
			return nil
		}
		return nil

	case onboardAuthImport:
		switch k {
		case "esc":
			m.onboard.authSub = onboardAuthMenu
			return nil
		case "tab":
			m.onboard.focusPass = !m.onboard.focusPass
			if m.onboard.focusPass {
				m.onboard.secretInput.Blur()
				m.onboard.passInput.Focus()
			} else {
				m.onboard.passInput.Blur()
				m.onboard.secretInput.Focus()
			}
			return nil
		case "enter":
			raw := strings.TrimSpace(m.onboard.secretInput.Value())
			pass := m.onboard.passInput.Value()
			m.onboard.authBusy = true
			m.onboard.authError = ""
			return m.importCredentialCmd(raw, pass)
		}
		var cmd tea.Cmd
		if m.onboard.focusPass {
			m.onboard.passInput, cmd = m.onboard.passInput.Update(msg)
		} else {
			m.onboard.secretInput, cmd = m.onboard.secretInput.Update(msg)
		}
		return cmd

	case onboardAuthReadOnly:
		switch k {
		case "esc":
			m.onboard.authSub = onboardAuthMenu
			return nil
		case "enter":
			raw := strings.TrimSpace(m.onboard.secretInput.Value())
			m.onboard.authBusy = true
			m.onboard.authError = ""
			return m.importReadOnlyCmd(raw)
		}
		var cmd tea.Cmd
		m.onboard.secretInput, cmd = m.onboard.secretInput.Update(msg)
		return cmd
	}
	return nil
}

func (m *AppModel) viewOnboarding() string {
	s := m.styles
	_, _, _, _, contentW, contentH := m.frameMetrics()

	// Step progress header.
	stepLabels := []string{"1. SIGNAL CHECK", "2. TUNE IN", "3. NOSTR SYNC"}
	var pills []string
	for i, lbl := range stepLabels {
		if onboardStep(i) == m.onboard.step {
			pills = append(pills, s.BadgeCyan.Render(lbl))
		} else if onboardStep(i) < m.onboard.step {
			pills = append(pills, s.Success.Render("✓ "+lbl))
		} else {
			pills = append(pills, s.Muted.Render(lbl))
		}
	}
	progress := strings.Join(pills, s.Muted.Render("  →  "))

	// QR view uses the full content height side-by-side so it never clips on shorter terminals.
	if m.onboard.step == onboardIdentity && m.onboard.authSub == onboardAuthQR {
		qrPanel := m.renderQRPanel(
			s.BadgeCyan.Render("3. NOSTR SYNC // NIP-46"),
			"SCAN WITH AMBER / PRIMAL / NSEC.APP",
			m.onboard.authError,
			contentW,
			contentH,
		)
		return m.renderAppFrame(qrPanel, true)
	}

	innerW := minInt(92, maxInt(48, contentW-4))

	var body string
	switch m.onboard.step {
	case onboardBoot:
		mascot := m.animator.RenderMascot(m.playerSnap.Status, s.Accent, s.Primary, s.Text, s.Muted)
		cubeArt := m.animator.RenderCube(18, 9, m.playerSnap.Status, m.playerSnap.Muted, true, s.Accent, s.Primary, s.Muted)
		cubePanel := lipgloss.NewStyle().
			Border(lipgloss.ThickBorder()).
			BorderForeground(s.Palette.Accent).
			Padding(0, 1).
			Render(cubeArt)

		heroBlock := mascot
		if innerW >= 68 {
			heroRight := lipgloss.JoinVertical(
				lipgloss.Left,
				mascot,
				"",
				s.Title.Render("WELCOME TO WAVEFUNC RADIO"),
				s.Muted.Render(wrapText("Decentralized internet radio on Nostr — listen right away, sync favorites across all your devices.", maxInt(28, innerW-26), 3)),
			)
			heroBlock = lipgloss.JoinHorizontal(lipgloss.Center, cubePanel, "   ", heroRight)
		}

		audioLine := s.Warning.Render("! No audio player detected") + "\n  " + s.Muted.Render("Install: "+player.InstallHint())
		if m.playerSnap.Backend.Available() {
			audioLine = s.Success.Render("✓ Audio ready: ") + s.Title.Render(string(m.playerSnap.Backend.Kind)) + s.Muted.Render(" ("+m.playerSnap.Backend.Path+")")
		}
		relayLine := s.Accent.Render("◌ Connecting to ") + s.Text.Render(m.nostr.AppRelayURL())
		if m.nostr.IsConnected() {
			countTxt := "connected"
			if m.stationCount > 0 {
				countTxt = fmt.Sprintf("%d stations indexed", m.stationCount)
			}
			relayLine = s.Success.Render("✓ Relay online: ") + s.Title.Render(m.nostr.AppRelayURL()) + s.Muted.Render(" · "+countTxt)
		} else if errMsg := m.nostr.LastError(); errMsg != "" {
			relayLine = s.Warning.Render("! Relay: ") + s.Muted.Render(truncate(errMsg, 54))
		}

		bootParts := []string{heroBlock}
		if innerW < 68 {
			bootParts = append(bootParts,
				"",
				s.Title.Render("WELCOME TO WAVEFUNC RADIO FOR YOUR TERMINAL"),
				s.Muted.Render("Decentralized internet radio on Nostr — listen right away, sync favorites anywhere."),
			)
		}
		bootParts = append(bootParts,
			"",
			audioLine,
			relayLine,
			"",
			s.BadgeLive.Render(" ENTER ")+" "+s.Title.Render("Pick a station & tune in")+"    "+s.BadgeMuted.Render(" ESC ")+" "+s.Muted.Render("Skip straight to browser"),
		)
		body = strings.Join(bootParts, "\n")

	case onboardTuneIn:
		var vibeBar []string
		for i, v := range starterVibes {
			if i == m.onboard.vibeIndex {
				vibeBar = append(vibeBar, s.BadgeCyan.Render(v.Label))
			} else {
				vibeBar = append(vibeBar, s.Muted.Render(v.Label))
			}
		}
		stations := m.onboardingStations()
		var rows []string
		maxRows := minInt(maxInt(5, contentH-12), minInt(9, len(stations)))
		if len(stations) == 0 {
			rows = append(rows, s.Muted.Render("  ◌ Scanning airwaves for live stations..."))
		}
		listW := innerW
		showSideCube := innerW >= 72
		if showSideCube {
			listW = innerW - 18
		}
		nameW := maxInt(20, listW-22)
		for i := 0; i < maxRows; i++ {
			st := stations[i]
			marker := "  "
			if m.playerSnap.Station != nil && m.playerSnap.Station.Address == st.Address {
				marker = s.Primary.Render("▶ ")
			}
			meta := st.QualityBadge()
			if st.CountryCode != "" {
				if meta != "" {
					meta = st.CountryCode + " · " + meta
				} else {
					meta = st.CountryCode
				}
			}
			line := fmt.Sprintf("%s%-*s  %s", marker, nameW, truncate(st.Name, nameW), meta)
			if i == m.onboard.stationCursor {
				rows = append(rows, s.RowActive.Width(listW).Render(" "+fmt.Sprintf("%-*s  %s", nameW, truncate(st.Name, nameW), meta)))
			} else {
				rows = append(rows, s.RowNormal.Render(line))
			}
		}

		listBlock := strings.Join(rows, "\n")
		if showSideCube {
			miniCube := m.animator.RenderCube(12, 6, m.playerSnap.Status, m.playerSnap.Muted, false, s.Accent, s.Primary, s.Muted)
			cubeBox := lipgloss.NewStyle().
				Border(lipgloss.NormalBorder()).
				BorderForeground(s.Palette.Border).
				Padding(0, 1).
				Render(miniCube)
			listBlock = lipgloss.JoinHorizontal(lipgloss.Center, lipgloss.NewStyle().Width(listW).Render(listBlock), "  ", cubeBox)
		}

		nowLine := s.Muted.Render("Hit Enter on any station — music keeps playing as you explore!")
		if m.playerSnap.Station != nil && m.playerSnap.Status != player.StatusIdle {
			nowLine = s.Success.Render("♪ Now tuning: ") + s.Title.Render(m.playerSnap.Station.Name) + "  " + m.animator.RenderSpectrum(16, m.playerSnap.Status, m.playerSnap.Muted, s.Accent, s.Primary, s.Muted)
		}
		body = strings.Join([]string{
			s.Title.Render("START LISTENING RIGHT AWAY"),
			strings.Join(vibeBar, " "),
			"",
			listBlock,
			"",
			nowLine,
			"",
			s.KeyHint.Render("←/→") + s.Muted.Render(" vibe  ") +
				s.KeyHint.Render("↑/↓") + s.Muted.Render(" pick  ") +
				s.KeyHint.Render("Enter") + s.Muted.Render(" play  ") +
				s.KeyHint.Render("r") + s.Muted.Render(" surprise me  ") +
				s.KeyHint.Render("Tab") + s.Muted.Render(" next  ") +
				s.KeyHint.Render("Esc") + s.Muted.Render(" finish"),
		}, "\n")

	case onboardIdentity:
		body = m.viewOnboardingIdentity(innerW)
	}

	page := lipgloss.NewStyle().Width(innerW).Render(progress + "\n\n" + body)
	centered := lipgloss.Place(contentW, contentH, lipgloss.Center, lipgloss.Center, page)
	return m.renderAppFrame(centered, true)
}

func (m *AppModel) viewOnboardingIdentity(innerW int) string {
	s := m.styles
	inputW := minInt(64, innerW-4)
	switch m.onboard.authSub {
	case onboardAuthCreateName:
		errLine := ""
		if m.onboard.authError != "" {
			errLine = "\n" + s.Danger.Render("✗ "+m.onboard.authError)
		}
		statusLine := ""
		if m.onboard.authBusy {
			statusLine = "\n" + s.Accent.Render("◌ Generating keypair & publishing profile...")
		}
		return strings.Join([]string{
			s.Title.Render("CREATE A NEW NOSTR ACCOUNT"),
			s.Muted.Render("Generates a fresh keypair locally. Optionally add a passphrase (NIP-49)."),
			"",
			s.Subtitle.Render("Display Name (optional):"),
			s.InputBox.Width(inputW).Render(m.onboard.nameInput.View()),
			s.Subtitle.Render("Passphrase (leave blank to use OS Keychain):"),
			s.InputBox.Width(inputW).Render(m.onboard.passInput.View()),
			errLine + statusLine,
			"",
			s.KeyHint.Render("Tab") + s.Muted.Render(" switch field  ") + s.KeyHint.Render("Enter") + s.Muted.Render(" create  ") + s.KeyHint.Render("Esc") + s.Muted.Render(" back"),
		}, "\n")

	case onboardAuthCreateBackup:
		return strings.Join([]string{
			s.Success.Render("✓ NOSTR ACCOUNT CREATED!"),
			s.Muted.Render("Save your private key (nsec) somewhere safe — it unlocks your favorites on web, desktop & mobile."),
			"",
			s.Subtitle.Render("Public ID (npub):"),
			s.Text.Render(m.onboard.createdNpub),
			"",
			s.Primary.Render("Secret Key (nsec — keep private!):"),
			s.BadgeMuted.Render(m.onboard.createdNsec),
			"",
			s.BadgeCyan.Render(" ENTER ") + " " + s.Title.Render("I've saved it — open WaveFunc!"),
		}, "\n")

	case onboardAuthImport:
		errLine := ""
		if m.onboard.authError != "" {
			errLine = "\n" + s.Danger.Render("✗ "+m.onboard.authError)
		}
		busy := ""
		if m.onboard.authBusy {
			busy = "\n" + s.Accent.Render("◌ Connecting & verifying credentials...")
		}
		return strings.Join([]string{
			s.Title.Render("SIGN IN WITH BUNKER OR SECRET KEY"),
			s.Muted.Render("Paste a bunker:// URI (NIP-46), nsec1..., or ncryptsec1..."),
			"",
			s.Subtitle.Render("Credential:"),
			s.InputBox.Width(inputW).Render(m.onboard.secretInput.View()),
			s.Subtitle.Render("Passphrase (required for ncryptsec1, optional for nsec1):"),
			s.InputBox.Width(inputW).Render(m.onboard.passInput.View()),
			errLine + busy,
			"",
			s.KeyHint.Render("Tab") + s.Muted.Render(" switch field  ") + s.KeyHint.Render("Enter") + s.Muted.Render(" sign in  ") + s.KeyHint.Render("Esc") + s.Muted.Render(" back"),
		}, "\n")

	case onboardAuthReadOnly:
		errLine := ""
		if m.onboard.authError != "" {
			errLine = "\n" + s.Danger.Render("✗ "+m.onboard.authError)
		}
		return strings.Join([]string{
			s.Title.Render("READ-ONLY WATCH MODE (NPUB)"),
			s.Muted.Render("Sync & play your favorite station lists without storing a private key."),
			"",
			s.InputBox.Width(inputW).Render(m.onboard.secretInput.View()) + errLine,
			"",
			s.KeyHint.Render("Enter") + s.Muted.Render(" connect  ") + s.KeyHint.Render("Esc") + s.Muted.Render(" back"),
		}, "\n")
	}

	options := []struct {
		key   string
		title string
		desc  string
	}{
		{"1", "Skip — Listen as Guest", "Start right away; sign in anytime with 'a'"},
		{"2", "Create a New Nostr Account", "Generate a keypair + sync favorites across all devices"},
		{"3", "Pair Phone Signer via QR (NIP-46)", "Scan with Amber, Primal, or nsec.app — zero keys on disk"},
		{"4", "Sign in with bunker:// or nsec / ncryptsec", "Connect an existing Nostr identity"},
		{"5", "Read-Only npub Mode", "Browse & play your favorite lists with no secret key"},
	}

	var rows []string
	for i, opt := range options {
		label := fmt.Sprintf("[%s] %s", opt.key, opt.title)
		if i == m.onboard.authMenuIdx {
			rows = append(rows, s.RowActive.Width(innerW).Render(" "+label)+"\n  "+s.Muted.Render(opt.desc))
		} else {
			rows = append(rows, s.Title.Render(" "+label)+"\n  "+s.Muted.Render(opt.desc))
		}
	}

	signedNote := ""
	if m.session.Mode() != auth.ModeGuest {
		signedNote = "\n" + s.Success.Render("✓ Currently signed in as "+shortNpub(m.session.Npub()))
	}

	return strings.Join([]string{
		s.Title.Render("CROSS-DEVICE FAVORITES & SOCIAL (OPTIONAL)"),
		s.Muted.Render("Your favorites, song crate, and comments live on Nostr."),
		"",
		strings.Join(rows, "\n"),
		signedNote,
		"",
		s.KeyHint.Render("↑/↓") + s.Muted.Render(" choose  ") + s.KeyHint.Render("Enter / 1-5") + s.Muted.Render(" select  ") + s.KeyHint.Render("b") + s.Muted.Render(" back  ") + s.KeyHint.Render("Esc") + s.Muted.Render(" skip"),
	}, "\n")
}
