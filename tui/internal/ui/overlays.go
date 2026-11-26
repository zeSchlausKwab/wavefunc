package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/zeSchlausKwab/wavefunc/tui/internal/auth"
	"github.com/zeSchlausKwab/wavefunc/tui/internal/config"
	nostrclient "github.com/zeSchlausKwab/wavefunc/tui/internal/nostr"
	"github.com/zeSchlausKwab/wavefunc/tui/internal/player"
)

type overlayKind int

const (
	overlayNone overlayKind = iota
	overlayStationDrawer
	overlayFavPicker
	overlayAccount
	overlayUnlockPassphrase
	overlayHelp
)

// --- Station Detail & Comments Drawer ---

type stationDrawerState struct {
	station        nostrclient.Station
	social         nostrclient.StationSocial
	loading        bool
	focusComments  bool
	streamCursor   int
	commentCursor  int
	composing      bool
	replyToComment *nostrclient.CommentNode
	input          textinput.Model
}

func newStationDrawerState() stationDrawerState {
	in := textinput.New()
	in.Placeholder = "Write a station comment (NIP-22)..."
	in.CharLimit = 280
	in.Width = 48
	return stationDrawerState{input: in}
}

func (m *AppModel) openStationDrawer(st nostrclient.Station) tea.Cmd {
	m.overlay = overlayStationDrawer
	m.drawer.station = st
	m.drawer.social = nostrclient.StationSocial{StationAddress: st.Address}
	m.drawer.loading = true
	m.drawer.focusComments = false
	m.drawer.streamCursor = 0
	m.drawer.commentCursor = 0
	m.drawer.composing = false
	m.drawer.replyToComment = nil
	return m.fetchStationSocialCmd(st)
}

func (m *AppModel) updateStationDrawer(msg tea.KeyMsg) tea.Cmd {
	k := msg.String()
	if m.drawer.composing {
		switch k {
		case "esc":
			m.drawer.composing = false
			m.drawer.replyToComment = nil
			m.drawer.input.Blur()
			return nil
		case "enter":
			text := strings.TrimSpace(m.drawer.input.Value())
			replyTo := m.drawer.replyToComment
			m.drawer.composing = false
			m.drawer.replyToComment = nil
			m.drawer.input.Blur()
			if text == "" {
				return nil
			}
			if replyTo != nil {
				return m.publishCommentReplyCmd(replyTo.Event, m.drawer.station, text)
			}
			return m.publishStationCommentCmd(m.drawer.station, text)
		}
		var cmd tea.Cmd
		m.drawer.input, cmd = m.drawer.input.Update(msg)
		return cmd
	}

	orderedStreams := player.OrderStreams(m.drawer.station.Streams)
	switch k {
	case "esc", "i", "q":
		m.overlay = overlayNone
	case "tab", "left", "right", "h", "l":
		m.drawer.focusComments = !m.drawer.focusComments
	case "up", "k":
		if !m.drawer.focusComments {
			if m.drawer.streamCursor > 0 {
				m.drawer.streamCursor--
			}
		} else if m.drawer.commentCursor > 0 {
			m.drawer.commentCursor--
		}
	case "down", "j":
		if !m.drawer.focusComments {
			if m.drawer.streamCursor+1 < len(orderedStreams) {
				m.drawer.streamCursor++
			}
		} else if m.drawer.commentCursor+1 < len(m.drawer.social.FlatComments) {
			m.drawer.commentCursor++
		}
	case "enter":
		if !m.drawer.focusComments && len(orderedStreams) > 0 {
			m.playStation(m.drawer.station, m.drawer.streamCursor)
		}
	case "f":
		return m.triggerFavoriteStation(m.drawer.station)
	case "r":
		return m.reactStationCmd(m.drawer.station)
	case "c":
		if !m.session.CanSign() {
			return m.toastCmd("Sign in with 'a' to comment on stations", true)
		}
		m.drawer.composing = true
		m.drawer.replyToComment = nil
		m.drawer.input.SetValue("")
		m.drawer.input.Placeholder = "Post a comment on " + m.drawer.station.Name + "..."
		m.drawer.input.Focus()
		return textinput.Blink
	case "R":
		if !m.session.CanSign() {
			return m.toastCmd("Sign in with 'a' to reply", true)
		}
		if len(m.drawer.social.FlatComments) > 0 && m.drawer.commentCursor < len(m.drawer.social.FlatComments) {
			m.drawer.composing = true
			m.drawer.replyToComment = m.drawer.social.FlatComments[m.drawer.commentCursor]
			m.drawer.input.SetValue("")
			m.drawer.input.Placeholder = "Reply to comment..."
			m.drawer.input.Focus()
			return textinput.Blink
		}
	}
	return nil
}

