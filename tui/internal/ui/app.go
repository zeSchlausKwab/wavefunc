package ui

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"fiatjaf.com/nostr"
	"github.com/zeSchlausKwab/wavefunc/tui/internal/auth"
	"github.com/zeSchlausKwab/wavefunc/tui/internal/config"
	nostrclient "github.com/zeSchlausKwab/wavefunc/tui/internal/nostr"
	"github.com/zeSchlausKwab/wavefunc/tui/internal/player"
	"github.com/zeSchlausKwab/wavefunc/tui/internal/ui/anim"
	"github.com/zeSchlausKwab/wavefunc/tui/internal/ui/theme"
)

type Tab int

const (
	TabTransmit Tab = iota
	TabArchive
	TabCrate
	TabAssembly
)

// LaunchOptions configures initial CLI startup behavior.
type LaunchOptions struct {
	RelayOverride  string
	ThemeOverride  string
	SkipOnboarding bool
	PlayQuery      string
	Lucky          bool
	Version        string
}

// AppModel is the root Bubble Tea model for wf.
type AppModel struct {
	opts      LaunchOptions
	cfg       config.Config
	styles    theme.Styles
	animator  *anim.Animator
	nostr     *nostrclient.Client
	player    *player.Supervisor
	listening *nostrclient.ListeningPublisher
	session   auth.Session

	width  int
	height int

	tab     Tab
	overlay overlayKind

	onboard   onboardingState
	transmit  transmitState
	archive   archiveState
	crate     crateState
	assembly  assemblyState
	drawer    stationDrawerState
	favPicker favPickerState
	account   accountModalState

	unlockInput textinput.Model
	unlockErr   string

	// Live data caches
	playerSnap       player.Snapshot
	stationCount     int
	stations         []nostrclient.Station
	stationByAddr    map[string]nostrclient.Station
	discover         nostrclient.DiscoverBundle
	featuredStations []nostrclient.Station
	favoriteLists    []nostrclient.FavoritesList
	songLists        []nostrclient.SongList
	songByAddr       map[string]nostrclient.Song
	communitySignals []nostrclient.Song
	assemblyPosts    []nostrclient.CommunityPost
	history          []config.HistoryEntry

	// NIP-46 QR pairing state
	qrURI    string
	qrArt    string
	qrCols   int
	qrRows   int
	qrCancel context.CancelFunc

	// Toast banner
	toastText string
	toastErr  bool
	toastSeq  uint64
}

func NewApp(opts LaunchOptions) *AppModel {
	cfg, exists, _ := config.Load()
	if opts.RelayOverride != "" {
		cfg.AppRelay = opts.RelayOverride
	}
	if opts.ThemeOverride == "light" || opts.ThemeOverride == config.ThemePaperLight {
		cfg.Theme = config.ThemePaperLight
	} else if opts.ThemeOverride == "dark" || opts.ThemeOverride == config.ThemeSonicDark {
		cfg.Theme = config.ThemeSonicDark
	}

	nc := nostrclient.NewClient(cfg.AppRelay)
	sup := player.NewSupervisor(cfg.PreferredBackend, cfg.Volume)
	lp := nostrclient.NewListeningPublisher(nc)
	hist, _ := config.LoadHistory()

	// Restore persisted Nostr session if available.
	var sess auth.Session = auth.NewGuestSession()
	needsUnlock := false
	if restored, err := auth.RestoreSession(nc.Pool, ""); err == nil && restored != nil {
		sess = restored
	} else if errors.Is(err, auth.ErrPassphraseRequired) {
		needsUnlock = true
	}
	lp.Configure(cfg.NIP38Broadcast, sess)

	showOnboarding := (!exists || !cfg.OnboardingCompleted) && !opts.SkipOnboarding && opts.PlayQuery == "" && !opts.Lucky

	unlockIn := textinput.New()
	unlockIn.Placeholder = "Passphrase..."
	unlockIn.EchoMode = textinput.EchoPassword
	unlockIn.CharLimit = 128
	unlockIn.Width = 42

	m := &AppModel{
		opts:          opts,
		cfg:           cfg,
		styles:        theme.ForName(cfg.Theme),
		animator:      anim.New(),
		nostr:         nc,
		player:        sup,
		listening:     lp,
		session:       sess,
		width:         110,
		height:        34,
		onboard:       newOnboardingState(showOnboarding),
		transmit:      newTransmitState(),
		archive:       newArchiveState(),
		drawer:        newStationDrawerState(),
		assembly:      newAssemblyState(),
		account:       newAccountModalState(),
		unlockInput:   unlockIn,
		playerSnap:    sup.Snapshot(),
		stationByAddr: make(map[string]nostrclient.Station),
		songByAddr:    make(map[string]nostrclient.Song),
		history:       hist,
	}

	if opts.PlayQuery != "" {
		m.transmit.searchInput.SetValue(opts.PlayQuery)
	}
	if needsUnlock {
		m.overlay = overlayUnlockPassphrase
		m.unlockInput.Focus()
	}

	return m
}

// Cleanup shuts down audio, NIP-38 broadcast, NIP-46, and relay sockets cleanly.
func (m *AppModel) Cleanup() {
	m.cancelQRPairing()
	if m.player != nil {
		m.player.Close()
	}
	if m.listening != nil {
		m.listening.Stop()
	}
	if m.session != nil {
		_ = m.session.Close()
	}
	if m.nostr != nil {
		m.nostr.Close()
	}
}

func (m *AppModel) Init() tea.Cmd {
	cmds := []tea.Cmd{
		m.tickCmd(),
		waitPlayerSnapCmd(m.player.Updates()),
		m.warmRelayCmd(),
		m.fetchStationCountCmd(),
		m.fetchDiscoverCmd(m.opts.Lucky),
		m.fetchStationsCmd(m.opts.PlayQuery != ""),
	}
	if m.session.Mode() != auth.ModeGuest {
		cmds = append(cmds, m.fetchUserListsCmd(), m.warmUserMetaCmd())
	}
	return tea.Batch(cmds...)
}

func (m *AppModel) tickCmd() tea.Cmd {
	interval := 50 * time.Millisecond // 20 FPS when actively animating
	if !m.onboard.active && m.playerSnap.Status == player.StatusPaused && m.overlay == overlayNone {
		interval = 350 * time.Millisecond
	}
	return tea.Tick(interval, func(t time.Time) tea.Msg { return tickMsg(t) })
}

func waitPlayerSnapCmd(ch <-chan player.Snapshot) tea.Cmd {
	return func() tea.Msg {
		snap, ok := <-ch
		if !ok {
			return nil
		}
		return playerSnapMsg(snap)
	}
}