func (m *AppModel) viewStationDrawer() string {
	s := m.styles
	st := m.drawer.station
	_, _, _, _, contentW, contentH := m.frameMetrics()
	innerW := minInt(96, maxInt(48, contentW-4))

	header := s.BadgeLive.Render("STATION SIGNAL") + "  " + s.Title.Render(truncate(st.Name, innerW-22))
	metaParts := []string{}
	if st.Location != "" {
		metaParts = append(metaParts, st.Location)
	} else if st.CountryCode != "" {
		metaParts = append(metaParts, st.CountryCode)
	}
	if len(st.Genres) > 0 {
		metaParts = append(metaParts, strings.Join(st.Genres[:minInt(4, len(st.Genres))], ", "))
	}
	if st.Website != "" {
		metaParts = append(metaParts, st.Website)
	}

	heartLabel := fmt.Sprintf("♥ %d", m.drawer.social.ReactionCount)
	if m.drawer.social.UserReacted {
		heartLabel = s.Primary.Render(heartLabel + " (liked)")
	} else {
		heartLabel = s.Primary.Render("♥") + s.Muted.Render(fmt.Sprintf(" %d", m.drawer.social.ReactionCount))
	}
	favLabel := s.Muted.Render("☆ [f] Favorite")
	if m.isFavorited(st.Address) {
		favLabel = s.Primary.Render("★ Favorited")
	}

	// Streams section.
	ordered := player.OrderStreams(st.Streams)
	streamHeader := s.Subtitle.Render(fmt.Sprintf("STREAMS (%d) — Enter to play selected stream", len(ordered)))
	if !m.drawer.focusComments {
		streamHeader = s.BadgeCyan.Render("STREAMS") + " " + s.Muted.Render("Enter to play")
	}
	var streamLines []string
	for i, stream := range ordered {
		if i >= 4 {
			break
		}
		primary := ""
		if stream.Primary {
			primary = " [PRIMARY]"
		}
		label := stream.DisplayLabel() + primary
		line := fmt.Sprintf("  %-18s  %s", label, truncate(stream.URL, maxInt(20, innerW-24)))
		if !m.drawer.focusComments && i == m.drawer.streamCursor {
			streamLines = append(streamLines, s.RowActive.Width(innerW).Render(line))
		} else {
			streamLines = append(streamLines, s.Muted.Render(line))
		}
	}
	if len(streamLines) == 0 {
		streamLines = append(streamLines, s.Muted.Render("  No stream URLs listed"))
	}

	// Comments section.
	commentHeader := s.Subtitle.Render(fmt.Sprintf("COMMENTS (%d)", len(m.drawer.social.FlatComments)))
	if m.drawer.focusComments {
		commentHeader = s.BadgeCyan.Render(fmt.Sprintf("COMMENTS (%d)", len(m.drawer.social.FlatComments))) + " " + s.Muted.Render("[c] comment · [R] reply")
	}
	var commentLines []string
	if m.drawer.loading {
		commentLines = append(commentLines, s.Accent.Render("  ◌ Loading comments & reactions..."))
	} else if len(m.drawer.social.FlatComments) == 0 {
		commentLines = append(commentLines, s.Muted.Render("  No comments yet — press [c] to start the conversation!"))
	} else {
		maxShow := minInt(maxInt(4, contentH-16), len(m.drawer.social.FlatComments))
		start := 0
		if m.drawer.commentCursor >= maxShow {
			start = m.drawer.commentCursor - maxShow + 1
		}
		end := minInt(len(m.drawer.social.FlatComments), start+maxShow)
		for i := start; i < end; i++ {
			node := m.drawer.social.FlatComments[i]
			indent := strings.Repeat("  ", minInt(3, node.Depth))
			author := m.nostr.Profile(node.Event.PubKey.Hex()).Label()
			txt := fmt.Sprintf("%s@%s (%s): %s", indent, author, relativeAge(int64(node.Event.CreatedAt)), strings.ReplaceAll(node.Event.Content, "\n", " "))
			if m.drawer.focusComments && i == m.drawer.commentCursor {
				commentLines = append(commentLines, s.RowActive.Width(innerW).Render(" "+truncate(txt, innerW-2)))
			} else {
				commentLines = append(commentLines, s.Text.Render(" "+truncate(txt, innerW-2)))
			}
		}
	}

	composeBox := ""
	if m.drawer.composing {
		lbl := "NEW COMMENT: "
		if m.drawer.replyToComment != nil {
			lbl = "REPLY: "
		}
		composeBox = "\n" + s.InputBox.Width(innerW).Render(s.Accent.Render(lbl)+m.drawer.input.View())
	}

	parts := []string{
		header,
		s.Muted.Render(truncate(strings.Join(metaParts, " · "), innerW)),
		heartLabel + "   " + favLabel,
	}
	if st.Description != "" {
		parts = append(parts, "", s.Text.Render(wrapText(st.Description, innerW, 2)))
	}
	parts = append(parts,
		"",
		streamHeader,
		strings.Join(streamLines, "\n"),
		"",
		commentHeader,
		strings.Join(commentLines, "\n")+composeBox,
		"",
		s.KeyHint.Render("Tab")+s.Muted.Render(" focus  ")+
			s.KeyHint.Render("Enter")+s.Muted.Render(" play stream  ")+
			s.KeyHint.Render("c")+s.Muted.Render(" comment  ")+
			s.KeyHint.Render("R")+s.Muted.Render(" reply  ")+
			s.KeyHint.Render("r")+" "+s.Primary.Render("♥")+"  "+
			s.KeyHint.Render("f")+s.Muted.Render(" fav  ")+
			s.KeyHint.Render("Esc")+s.Muted.Render(" close"),
	)

	page := lipgloss.NewStyle().Width(innerW).Render(strings.Join(parts, "\n"))
	return m.renderAppFrame(lipgloss.Place(contentW, contentH, lipgloss.Center, lipgloss.Center, page), true)
}

// --- Favorite List Picker Overlay ---

type favPickerState struct {
	station nostrclient.Station
	cursor  int
}

func (m *AppModel) updateFavPicker(msg tea.KeyMsg) tea.Cmd {
	switch msg.String() {
	case "esc", "q":
		m.overlay = overlayNone
	case "up", "k":
		if m.favPicker.cursor > 0 {
			m.favPicker.cursor--
		}
	case "down", "j":
		if m.favPicker.cursor+1 < len(m.favoriteLists) {
			m.favPicker.cursor++
		}
	case "enter", " ":
		if len(m.favoriteLists) > 0 && m.favPicker.cursor < len(m.favoriteLists) {
			fl := m.favoriteLists[m.favPicker.cursor]
			st := m.favPicker.station
			m.overlay = overlayNone
			return m.toggleStationInListCmd(fl, st)
		}
	}
	return nil
}

func (m *AppModel) viewFavPicker() string {
	s := m.styles
	_, _, _, _, contentW, contentH := m.frameMetrics()
	w := minInt(64, maxInt(40, contentW-6))
	var rows []string
	for i, fl := range m.favoriteLists {
		mark := "[ ]"
		if fl.HasStation(m.favPicker.station.Address) {
			mark = "[★]"
		}
		line := fmt.Sprintf(" %s %s (%d)", mark, truncate(fl.Name, w-12), len(fl.StationAddresses))
		if i == m.favPicker.cursor {
			rows = append(rows, s.RowActive.Width(w).Render(line))
		} else {
			rows = append(rows, s.Text.Render(line))
		}
	}
	body := strings.Join([]string{
		s.BadgeCyan.Render("PICK FAVORITES LIST"),
		s.Title.Render(truncate(m.favPicker.station.Name, w)),
		"",
		strings.Join(rows, "\n"),
		"",
		s.KeyHint.Render("Enter") + s.Muted.Render(" toggle  ") + s.KeyHint.Render("Esc") + s.Muted.Render(" close"),
	}, "\n")
	page := lipgloss.NewStyle().Width(w).Render(body)
	return m.renderAppFrame(lipgloss.Place(contentW, contentH, lipgloss.Center, lipgloss.Center, page), true)
}