func (m *AppModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	case tickMsg:
		m.animator.Step(m.playerSnap.Status, m.playerSnap.Muted)
		return m, m.tickCmd()

	case playerSnapMsg:
		snap := player.Snapshot(msg)
		prevTrack := m.playerSnap.Track.Display()
		prevStatus := m.playerSnap.Status
		m.playerSnap = snap

		// Keep NIP-38 listening status synced when enabled.
		if snap.Status == player.StatusPlaying && snap.Station != nil {
			title := snap.Track.Song
			artist := snap.Track.Artist
			if title == "" {
				title = snap.Station.Name
			}
			if prevStatus != player.StatusPlaying || snap.Track.Display() != prevTrack {
				m.listening.Update(&nostrclient.ListeningTrack{
					Title:   title,
					Artist:  artist,
					Address: snap.Station.Address,
					URL:     snap.Station.Website,
				})
			}
		} else if prevStatus == player.StatusPlaying && snap.Status != player.StatusPlaying && snap.Status != player.StatusBuffering {
			m.listening.Update(nil)
		}

		// Surface playback failure once as a helpful toast.
		var cmds []tea.Cmd
		cmds = append(cmds, waitPlayerSnapCmd(m.player.Updates()))
		if snap.Status == player.StatusFailed && snap.Error != "" && prevStatus != player.StatusFailed {
			cmds = append(cmds, m.toastCmd("Playback: "+truncate(snap.Error, 64), true))
		}
		return m, tea.Batch(cmds...)

	case relayWarmMsg:
		return m, nil

	case stationCountMsg:
		if msg.err == nil {
			m.stationCount = msg.count
		}
		return m, nil

	case stationsLoadedMsg:
		if msg.seq != m.transmit.searchSeq && msg.seq != 0 {
			return m, nil
		}
		m.transmit.loading = false
		if msg.err != nil {
			return m, m.toastCmd("Relay fetch failed: "+msg.err.Error(), true)
		}
		m.stations = msg.stations
		for _, st := range msg.stations {
			m.stationByAddr[st.Address] = st
		}
		if m.transmit.cursor >= len(m.stations) {
			m.transmit.cursor = 0
		}
		var cmds []tea.Cmd
		if len(msg.stations) > 0 {
			addrs := make([]string, 0, minInt(60, len(msg.stations)))
			for i := 0; i < len(msg.stations) && i < 60; i++ {
				addrs = append(addrs, msg.stations[i].Address)
			}
			cmds = append(cmds, m.fetchHealthBatchCmd(addrs))
		}
		if msg.autoPlay && len(msg.stations) > 0 {
			m.playStation(msg.stations[0], 0)
		}
		return m, tea.Batch(cmds...)

	case discoverLoadedMsg:
		if msg.err == nil {
			m.discover = msg.bundle
			for addr, st := range msg.bundle.Stations {
				m.stationByAddr[addr] = st
			}
			// Build deduplicated featured station starter list.
			seen := make(map[string]struct{})
			var featured []nostrclient.Station
			for _, metric := range []string{"best-signal", "on-air-now", "most-liked"} {
				if r, ok := msg.bundle.Rankings[metric]; ok {
					for _, e := range r.Entries {
						if st, exists := msg.bundle.Stations[e.StationAddress]; exists {
							if _, dup := seen[st.Address]; !dup {
								seen[st.Address] = struct{}{}
								featured = append(featured, st)
							}
						}
					}
				}
			}
			for _, fl := range msg.bundle.FeaturedLists {
				for _, addr := range fl.StationAddresses {
					if st, exists := msg.bundle.Stations[addr]; exists {
						if _, dup := seen[st.Address]; !dup {
							seen[st.Address] = struct{}{}
							featured = append(featured, st)
						}
					}
				}
			}
			m.featuredStations = featured
			if msg.autoPlay {
				return m, m.playLuckyCmd()
			}
		} else if msg.autoPlay {
			return m, m.playLuckyCmd()
		}
		return m, nil

	case healthLoadedMsg:
		if m.playerSnap.Station != nil {
			if tr, ok := msg.tracks[m.playerSnap.Station.Address]; ok && tr.Display() != "" {
				m.player.SetFallbackTrack(m.playerSnap.Station.Address, player.TrackInfo{
					Raw:    tr.Display(),
					Artist: tr.Artist,
					Song:   firstNonEmpty(tr.Song, tr.Title),
					Source: "observer",
				})
			}
		}
		return m, nil

	case userListsLoadedMsg:
		m.archive.loading = false
		m.crate.loading = false
		if msg.err == nil {
			m.favoriteLists = msg.bundle.FavoriteLists
			m.songLists = msg.bundle.SongLists
			for addr, st := range msg.bundle.Stations {
				m.stationByAddr[addr] = st
			}
			for addr, song := range msg.bundle.Songs {
				m.songByAddr[addr] = song
			}
			if m.archive.listCursor >= len(m.favoriteLists) {
				m.archive.listCursor = maxInt(0, len(m.favoriteLists)-1)
			}
		}
		return m, nil

	case signalsLoadedMsg:
		m.crate.loading = false
		if msg.err == nil {
			m.communitySignals = msg.songs
		}
		return m, nil

	case stationSocialLoadedMsg:
		m.drawer.loading = false
		if msg.err == nil && msg.social.StationAddress == m.drawer.station.Address {
			m.drawer.social = msg.social
		}
		return m, nil

	case assemblyLoadedMsg:
		m.assembly.loading = false
		if msg.err == nil {
			if msg.append {
				seen := make(map[string]struct{}, len(m.assemblyPosts))
				for _, p := range m.assemblyPosts {
					seen[p.ID] = struct{}{}
				}
				for _, p := range msg.posts {
					if _, ok := seen[p.ID]; !ok {
						m.assemblyPosts = append(m.assemblyPosts, p)
					}
				}
			} else {
				m.assemblyPosts = msg.posts
			}
			for _, p := range m.assemblyPosts {
				if m.assembly.oldestUnix == 0 || p.CreatedAt < m.assembly.oldestUnix {
					m.assembly.oldestUnix = p.CreatedAt
				}
			}
		}
		return m, nil

	case searchDebounceMsg:
		if msg.seq != m.transmit.searchSeq {
			return m, nil
		}
		return m, m.fetchStationsCmd(false)

	case actionResultMsg:
		var cmds []tea.Cmd
		if msg.toast != "" {
			cmds = append(cmds, m.toastCmd(msg.toast, msg.isErr))
		}
		if msg.reloadLists && m.session.Mode() != auth.ModeGuest {
			cmds = append(cmds, m.fetchUserListsCmd())
		}
		if msg.reloadFeed {
			cmds = append(cmds, m.fetchAssemblyCmd(false))
		}
		if msg.reloadSoc != nil && m.overlay == overlayStationDrawer && m.drawer.station.Address == msg.reloadSoc.Address {
			cmds = append(cmds, m.fetchStationSocialCmd(*msg.reloadSoc))
		}
		return m, tea.Batch(cmds...)

	case authSessionMsg:
		m.onboard.authBusy = false
		m.account.busy = false
		if msg.err != nil {
			m.onboard.authError = msg.err.Error()
			m.account.errMsg = msg.err.Error()
			m.unlockErr = msg.err.Error()
			return m, m.toastCmd(msg.err.Error(), true)
		}
		if m.session != nil {
			_ = m.session.Close()
		}
		m.session = msg.session
		m.listening.Configure(m.cfg.NIP38Broadcast, m.session)
		m.unlockErr = ""
		if m.overlay == overlayUnlockPassphrase {
			m.overlay = overlayNone
		}

		if msg.isNewAccount {
			if m.onboard.active {
				m.onboard.createdNpub = msg.session.Npub()
				m.onboard.createdNsec = msg.backupNsec
				m.onboard.authSub = onboardAuthCreateBackup
			} else {
				m.account.createdNpub = msg.session.Npub()
				m.account.createdNsec = msg.backupNsec
				m.account.sub = accountBackup
			}
		} else {
			if m.onboard.active {
				m.finishOnboarding()
			} else if m.overlay == overlayAccount {
				m.account.sub = accountMenu
			}
		}

		var cmds []tea.Cmd
		if m.session.Mode() != auth.ModeGuest {
			cmds = append(cmds, m.fetchUserListsCmd(), m.warmUserMetaCmd(), m.toastCmd("Signed in as "+shortNpub(m.session.Npub()), false))
		} else {
			m.favoriteLists = nil
			m.songLists = nil
			cmds = append(cmds, m.toastCmd("Switched to Guest mode", false))
		}
		return m, tea.Batch(cmds...)

	case nostrConnectPreparedMsg:
		if msg.err != nil {
			m.onboard.authError = msg.err.Error()
			m.account.errMsg = msg.err.Error()
			m.onboard.authBusy = false
			m.account.busy = false
			return m, nil
		}
		m.qrURI = msg.pairing.URI
		m.qrArt = msg.qrArt
		m.qrCols = msg.qrCols
		m.qrRows = msg.qrRows
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		m.qrCancel = cancel
		return m, waitNostrConnectCmd(ctx, msg.pairing)

	case nostrConnectCompletedMsg:
		m.cancelQRPairing()
		m.onboard.authBusy = false
		m.account.busy = false
		if msg.err != nil {
			m.onboard.authError = msg.err.Error()
			m.account.errMsg = msg.err.Error()
			return m, nil
		}
		_ = auth.SaveSession(msg.session, "")
		return m, func() tea.Msg {
			return authSessionMsg{session: msg.session}
		}

	case clearToastMsg:
		if msg.id == m.toastSeq {
			m.toastText = ""
		}
		return m, nil

	case tea.KeyMsg:
		return m, m.handleKey(msg)
	}

	return m, nil
}