// --- Account & Settings Modal ---

type accountSub int

const (
	accountMenu accountSub = iota
	accountCreate
	accountBackup
	accountQR
	accountImport
	accountReadOnly
)

type accountModalState struct {
	cursor      int
	sub         accountSub
	nameInput   textinput.Model
	secretInput textinput.Model
	passInput   textinput.Model
	focusPass   bool
	revealNsec  bool
	createdNpub string
	createdNsec string
	errMsg      string
	busy        bool
}

func newAccountModalState() accountModalState {
	nameIn := textinput.New()
	nameIn.Placeholder = "Display name (optional)"
	nameIn.CharLimit = 48
	nameIn.Width = 38

	secIn := textinput.New()
	secIn.Placeholder = "bunker://... or nsec1... or ncryptsec1..."
	secIn.CharLimit = 512
	secIn.Width = 48

	passIn := textinput.New()
	passIn.Placeholder = "Passphrase (optional / NIP-49)"
	passIn.EchoMode = textinput.EchoPassword
	passIn.CharLimit = 128
	passIn.Width = 38

	return accountModalState{
		nameInput:   nameIn,
		secretInput: secIn,
		passInput:   passIn,
	}
}

func (m *AppModel) openAccountModal() {
	m.overlay = overlayAccount
	m.account.sub = accountMenu
	m.account.cursor = 0
	m.account.errMsg = ""
	m.account.revealNsec = false
}

func (m *AppModel) accountMenuItems() []string {
	nip38 := "OFF"
	if m.cfg.NIP38Broadcast {
		nip38 = "ON"
	}
	themeName := "Sonic Dark"
	if m.cfg.Theme == config.ThemePaperLight {
		themeName = "Constructivist Paper"
	}
	items := []string{
		"Create a New Nostr Account",
		"Pair Phone Signer via QR (NIP-46)",
		"Sign in with bunker:// or nsec / ncryptsec",
		"Sign in Read-Only (npub)",
		fmt.Sprintf("NIP-38 Now Listening Broadcast: [%s]", nip38),
		fmt.Sprintf("Theme: [%s]", themeName),
		fmt.Sprintf("Audio Backend Preference: [%s]", strings.ToUpper(m.cfg.PreferredBackend)),
		"Re-run Onboarding Wizard",
	}
	if m.session.Mode() == auth.ModeLocalKey {
		items = append(items, "Reveal / Backup Secret Key (nsec)")
	}
	if m.session.Mode() != auth.ModeGuest {
		items = append(items, "Log Out (Switch to Guest)")
	}
	return items
}