func (m *AppModel) handleKey(msg tea.KeyMsg) tea.Cmd {
	k := msg.String()
	if k == "ctrl+c" {
		return m.quitCmd()
	}

	// Passphrase unlock overlay takes top priority.
	if m.overlay == overlayUnlockPassphrase {
		return m.updateUnlockOverlay(msg)
	}

	// Optional first-run onboarding intercepts keys until completed or skipped.
	if m.onboard.active {
		return m.updateOnboarding(msg)
	}

	// Active modal / drawer overlays.
	switch m.overlay {
	case overlayStationDrawer:
		return m.updateStationDrawer(msg)
	case overlayFavPicker:
		return m.updateFavPicker(msg)
	case overlayAccount:
		return m.updateAccountModal(msg)
	case overlayHelp:
		if k == "esc" || k == "?" || k == "q" {
			m.overlay = overlayNone
		}
		return nil
	}

	// If a text input is actively focused inside the current tab, delegate directly.
	if m.isTextInputActive() {
		return m.delegateTabKey(msg)
	}

	// Global shortcuts when no text input is active.
	switch k {
	case "q":
		return m.quitCmd()
	case "?":
		m.overlay = overlayHelp
		return nil
	case "a":
		m.openAccountModal()
		return nil
	case "t":
		m.toggleTheme()
		return m.toastCmd("Theme: "+m.styles.Palette.Name, false)
	case "1":
		return m.switchTab(TabTransmit)
	case "2":
		return m.switchTab(TabArchive)
	case "3":
		return m.switchTab(TabCrate)
	case "4":
		return m.switchTab(TabAssembly)
	case "tab":
		return m.switchTab((m.tab + 1) % 4)
	case "shift+tab":
		return m.switchTab((m.tab + 3) % 4)
	case " ":
		m.player.TogglePause()
		return nil
	case "S":
		m.player.Stop()
		return nil
	case "+", "=":
		v := m.player.DeltaVolume(5)
		m.cfg.Volume = v
		m.saveConfigAsync()
		return nil
	case "-", "_":
		v := m.player.DeltaVolume(-5)
		m.cfg.Volume = v
		m.saveConfigAsync()
		return nil
	case "m":
		muted := m.player.ToggleMute()
		if muted {
			return m.toastCmd("Muted", false)
		}
		return m.toastCmd("Unmuted", false)
	case "z":
		return m.toastCmd(m.player.CycleSleepTimer(), false)
	case "s":
		return m.saveCurrentTrackCmd()
	}

	return m.delegateTabKey(msg)
}

func (m *AppModel) isTextInputActive() bool {
	if m.tab == TabTransmit && m.transmit.searchActive {
		return true
	}
	if m.tab == TabArchive && m.archive.inputMode != archiveInputNone {
		return true
	}
	if m.tab == TabAssembly && m.assembly.composeMode != assemblyComposeNone {
		return true
	}
	return false
}

func (m *AppModel) delegateTabKey(msg tea.KeyMsg) tea.Cmd {
	switch m.tab {
	case TabTransmit:
		return m.updateTransmit(msg)
	case TabArchive:
		return m.updateArchive(msg)
	case TabCrate:
		return m.updateCrate(msg)
	case TabAssembly:
		return m.updateAssembly(msg)
	}
	return nil
}

func (m *AppModel) switchTab(t Tab) tea.Cmd {
	m.tab = t
	switch t {
	case TabArchive:
		if m.session.Mode() != auth.ModeGuest && len(m.favoriteLists) == 0 {
			m.archive.loading = true
			return m.fetchUserListsCmd()
		}
	case TabCrate:
		if m.session.Mode() != auth.ModeGuest && len(m.songLists) == 0 {
			m.crate.loading = true
			return m.fetchUserListsCmd()
		}
		if m.session.Mode() == auth.ModeGuest && len(m.communitySignals) == 0 {
			m.crate.sub = crateSignals
			m.crate.loading = true
			return m.fetchSignalsCmd()
		}
	case TabAssembly:
		if len(m.assemblyPosts) == 0 {
			m.assembly.loading = true
			return m.fetchAssemblyCmd(false)
		}
	}
	return nil
}

// frameMetrics returns one consistent, spacious outer container geometry used
// across every screen (onboarding, main tabs, drawers, modals, QR, and help)
// so the box never jumps or resizes during navigation.
func (m *AppModel) frameMetrics() (totalW, totalH, innerW, innerH, contentW, contentH int) {
	totalW = m.width
	if m.width >= 100 {
		totalW = minInt(m.width-2, 148)
	}
	totalW = maxInt(58, totalW)

	totalH = m.height
	if m.height >= 30 {
		totalH = minInt(m.height-2, 46)
	}
	totalH = maxInt(18, totalH)

	// ThickBorder consumes 2 cols & 2 rows; Frame Padding(0, 1) consumes 2 cols.
	innerW = maxInt(54, totalW-2)
	innerH = maxInt(16, totalH-2)
	contentW = maxInt(50, innerW-2)
	contentH = innerH
	return
}