func (m *AppModel) updateAccountModal(msg tea.KeyMsg) tea.Cmd {
	k := msg.String()

	switch m.account.sub {
	case accountCreate:
		switch k {
		case "esc":
			m.account.sub = accountMenu
			return nil
		case "tab":
			m.account.focusPass = !m.account.focusPass
			if m.account.focusPass {
				m.account.nameInput.Blur()
				m.account.passInput.Focus()
			} else {
				m.account.passInput.Blur()
				m.account.nameInput.Focus()
			}
			return nil
		case "enter":
			m.account.busy = true
			m.account.errMsg = ""
			return m.createNewAccountCmd(strings.TrimSpace(m.account.nameInput.Value()), m.account.passInput.Value())
		}
		var cmd tea.Cmd
		if m.account.focusPass {
			m.account.passInput, cmd = m.account.passInput.Update(msg)
		} else {
			m.account.nameInput, cmd = m.account.nameInput.Update(msg)
		}
		return cmd

	case accountBackup:
		if k == "enter" || k == "esc" {
			m.account.sub = accountMenu
		}
		return nil

	case accountQR:
		if k == "esc" {
			m.cancelQRPairing()
			m.account.sub = accountMenu
			m.account.busy = false
		}
		return nil

	case accountImport:
		switch k {
		case "esc":
			m.account.sub = accountMenu
			return nil
		case "tab":
			m.account.focusPass = !m.account.focusPass
			if m.account.focusPass {
				m.account.secretInput.Blur()
				m.account.passInput.Focus()
			} else {
				m.account.passInput.Blur()
				m.account.secretInput.Focus()
			}
			return nil
		case "enter":
			m.account.busy = true
			m.account.errMsg = ""
			return m.importCredentialCmd(strings.TrimSpace(m.account.secretInput.Value()), m.account.passInput.Value())
		}
		var cmd tea.Cmd
		if m.account.focusPass {
			m.account.passInput, cmd = m.account.passInput.Update(msg)
		} else {
			m.account.secretInput, cmd = m.account.secretInput.Update(msg)
		}
		return cmd

	case accountReadOnly:
		switch k {
		case "esc":
			m.account.sub = accountMenu
			return nil
		case "enter":
			m.account.busy = true
			m.account.errMsg = ""
			return m.importReadOnlyCmd(strings.TrimSpace(m.account.secretInput.Value()))
		}
		var cmd tea.Cmd
		m.account.secretInput, cmd = m.account.secretInput.Update(msg)
		return cmd
	}

	items := m.accountMenuItems()
	switch k {
	case "esc", "a", "q":
		m.overlay = overlayNone
	case "up", "k":
		if m.account.cursor > 0 {
			m.account.cursor--
		}
	case "down", "j":
		if m.account.cursor+1 < len(items) {
			m.account.cursor++
		}
	case "enter", " ":
		return m.executeAccountAction(items[m.account.cursor])
	}
	return nil
}

func (m *AppModel) executeAccountAction(label string) tea.Cmd {
	m.account.errMsg = ""
	switch {
	case strings.HasPrefix(label, "Create a New"):
		m.account.sub = accountCreate
		m.account.nameInput.SetValue("")
		m.account.passInput.SetValue("")
		m.account.focusPass = false
		m.account.nameInput.Focus()
		m.account.passInput.Blur()
		return textinput.Blink
	case strings.HasPrefix(label, "Pair Phone"):
		m.account.sub = accountQR
		m.account.busy = true
		return m.startQRPairingCmd()
	case strings.HasPrefix(label, "Sign in with bunker"):
		m.account.sub = accountImport
		m.account.secretInput.SetValue("")
		m.account.passInput.SetValue("")
		m.account.focusPass = false
		m.account.secretInput.Placeholder = "bunker://... or nsec1... or ncryptsec1..."
		m.account.secretInput.Focus()
		m.account.passInput.Blur()
		return textinput.Blink
	case strings.HasPrefix(label, "Sign in Read-Only"):
		m.account.sub = accountReadOnly
		m.account.secretInput.SetValue("")
		m.account.secretInput.Placeholder = "npub1... or hex pubkey"
		m.account.secretInput.Focus()
		return textinput.Blink
	case strings.HasPrefix(label, "NIP-38"):
		m.cfg.NIP38Broadcast = !m.cfg.NIP38Broadcast
		m.listening.Configure(m.cfg.NIP38Broadcast, m.session)
		m.saveConfigAsync()
		state := "disabled"
		if m.cfg.NIP38Broadcast {
			state = "enabled"
		}
		return m.toastCmd("NIP-38 Now Listening broadcast "+state, false)
	case strings.HasPrefix(label, "Theme:"):
		m.toggleTheme()
		return nil
	case strings.HasPrefix(label, "Audio Backend"):
		order := []string{"auto", "mpv", "ffplay", "vlc"}
		next := "auto"
		for i, v := range order {
			if v == m.cfg.PreferredBackend {
				next = order[(i+1)%len(order)]
				break
			}
		}
		m.cfg.PreferredBackend = next
		info := m.player.SetPreferredBackend(next)
		m.saveConfigAsync()
		return m.toastCmd(fmt.Sprintf("Audio backend: %s (%s)", next, info.Kind), false)
	case strings.HasPrefix(label, "Re-run Onboarding"):
		m.overlay = overlayNone
		m.onboard = newOnboardingState(true)
		return nil
	case strings.HasPrefix(label, "Reveal / Backup"):
		if ls, ok := m.session.(*auth.LocalSession); ok {
			m.account.createdNpub = ls.Npub()
			m.account.createdNsec = ls.Nsec()
			m.account.sub = accountBackup
		}
		return nil
	case strings.HasPrefix(label, "Log Out"):
		return m.logoutCmd()
	}
	return nil
}