// renderAppFrame wraps any view in the fixed-size Constructivist outer container.
func (m *AppModel) renderAppFrame(content string, primaryBorder bool) string {
	totalW, totalH, innerW, innerH, contentW, contentH := m.frameMetrics()
	clipped := lipgloss.NewStyle().
		Width(contentW).
		Height(contentH).
		MaxWidth(contentW).
		MaxHeight(contentH).
		Render(content)

	frameStyle := m.styles.Frame
	if !primaryBorder {
		frameStyle = m.styles.FrameAccent
	}
	box := frameStyle.
		Width(innerW).
		Height(innerH).
		MaxWidth(totalW).
		MaxHeight(totalH).
		Render(clipped)

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, box)
}

// renderQRPanel renders the NIP-46 QR code side-by-side with status/instructions
// so it never wraps horizontally or overflows vertically inside the fixed frame.
func (m *AppModel) renderQRPanel(header, title, errMsg string, contentW, contentH int) string {
	s := m.styles
	if m.qrArt == "" {
		loading := strings.Join([]string{
			header,
			"",
			s.Title.Render(title),
			"",
			s.Accent.Render("◌ Generating NIP-46 Nostr Connect QR code..."),
			"",
			s.KeyHint.Render("Esc") + s.Muted.Render(" cancel"),
		}, "\n")
		return lipgloss.Place(contentW, contentH, lipgloss.Center, lipgloss.Center, loading)
	}

	errLine := ""
	if errMsg != "" {
		errLine = "\n" + s.Danger.Render("✗ "+errMsg)
	}

	// Side-by-side layout whenever width allows (preferred — fits even 26-row terminals!).
	if m.qrCols > 0 && m.qrRows <= contentH && contentW >= m.qrCols+28 {
		rightW := maxInt(24, contentW-m.qrCols-3)
		infoLines := []string{}
		if header != "" {
			infoLines = append(infoLines, header, "")
		}
		infoLines = append(infoLines,
			s.Title.Render(title),
			s.Muted.Render(wrapText("Scan with Amber, Primal, or nsec.app on your phone. Your private key never touches this terminal.", rightW, 4)),
			"",
			s.Accent.Render("◌ Waiting for signer approval..."),
			"",
			s.Subtitle.Render("PAIRING URI:"),
			s.Muted.Render(wrapText(m.qrURI, rightW, 4))+errLine,
			"",
			s.KeyHint.Render("Esc")+s.Muted.Render(" cancel & go back"),
		)
		rightCol := lipgloss.NewStyle().
			Width(rightW).
			Height(m.qrRows).
			AlignVertical(lipgloss.Center).
			Render(strings.Join(infoLines, "\n"))

		row := lipgloss.JoinHorizontal(lipgloss.Center, m.qrArt, "   ", rightCol)
		return lipgloss.Place(contentW, contentH, lipgloss.Center, lipgloss.Center, row)
	}

	// Stacked layout for narrow, tall terminals where QR still fits cleanly.
	if m.qrCols > 0 && m.qrCols <= contentW && m.qrRows+5 <= contentH {
		stacked := strings.Join([]string{
			s.Title.Render(title),
			m.qrArt,
			s.Accent.Render("◌ Waiting for signer approval...") + errLine,
			s.KeyHint.Render("Esc") + s.Muted.Render(" cancel"),
		}, "\n")
		return lipgloss.Place(contentW, contentH, lipgloss.Center, lipgloss.Center, stacked)
	}

	// Clean fallback if terminal is physically smaller than the QR matrix.
	fallbackW := minInt(66, contentW-4)
	fallback := strings.Join([]string{
		header,
		"",
		s.Title.Render(title),
		s.Warning.Render(fmt.Sprintf("! Terminal too small to display QR cleanly (need at least %dx%d, currently %dx%d).", m.qrCols+6, m.qrRows+2, m.width, m.height)),
		s.Muted.Render("Enlarge your terminal pane to reveal the QR code, or paste this URI into your signer:"),
		"",
		s.InputBox.Width(fallbackW).Render(wrapText(m.qrURI, fallbackW-4, 4)) + errLine,
		"",
		s.Accent.Render("◌ Still waiting for remote signer approval..."),
		s.KeyHint.Render("Esc") + s.Muted.Render(" cancel"),
	}, "\n")
	return lipgloss.Place(contentW, contentH, lipgloss.Center, lipgloss.Center, fallback)
}

func (m *AppModel) View() string {
	if m.width < 20 || m.height < 10 {
		return "Terminal too small for WaveFunc (need at least 60x18)"
	}

	if m.overlay == overlayUnlockPassphrase {
		return m.viewUnlockOverlay()
	}
	if m.onboard.active {
		return m.viewOnboarding()
	}

	switch m.overlay {
	case overlayStationDrawer:
		return m.viewStationDrawer()
	case overlayFavPicker:
		return m.viewFavPicker()
	case overlayAccount:
		return m.viewAccountModal()
	case overlayHelp:
		return m.viewHelpOverlay()
	}

	_, _, _, _, contentW, contentH := m.frameMetrics()
	header := m.renderHeader(contentW)
	dock := m.renderNowPlayingDock(contentW, contentH)
	headerH := lipgloss.Height(header)
	dockH := lipgloss.Height(dock)
	bodyH := maxInt(5, contentH-headerH-dockH)

	var body string
	switch m.tab {
	case TabTransmit:
		body = m.viewTransmit(contentW, bodyH)
	case TabArchive:
		body = m.viewArchive(contentW, bodyH)
	case TabCrate:
		body = m.viewCrate(contentW, bodyH)
	case TabAssembly:
		body = m.viewAssembly(contentW, bodyH)
	}

	inner := lipgloss.JoinVertical(lipgloss.Left, header, body, dock)
	return m.renderAppFrame(inner, true)
}

func (m *AppModel) renderHeader(width int) string {
	s := m.styles
	brand := s.Brand.Render("((●)) WAVEFUNC")

	tabNames := []string{"[1] TRANSMIT", "[2] ARCHIVE", "[3] CRATE", "[4] ASSEMBLY"}
	var tabs []string
	for i, name := range tabNames {
		if Tab(i) == m.tab {
			tabs = append(tabs, s.TabActive.Render(name))
		} else {
			tabs = append(tabs, s.TabIdle.Render(name))
		}
	}

	acctLabel := s.BadgeMuted.Render("[a] GUEST")
	if m.session.Mode() != auth.ModeGuest {
		prof := m.nostr.Profile(m.session.PubKey().Hex())
		acctLabel = s.BadgeCyan.Render("@" + truncate(prof.Label(), 14))
	}
	if m.cfg.NIP38Broadcast && m.session.CanSign() {
		acctLabel += " " + s.Primary.Render("◉")
	}

	left := brand + " " + strings.Join(tabs, "")
	right := acctLabel + " " + s.Muted.Render("[?] help")
	gap := maxInt(1, width-lipgloss.Width(left)-lipgloss.Width(right))
	return left + strings.Repeat(" ", gap) + right
}

func (m *AppModel) renderNowPlayingDock(width, contentH int) string {
	s := m.styles
	snap := m.playerSnap
	innerW := maxInt(40, width-4)

	// Bigger rotating 3D cube in the player dock:
	// 12x5 (24x20 Braille sub-pixels + inner sonic core) on normal terminals,
	// scaling cleanly to 10x4 on short terminals.
	tallDock := contentH >= 24
	showCube := innerW >= 64
	cubeCols, cubeRows := 10, 4
	cubeWithCore := false
	if tallDock {
		cubeCols, cubeRows = 12, 5
		cubeWithCore = true
	}

	infoW := innerW
	if showCube {
		infoW = innerW - cubeCols - 3 // cube + " │ "
	}

	deck := m.animator.RenderCompactDeck(snap.Status, s.Accent, s.Primary, s.Muted)
	spec := m.animator.RenderSpectrum(16, snap.Status, snap.Muted, s.Accent, s.Primary, s.Muted)

	statusBadge := s.BadgeMuted.Render("STANDBY")
	switch snap.Status {
	case player.StatusPlaying:
		statusBadge = s.BadgeLive.Render("LIVE")
	case player.StatusTuning:
		statusBadge = s.BadgeCyan.Render("TUNING")
	case player.StatusBuffering:
		statusBadge = s.BadgeWarn.Render("BUFFER")
	case player.StatusPaused:
		statusBadge = s.BadgeMuted.Render("PAUSED")
	case player.StatusFailed:
		statusBadge = s.ToastErr.Render("OFFLINE")
	}

	stationTitle := s.Muted.Render("Select a station and press Enter to tune in")
	trackLine := s.Muted.Render("No active stream — pick a station and press Enter")
	controlsLine := s.Muted.Render("[Space] pause · [S] stop · [+/-] vol · [m] mute · [z] sleep · [t] theme · [q] quit")

	if snap.Station != nil {
		q := snap.Station.QualityBadge()
		name := s.Title.Render(truncate(snap.Station.Name, maxInt(14, infoW-42)))
		if q != "" {
			name += " " + s.Muted.Render("· "+q)
		}
		stationTitle = name

		if !snap.Track.Empty() {
			trackLine = s.Accent.Render("♪ "+truncate(snap.Track.Display(), maxInt(18, infoW-34))) + "  " + s.KeyHint.Render("[s]") + s.Muted.Render(" save to crate")
		} else if snap.Status == player.StatusFailed && snap.Error != "" {
			trackLine = s.Danger.Render("✗ " + truncate(snap.Error, maxInt(18, infoW-10)))
		} else {
			trackLine = s.Muted.Render("Listening to " + truncate(snap.Station.Name, maxInt(18, infoW-36)) + " · awaiting track info")
		}
	}

	volStr := anim.RenderVolumeBar(snap.Volume, snap.Muted, s.Accent, s.Primary, s.Muted) + s.Muted.Render(fmt.Sprintf(" %3d%%", snap.Volume))
	sleepStr := ""
	if rem := snap.SleepRemaining(time.Now()); rem > 0 {
		sleepStr = " " + s.BadgeWarn.Render(fmt.Sprintf("SLEEP %02d:%02d", int(rem.Minutes()), int(rem.Seconds())%60))
	}

	// Row 1: deck + LIVE badge + station title (left) | volume + sleep (right)
	row1Left := deck + " " + statusBadge + " " + stationTitle
	row1Right := volStr + sleepStr
	gap1 := maxInt(1, infoW-lipgloss.Width(row1Left)-lipgloss.Width(row1Right))
	row1 := row1Left + strings.Repeat(" ", gap1) + row1Right

	// Row 2: live ICY track (left) | spring-animated spectrum bars (right)
	gapTrack := maxInt(1, infoW-lipgloss.Width(trackLine)-lipgloss.Width(spec))
	rowTrack := trackLine + strings.Repeat(" ", gapTrack) + spec

	// Row 3: FM tuning dial (left) | toast notification (right)
	dialLeft := s.Muted.Render("88 ") + m.animator.RenderTuningDial(22, snap.Status, s.Accent, s.Primary, s.Muted) + s.Muted.Render(" 108 MHz")
	dialRight := ""
	if m.toastText != "" {
		if m.toastErr {
			dialRight = s.ToastErr.Render(" " + truncate(m.toastText, 40) + " ")
		} else {
			dialRight = s.ToastOK.Render(" " + truncate(m.toastText, 40) + " ")
		}
	}
	gapDial := maxInt(1, infoW-lipgloss.Width(dialLeft)-lipgloss.Width(dialRight))
	rowDial := dialLeft + strings.Repeat(" ", gapDial) + dialRight

	// Row 4: transport controls strip
	rowControls := truncate(controlsLine, infoW)
	if lipgloss.Width(controlsLine) <= infoW {
		rowControls = controlsLine
	}

	var rows []string
	if tallDock {
		// 5 airy lines matching the 12x5 rotating 3D cube cleanly (zero vertical collisions!).
		rows = []string{row1, "", rowTrack, rowDial, rowControls}
	} else {
		// 4 crisp lines matching the 10x4 rotating 3D cube on short terminals.
		rows = []string{row1, rowTrack, rowDial, rowControls}
	}
	infoBlock := lipgloss.NewStyle().Width(infoW).Render(strings.Join(rows, "\n"))

	content := infoBlock
	if showCube {
		cubeArt := m.animator.RenderCube(cubeCols, cubeRows, snap.Status, snap.Muted, cubeWithCore, s.Accent, s.Primary, s.Muted)
		sepLines := make([]string, cubeRows)
		for i := range sepLines {
			sepLines[i] = "│"
		}
		sep := s.Muted.Render(strings.Join(sepLines, "\n"))
		content = lipgloss.JoinHorizontal(lipgloss.Center, cubeArt, " ", sep, " ", infoBlock)
	}

	return s.Dock.Width(width - 2).Render(content)
}

// --- Commands & Actions ---

func (m *AppModel) quitCmd() tea.Cmd {
	m.Cleanup()
	return tea.Quit
}

func (m *AppModel) toggleTheme() {
	if m.cfg.Theme == config.ThemePaperLight {
		m.cfg.Theme = config.ThemeSonicDark
	} else {
		m.cfg.Theme = config.ThemePaperLight
	}
	m.styles = theme.ForName(m.cfg.Theme)
	m.saveConfigAsync()
}

func (m *AppModel) saveConfigAsync() {
	cfg := m.cfg
	go func() {
		_ = config.Save(cfg)
	}()
}

func (m *AppModel) toastCmd(text string, isErr bool) tea.Cmd {
	m.toastSeq++
	seq := m.toastSeq
	m.toastText = text
	m.toastErr = isErr
	return tea.Tick(3*time.Second, func(time.Time) tea.Msg {
		return clearToastMsg{id: seq}
	})
}