func (m *AppModel) viewAccountModal() string {
	s := m.styles
	_, _, _, _, contentW, contentH := m.frameMetrics()
	inner := minInt(84, maxInt(46, contentW-4))
	inputW := minInt(64, inner-2)

	switch m.account.sub {
	case accountCreate:
		errLine := ""
		if m.account.errMsg != "" {
			errLine = "\n" + s.Danger.Render("✗ "+m.account.errMsg)
		}
		body := strings.Join([]string{
			s.BadgeLive.Render("CREATE NOSTR ACCOUNT"),
			"",
			s.Subtitle.Render("Display Name (optional):"),
			s.InputBox.Width(inputW).Render(m.account.nameInput.View()),
			s.Subtitle.Render("Passphrase (leave blank for OS Keychain):"),
			s.InputBox.Width(inputW).Render(m.account.passInput.View()) + errLine,
			"",
			s.KeyHint.Render("Tab") + s.Muted.Render(" switch field  ") + s.KeyHint.Render("Enter") + s.Muted.Render(" create  ") + s.KeyHint.Render("Esc") + s.Muted.Render(" back"),
		}, "\n")
		page := lipgloss.NewStyle().Width(inner).Render(body)
		return m.renderAppFrame(lipgloss.Place(contentW, contentH, lipgloss.Center, lipgloss.Center, page), true)

	case accountBackup:
		body := strings.Join([]string{
			s.BadgeLive.Render("SECRET KEY BACKUP"),
			s.Muted.Render("Keep your nsec private. Import it on wavefunc.live or any Nostr client."),
			"",
			s.Subtitle.Render("Public ID (npub):"),
			s.Text.Render(m.account.createdNpub),
			"",
			s.Primary.Render("Secret Key (nsec):"),
			s.BadgeMuted.Render(m.account.createdNsec),
			"",
			s.KeyHint.Render("Enter / Esc") + s.Muted.Render(" done"),
		}, "\n")
		page := lipgloss.NewStyle().Width(inner).Render(body)
		return m.renderAppFrame(lipgloss.Place(contentW, contentH, lipgloss.Center, lipgloss.Center, page), true)

	case accountQR:
		qrPanel := m.renderQRPanel(
			s.BadgeCyan.Render("NIP-46 NOSTR CONNECT"),
			"SCAN WITH AMBER / PRIMAL / NSEC.APP",
			m.account.errMsg,
			contentW,
			contentH,
		)
		return m.renderAppFrame(qrPanel, true)

	case accountImport:
		errLine := ""
		if m.account.errMsg != "" {
			errLine = "\n" + s.Danger.Render("✗ "+m.account.errMsg)
		}
		busy := ""
		if m.account.busy {
			busy = "\n" + s.Accent.Render("◌ Connecting...")
		}
		body := strings.Join([]string{
			s.BadgeCyan.Render("SIGN IN // BUNKER OR SECRET KEY"),
			"",
			s.Subtitle.Render("bunker:// URI, nsec1..., or ncryptsec1...:"),
			s.InputBox.Width(inputW).Render(m.account.secretInput.View()),
			s.Subtitle.Render("Passphrase (if encrypted or desired for NIP-49 storage):"),
			s.InputBox.Width(inputW).Render(m.account.passInput.View()) + errLine + busy,
			"",
			s.KeyHint.Render("Tab") + s.Muted.Render(" field  ") + s.KeyHint.Render("Enter") + s.Muted.Render(" sign in  ") + s.KeyHint.Render("Esc") + s.Muted.Render(" back"),
		}, "\n")
		page := lipgloss.NewStyle().Width(inner).Render(body)
		return m.renderAppFrame(lipgloss.Place(contentW, contentH, lipgloss.Center, lipgloss.Center, page), true)

	case accountReadOnly:
		errLine := ""
		if m.account.errMsg != "" {
			errLine = "\n" + s.Danger.Render("✗ "+m.account.errMsg)
		}
		body := strings.Join([]string{
			s.BadgeCyan.Render("READ-ONLY WATCH MODE"),
			s.Muted.Render("Paste your npub1... to sync favorite lists without entering a private key."),
			"",
			s.InputBox.Width(inputW).Render(m.account.secretInput.View()) + errLine,
			"",
			s.KeyHint.Render("Enter") + s.Muted.Render(" connect  ") + s.KeyHint.Render("Esc") + s.Muted.Render(" back"),
		}, "\n")
		page := lipgloss.NewStyle().Width(inner).Render(body)
		return m.renderAppFrame(lipgloss.Place(contentW, contentH, lipgloss.Center, lipgloss.Center, page), true)
	}

	// Main account & settings menu.
	identityLine := s.BadgeMuted.Render("GUEST") + " " + s.Muted.Render("Listening anonymously")
	if m.session.Mode() != auth.ModeGuest {
		prof := m.nostr.Profile(m.session.PubKey().Hex())
		badge := strings.ToUpper(string(m.session.Mode()))
		identityLine = s.BadgeCyan.Render(badge) + " " + s.Title.Render("@"+prof.Label()) + " " + s.Muted.Render(shortNpub(m.session.Npub()))
	}
	relayLine := s.Muted.Render("App Relay: ") + s.Text.Render(m.nostr.AppRelayURL())
	audioLine := s.Muted.Render("Audio: ") + s.Text.Render(string(m.playerSnap.Backend.Kind))
	if !m.playerSnap.Backend.Available() {
		audioLine = s.Warning.Render("Audio missing — " + player.InstallHint())
	}

	items := m.accountMenuItems()
	var rows []string
	for i, item := range items {
		if i == m.account.cursor {
			rows = append(rows, s.RowActive.Width(inner).Render(" ▸ "+item))
		} else {
			rows = append(rows, s.Text.Render("   "+item))
		}
	}

	body := strings.Join([]string{
		s.BadgeLive.Render("ACCOUNT & SETTINGS"),
		"",
		identityLine,
		relayLine + "   ·   " + audioLine,
		"",
		strings.Join(rows, "\n"),
		"",
		s.KeyHint.Render("↑/↓") + s.Muted.Render(" move  ") + s.KeyHint.Render("Enter") + s.Muted.Render(" select  ") + s.KeyHint.Render("Esc") + s.Muted.Render(" close"),
	}, "\n")
	page := lipgloss.NewStyle().Width(inner).Render(body)
	return m.renderAppFrame(lipgloss.Place(contentW, contentH, lipgloss.Center, lipgloss.Center, page), true)
}