func (m *AppModel) playStation(st nostrclient.Station, streamIdx int) {
	m.animator.Retune(st.Address + st.Name)
	m.player.Play(st, streamIdx)
	m.cfg.LastStationAddress = st.Address
	m.saveConfigAsync()

	if tr, ok := m.nostr.CachedNowPlaying(st.Address); ok && tr.Display() != "" {
		m.player.SetFallbackTrack(st.Address, player.TrackInfo{
			Raw:    tr.Display(),
			Artist: tr.Artist,
			Song:   firstNonEmpty(tr.Song, tr.Title),
			Source: "observer",
		})
	}

	updated, err := config.RecordHistory(config.HistoryEntry{
		Address:     st.Address,
		Name:        st.Name,
		CountryCode: st.CountryCode,
		Genres:      st.Genres,
		PlayedAt:    time.Now().Unix(),
	})
	if err == nil {
		m.history = updated
	}
}

func (m *AppModel) playLuckyCmd() tea.Cmd {
	pool := m.featuredStations
	if len(pool) == 0 {
		pool = m.stations
	}
	if len(pool) == 0 {
		return m.toastCmd("Still loading stations...", false)
	}
	st := pool[rand.Intn(len(pool))]
	m.playStation(st, 0)
	return m.toastCmd("◈ Tuned into "+st.Name, false)
}

func (m *AppModel) resolveAndPlayCmd(addr string) tea.Cmd {
	return func() tea.Msg {
		resolved, err := m.nostr.FetchStationsByAddresses(context.Background(), []string{addr})
		if err != nil {
			return actionResultMsg{toast: "Failed to resolve station", isErr: true}
		}
		if st, ok := resolved[addr]; ok {
			return stationsLoadedMsg{stations: []nostrclient.Station{st}, autoPlay: true}
		}
		return actionResultMsg{toast: "Station not found on relay", isErr: true}
	}
}

func (m *AppModel) isFavorited(stationAddress string) bool {
	if stationAddress == "" {
		return false
	}
	for _, fl := range m.favoriteLists {
		if fl.HasStation(stationAddress) {
			return true
		}
	}
	return false
}

func (m *AppModel) triggerFavoriteStation(st nostrclient.Station) tea.Cmd {
	if m.session.Mode() == auth.ModeGuest {
		m.openAccountModal()
		return m.toastCmd("Sign in with Nostr to save favorites", false)
	}
	if !m.session.CanSign() {
		return m.toastCmd("Read-only npub mode cannot modify favorites", true)
	}
	if len(m.favoriteLists) == 0 {
		return m.createFavoriteListWithStationCmd("My Favorite Stations", st)
	}
	if len(m.favoriteLists) == 1 {
		return m.toggleStationInListCmd(m.favoriteLists[0], st)
	}
	m.favPicker = favPickerState{station: st, cursor: 0}
	m.overlay = overlayFavPicker
	return nil
}

func (m *AppModel) warmRelayCmd() tea.Cmd {
	return func() tea.Msg {
		return relayWarmMsg{err: m.nostr.WarmAppRelay(context.Background())}
	}
}

func (m *AppModel) fetchStationCountCmd() tea.Cmd {
	return func() tea.Msg {
		n, err := m.nostr.FetchStationCount(context.Background())
		return stationCountMsg{count: n, err: err}
	}
}

func (m *AppModel) fetchStationsCmd(autoPlay bool) tea.Cmd {
	q := nostrclient.StationQuery{
		Search:  strings.TrimSpace(m.transmit.searchInput.Value()),
		Genre:   quickGenres[m.transmit.genreIdx],
		Country: quickCountries[m.transmit.countryIdx],
		Limit:   150,
	}
	seq := m.transmit.searchSeq
	m.transmit.loading = true
	return func() tea.Msg {
		list, err := m.nostr.FetchStations(context.Background(), q)
		return stationsLoadedMsg{seq: seq, stations: list, err: err, autoPlay: autoPlay}
	}
}

func debounceSearchCmd(seq uint64, query string) tea.Cmd {
	return tea.Tick(300*time.Millisecond, func(time.Time) tea.Msg {
		return searchDebounceMsg{seq: seq, query: query}
	})
}

func (m *AppModel) fetchDiscoverCmd(autoPlay bool) tea.Cmd {
	return func() tea.Msg {
		bundle, err := m.nostr.FetchDiscover(context.Background())
		return discoverLoadedMsg{bundle: bundle, err: err, autoPlay: autoPlay}
	}
}

func (m *AppModel) fetchHealthBatchCmd(addrs []string) tea.Cmd {
	return func() tea.Msg {
		h, tr := m.nostr.FetchHealthBatch(context.Background(), addrs)
		return healthLoadedMsg{health: h, tracks: tr}
	}
}

func (m *AppModel) fetchUserListsCmd() tea.Cmd {
	if m.session.Mode() == auth.ModeGuest {
		return nil
	}
	pk := m.session.PubKey()
	return func() tea.Msg {
		bundle, err := m.nostr.FetchUserLists(context.Background(), pk)
		return userListsLoadedMsg{bundle: bundle, err: err}
	}
}

func (m *AppModel) warmUserMetaCmd() tea.Cmd {
	if m.session.Mode() == auth.ModeGuest {
		return nil
	}
	pk := m.session.PubKey()
	return func() tea.Msg {
		m.nostr.FetchProfilesBatch(context.Background(), []string{pk.Hex()})
		m.nostr.FetchAuthorMailboxes(context.Background(), pk)
		return nil
	}
}

func (m *AppModel) fetchSignalsCmd() tea.Cmd {
	m.crate.loading = true
	return func() tea.Msg {
		songs, err := m.nostr.FetchCommunitySignals(context.Background(), 60)
		return signalsLoadedMsg{songs: songs, err: err}
	}
}

func (m *AppModel) fetchStationSocialCmd(st nostrclient.Station) tea.Cmd {
	viewer := ""
	if m.session.Mode() != auth.ModeGuest {
		viewer = m.session.PubKey().Hex()
	}
	return func() tea.Msg {
		soc, err := m.nostr.FetchStationSocial(context.Background(), st, viewer)
		return stationSocialLoadedMsg{social: soc, err: err}
	}
}

func (m *AppModel) fetchAssemblyCmd(appendOlder bool) tea.Cmd {
	m.assembly.loading = true
	now := time.Now().Unix()
	since := now - 7*24*3600
	until := int64(0)
	if appendOlder && m.assembly.oldestUnix > 0 {
		until = m.assembly.oldestUnix - 1
		since = until - 14*24*3600
	}
	return func() tea.Msg {
		posts, err := m.nostr.FetchCommunityFeed(context.Background(), since, until, 80)
		return assemblyLoadedMsg{posts: posts, append: appendOlder, err: err}
	}
}

func (m *AppModel) fetchOlderAssemblyCmd() tea.Cmd {
	return m.fetchAssemblyCmd(true)
}

func (m *AppModel) createFavoriteListCmd(name string) tea.Cmd {
	signer := m.session
	return func() tea.Msg {
		evt := nostrclient.BuildFavoritesListEvent("", name, "", nil)
		if _, err := m.nostr.PublishSigned(context.Background(), signer, evt, nil); err != nil {
			return actionResultMsg{toast: err.Error(), isErr: true}
		}
		return actionResultMsg{toast: "★ Created list " + name, reloadLists: true}
	}
}