// --- Startup NIP-49 Passphrase Unlock Overlay ---

func (m *AppModel) updateUnlockOverlay(msg tea.KeyMsg) tea.Cmd {
	switch msg.String() {
	case "esc":
		m.overlay = overlayNone
		return m.toastCmd("Continuing as Guest — press 'a' to unlock later", false)
	case "enter":
		pass := m.unlockInput.Value()
		m.unlockInput.SetValue("")
		return m.unlockEncryptedKeyCmd(pass)
	}
	var cmd tea.Cmd
	m.unlockInput, cmd = m.unlockInput.Update(msg)
	return cmd
}

func (m *AppModel) viewUnlockOverlay() string {
	s := m.styles
	_, _, _, _, contentW, contentH := m.frameMetrics()
	w := minInt(64, maxInt(42, contentW-6))
	errLine := ""
	if m.unlockErr != "" {
		errLine = "\n" + s.Danger.Render("✗ "+m.unlockErr)
	}
	body := strings.Join([]string{
		s.BadgeLive.Render("UNLOCK ENCRYPTED NOSTR KEY (NIP-49)"),
		s.Muted.Render("Enter your passphrase to unlock your stored Nostr key."),
		"",
		s.InputBox.Width(w - 2).Render(m.unlockInput.View()) + errLine,
		"",
		s.KeyHint.Render("Enter") + s.Muted.Render(" unlock  ") + s.KeyHint.Render("Esc") + s.Muted.Render(" skip as guest"),
	}, "\n")
	page := lipgloss.NewStyle().Width(w).Render(body)
	return m.renderAppFrame(lipgloss.Place(contentW, contentH, lipgloss.Center, lipgloss.Center, page), true)
}