func (m *AppModel) createFavoriteListWithStationCmd(name string, st nostrclient.Station) tea.Cmd {
	signer := m.session
	return func() tea.Msg {
		evt := nostrclient.BuildFavoritesListEvent("", name, "", []string{st.Address})
		if _, err := m.nostr.PublishSigned(context.Background(), signer, evt, nil); err != nil {
			return actionResultMsg{toast: err.Error(), isErr: true}
		}
		return actionResultMsg{toast: "★ Added " + st.Name + " to " + name, reloadLists: true}
	}
}

func (m *AppModel) renameFavoriteListCmd(fl nostrclient.FavoritesList, newName string) tea.Cmd {
	signer := m.session
	return func() tea.Msg {
		evt := nostrclient.BuildFavoritesListEvent(fl.FavoritesID, newName, fl.Description, fl.StationAddresses)
		if _, err := m.nostr.PublishSigned(context.Background(), signer, evt, nil); err != nil {
			return actionResultMsg{toast: err.Error(), isErr: true}
		}
		return actionResultMsg{toast: "Renamed list to " + newName, reloadLists: true}
	}
}

func (m *AppModel) deleteFavoriteListCmd(fl nostrclient.FavoritesList) tea.Cmd {
	signer := m.session
	return func() tea.Msg {
		evt := nostrclient.BuildListDeletionEvent(fl.Event, "Deleted favorites list")
		if _, err := m.nostr.PublishSigned(context.Background(), signer, evt, nil); err != nil {
			return actionResultMsg{toast: err.Error(), isErr: true}
		}
		return actionResultMsg{toast: "Deleted list " + fl.Name, reloadLists: true}
	}
}

func (m *AppModel) toggleStationInListCmd(fl nostrclient.FavoritesList, st nostrclient.Station) tea.Cmd {
	signer := m.session
	relay := m.nostr.AppRelayURL()
	removing := fl.HasStation(st.Address)
	return func() tea.Msg {
		var evt = nostrclient.BuildFavoritesAddStation(fl.Event, st.Address, relay)
		toast := "★ Added " + st.Name + " to " + fl.Name
		if removing {
			evt = nostrclient.BuildFavoritesRemoveStation(fl.Event, st.Address)
			toast = "Removed " + st.Name + " from " + fl.Name
		}
		if _, err := m.nostr.PublishSigned(context.Background(), signer, evt, nil); err != nil {
			return actionResultMsg{toast: err.Error(), isErr: true}
		}
		return actionResultMsg{toast: toast, reloadLists: true}
	}
}

func (m *AppModel) removeStationFromListCmd(fl nostrclient.FavoritesList, stationAddr string) tea.Cmd {
	signer := m.session
	return func() tea.Msg {
		evt := nostrclient.BuildFavoritesRemoveStation(fl.Event, stationAddr)
		if _, err := m.nostr.PublishSigned(context.Background(), signer, evt, nil); err != nil {
			return actionResultMsg{toast: err.Error(), isErr: true}
		}
		return actionResultMsg{toast: "Removed station from " + fl.Name, reloadLists: true}
	}
}

func (m *AppModel) saveCurrentTrackCmd() tea.Cmd {
	tr := m.playerSnap.Track
	if tr.Empty() {
		return m.toastCmd("No live track metadata playing yet", false)
	}
	if m.session.Mode() == auth.ModeGuest {
		m.openAccountModal()
		return m.toastCmd("Sign in with Nostr to save songs to your Crate", false)
	}
	if !m.session.CanSign() {
		return m.toastCmd("Read-only mode cannot save songs", true)
	}
	signer := m.session
	existingLists := append([]nostrclient.SongList(nil), m.songLists...)
	relay := m.nostr.AppRelayURL()
	return func() tea.Msg {
		songEvt := nostrclient.BuildSongEvent(firstNonEmpty(tr.Song, tr.Raw), tr.Artist)
		signedSong, err := m.nostr.PublishSigned(context.Background(), signer, songEvt, nil)
		if err != nil {
			return actionResultMsg{toast: "Save song failed: " + err.Error(), isErr: true}
		}
		parsedSong, _ := nostrclient.ParseSong(signedSong)

		var listEvt = nostrclient.BuildSongListEvent("", "Liked Songs", []string{parsedSong.Address})
		if len(existingLists) > 0 {
			listEvt = nostrclient.BuildSongListAddSong(existingLists[0].Event, parsedSong.Address, relay)
		}
		if _, err := m.nostr.PublishSigned(context.Background(), signer, listEvt, nil); err != nil {
			return actionResultMsg{toast: "Update crate failed: " + err.Error(), isErr: true}
		}
		return actionResultMsg{toast: "♪ Saved " + truncate(tr.Display(), 34) + " to Crate", reloadLists: true}
	}
}

func (m *AppModel) removeSongFromCrateCmd(sl nostrclient.SongList, songAddr string) tea.Cmd {
	signer := m.session
	return func() tea.Msg {
		evt := nostrclient.BuildSongListRemoveSong(sl.Event, songAddr)
		if _, err := m.nostr.PublishSigned(context.Background(), signer, evt, nil); err != nil {
			return actionResultMsg{toast: err.Error(), isErr: true}
		}
		return actionResultMsg{toast: "Removed track from Crate", reloadLists: true}
	}
}

func (m *AppModel) reactStationCmd(st nostrclient.Station) tea.Cmd {
	if !m.session.CanSign() {
		return m.toastCmd("Sign in with 'a' to react ♥", true)
	}
	signer := m.session
	stCopy := st
	return func() tea.Msg {
		evt := nostrclient.BuildStationReaction(stCopy, "❤️")
		if _, err := m.nostr.PublishSigned(context.Background(), signer, evt, nil); err != nil {
			return actionResultMsg{toast: err.Error(), isErr: true}
		}
		return actionResultMsg{toast: "♥ Reacted to " + stCopy.Name, reloadSoc: &stCopy}
	}
}

func (m *AppModel) reactNoteCmd(target nostr.Event) tea.Cmd {
	if !m.session.CanSign() {
		return m.toastCmd("Sign in with 'a' to react ♥", true)
	}
	signer := m.session
	return func() tea.Msg {
		evt := nostrclient.BuildNoteReaction(target, "❤️")
		if _, err := m.nostr.PublishSigned(context.Background(), signer, evt, nil); err != nil {
			return actionResultMsg{toast: err.Error(), isErr: true}
		}
		return actionResultMsg{toast: "♥ Reacted to note!"}
	}
}

func (m *AppModel) publishStationCommentCmd(st nostrclient.Station, text string) tea.Cmd {
	signer := m.session
	stCopy := st
	return func() tea.Msg {
		evt := nostrclient.BuildStationComment(stCopy, text)
		if _, err := m.nostr.PublishSigned(context.Background(), signer, evt, nil); err != nil {
			return actionResultMsg{toast: err.Error(), isErr: true}
		}
		return actionResultMsg{toast: "Comment posted!", reloadSoc: &stCopy}
	}
}