// --- Help Overlay ---

func (m *AppModel) viewHelpOverlay() string {
	s := m.styles
	_, _, _, _, contentW, contentH := m.frameMetrics()
	w := minInt(82, maxInt(50, contentW-4))
	lines := []string{
		s.BadgeLive.Render("WAVEFUNC TERMINAL (wf) // KEYBINDINGS"),
		"",
		s.Subtitle.Render("NAVIGATION"),
		"  " + s.KeyHint.Render("1-4 / Tab   ") + s.Text.Render("Switch tabs: TRANSMIT · ARCHIVE · CRATE · ASSEMBLY"),
		"  " + s.KeyHint.Render("j/k / ↑/↓   ") + s.Text.Render("Move cursor  (PgUp/PgDn to jump)"),
		"  " + s.KeyHint.Render("[ / ]       ") + s.Text.Render("Switch sub-view (Stations/Charts/Recent, Crate/Signals)"),
		"  " + s.KeyHint.Render("/           ") + s.Text.Render("Full-text NIP-50 station search"),
		"  " + s.KeyHint.Render("g / c / x   ") + s.Text.Render("Cycle genre · cycle country · clear filters"),
		"",
		s.Subtitle.Render("PLAYBACK"),
		"  " + s.KeyHint.Render("Enter       ") + s.Text.Render("Play selected station (or stream inside Inspector)"),
		"  " + s.KeyHint.Render("Space / S   ") + s.Text.Render("Pause/Resume  ·  Stop playback"),
		"  " + s.KeyHint.Render("+ / - / m   ") + s.Text.Render("Volume up/down  ·  Mute toggle"),
		"  " + s.KeyHint.Render("z           ") + s.Text.Render("Cycle sleep timer (15m → 30m → 60m → off)"),
		"",
		s.Subtitle.Render("NOSTR & SOCIAL"),
		"  " + s.KeyHint.Render("f           ") + s.Text.Render("Favorite station (syncs across devices via kind 30078)"),
		"  " + s.KeyHint.Render("s           ") + s.Text.Render("Save currently playing ICY track to Song Crate (31337)"),
		"  " + s.KeyHint.Render("r           ") + s.Text.Render("React ") + s.Primary.Render("♥") + s.Text.Render(" to selected station or Assembly post"),
		"  " + s.KeyHint.Render("i           ") + s.Text.Render("Open Station Inspector, stream selector & NIP-22 comments"),
		"  " + s.KeyHint.Render("a           ") + s.Text.Render("Account, Nostr login (QR NIP-46/nsec/keygen) & settings"),
		"  " + s.KeyHint.Render("t / ? / q   ") + s.Text.Render("Toggle theme  ·  Help  ·  Quit"),
		"",
		s.Muted.Render("Press Esc or ? to close"),
	}
	page := lipgloss.NewStyle().Width(w).Render(strings.Join(lines, "\n"))
	return m.renderAppFrame(lipgloss.Place(contentW, contentH, lipgloss.Center, lipgloss.Center, page), true)
}