func (m *AppModel) publishCommentReplyCmd(parent nostr.Event, st nostrclient.Station, text string) tea.Cmd {
	signer := m.session
	stCopy := st
	return func() tea.Msg {
		evt := nostrclient.BuildCommentReply(parent, stCopy, text)
		if _, err := m.nostr.PublishSigned(context.Background(), signer, evt, nil); err != nil {
			return actionResultMsg{toast: err.Error(), isErr: true}
		}
		return actionResultMsg{toast: "Reply posted!", reloadSoc: &stCopy}
	}
}

func (m *AppModel) publishCommunityPostCmd(text, category string) tea.Cmd {
	signer := m.session
	return func() tea.Msg {
		evt := nostrclient.BuildCommunityPost(text, category)
		if _, err := m.nostr.PublishSigned(context.Background(), signer, evt, nil); err != nil {
			return actionResultMsg{toast: err.Error(), isErr: true}
		}
		return actionResultMsg{toast: "Posted to #wavefunc Assembly!", reloadFeed: true}
	}
}

func (m *AppModel) publishCommunityReplyCmd(parent nostrclient.CommunityPost, text string) tea.Cmd {
	signer := m.session
	return func() tea.Msg {
		evt := nostrclient.BuildCommunityReply(parent, text)
		if _, err := m.nostr.PublishSigned(context.Background(), signer, evt, nil); err != nil {
			return actionResultMsg{toast: err.Error(), isErr: true}
		}
		return actionResultMsg{toast: "Reply posted to #wavefunc!", reloadFeed: true}
	}
}

// --- Auth Commands ---

func (m *AppModel) createNewAccountCmd(displayName, passphrase string) tea.Cmd {
	return func() tea.Msg {
		acct := auth.GenerateAccount()
		if err := auth.SaveSession(acct, passphrase); err != nil {
			return authSessionMsg{err: err}
		}
		if displayName != "" {
			profEvt := nostrclient.BuildProfileEvent(displayName, "Listening on WaveFunc Radio (wf)")
			_, _ = m.nostr.PublishSigned(context.Background(), acct, profEvt, nil)
			m.nostr.SetProfile(nostrclient.Profile{
				PubKey:      acct.PubKey().Hex(),
				Name:        displayName,
				DisplayName: displayName,
			})
		}
		// Seed a default empty favorites list on the WaveFunc relay.
		favEvt := nostrclient.BuildFavoritesListEvent("", "My Favorite Stations", "", nil)
		_, _ = m.nostr.PublishSigned(context.Background(), acct, favEvt, nil)

		return authSessionMsg{
			session:      acct,
			isNewAccount: true,
			backupNsec:   acct.Nsec(),
		}
	}
}

func (m *AppModel) importCredentialCmd(raw, passphrase string) tea.Cmd {
	return func() tea.Msg {
		trimmed := strings.TrimSpace(raw)
		if strings.HasPrefix(trimmed, "bunker://") || strings.Contains(trimmed, "@") {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			bunker, err := auth.ConnectBunker(ctx, m.nostr.Pool, trimmed)
			if err != nil {
				return authSessionMsg{err: err}
			}
			if err := auth.SaveSession(bunker, ""); err != nil {
				return authSessionMsg{err: err}
			}
			return authSessionMsg{session: bunker}
		}
		local, err := auth.ImportSecret(trimmed, passphrase)
		if err != nil {
			return authSessionMsg{err: err}
		}
		if err := auth.SaveSession(local, passphrase); err != nil {
			return authSessionMsg{err: err}
		}
		return authSessionMsg{session: local}
	}
}

func (m *AppModel) importReadOnlyCmd(raw string) tea.Cmd {
	return func() tea.Msg {
		ro, err := auth.ImportReadOnly(raw)
		if err != nil {
			return authSessionMsg{err: err}
		}
		if err := auth.SaveSession(ro, ""); err != nil {
			return authSessionMsg{err: err}
		}
		return authSessionMsg{session: ro}
	}
}

func (m *AppModel) unlockEncryptedKeyCmd(passphrase string) tea.Cmd {
	return func() tea.Msg {
		sess, err := auth.RestoreSession(m.nostr.Pool, passphrase)
		if err != nil {
			return authSessionMsg{err: err}
		}
		return authSessionMsg{session: sess}
	}
}

func (m *AppModel) logoutCmd() tea.Cmd {
	return func() tea.Msg {
		_ = auth.ClearStoredSession()
		return authSessionMsg{session: auth.NewGuestSession()}
	}
}

func (m *AppModel) startQRPairingCmd() tea.Cmd {
	m.cancelQRPairing()
	m.qrURI = ""
	m.qrArt = ""
	m.qrCols = 0
	m.qrRows = 0
	relays := nostrclient.DefaultNIP46Relays
	return func() tea.Msg {
		pairing, err := auth.PrepareNostrConnect(context.Background(), m.nostr.Pool, relays)
		if err != nil {
			return nostrConnectPreparedMsg{err: err}
		}
		qrArt, cols, rows, err := anim.RenderQR(pairing.URI)
		if err != nil {
			return nostrConnectPreparedMsg{err: err}
		}
		return nostrConnectPreparedMsg{
			pairing: pairing,
			qrArt:   qrArt,
			qrCols:  cols,
			qrRows:  rows,
		}
	}
}

func waitNostrConnectCmd(ctx context.Context, pairing *auth.NostrConnectPairing) tea.Cmd {
	return func() tea.Msg {
		sess, err := pairing.Wait(ctx)
		return nostrConnectCompletedMsg{session: sess, err: err}
	}
}

func (m *AppModel) cancelQRPairing() {
	if m.qrCancel != nil {
		m.qrCancel()
		m.qrCancel = nil
	}
	m.qrURI = ""
	m.qrArt = ""
	m.qrCols = 0
	m.qrRows = 0
}

// --- Formatting helpers ---

func shortNpub(npub string) string {
	if len(npub) <= 18 {
		return npub
	}
	return npub[:10] + "…" + npub[len(npub)-6:]
}

func truncate(s string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	if maxLen <= 1 {
		return "…"
	}
	return string(runes[:maxLen-1]) + "…"
}

func wrapText(s string, width, maxLines int) string {
	if width <= 4 {
		return truncate(s, width)
	}
	words := strings.Fields(s)
	if len(words) == 0 {
		return ""
	}
	var lines []string
	cur := words[0]
	for _, w := range words[1:] {
		if len([]rune(cur))+1+len([]rune(w)) <= width {
			cur += " " + w
		} else {
			lines = append(lines, cur)
			if maxLines > 0 && len(lines) >= maxLines {
				lines[len(lines)-1] = truncate(lines[len(lines)-1], width)
				return strings.Join(lines, "\n")
			}
			cur = w
		}
	}
	lines = append(lines, cur)
	if maxLines > 0 && len(lines) > maxLines {
		lines = lines[:maxLines]
	}
	return strings.Join(lines, "\n")
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
