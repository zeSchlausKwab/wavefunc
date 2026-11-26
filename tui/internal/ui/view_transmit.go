package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	nostrclient "github.com/zeSchlausKwab/wavefunc/tui/internal/nostr"
)

type transmitSub int

const (
	transmitStations transmitSub = iota
	transmitDiscover
	transmitHistory
)

var (
	quickGenres    = []string{"", "jazz", "electronic", "ambient", "rock", "classical", "hiphop", "indie", "world", "news", "lofi"}
	quickCountries = []string{"", "US", "GB", "DE", "FR", "JP", "NL", "CA", "BR", "AU"}
	chartMetrics   = []struct {
		Key   string
		Label string
	}{
		{"best-signal", "BEST SIGNAL"},
		{"on-air-now", "ON AIR NOW"},
		{"most-liked", "MOST LIKED"},
		{"has-now-playing", "WITH TRACK INFO"},
	}
)

type transmitState struct {
	sub            transmitSub
	cursor         int
	scroll         int
	searchActive   bool
	searchInput    textinput.Model
	searchSeq      uint64
	genreIdx       int
	countryIdx     int
	chartMetricIdx int
	loading        bool
}

func newTransmitState() transmitState {
	si := textinput.New()
	si.Placeholder = "Search 50k+ stations (e.g. fip, soma, jazz, tokyo)..."
	si.CharLimit = 80
	si.Width = 44
	return transmitState{
		sub:         transmitStations,
		searchInput: si,
		loading:     true,
	}
}

func (m *AppModel) activeTransmitStations() []nostrclient.Station {
	switch m.transmit.sub {
	case transmitDiscover:
		metric := chartMetrics[m.transmit.chartMetricIdx].Key
		if r, ok := m.discover.Rankings[metric]; ok && len(r.Entries) > 0 {
			var list []nostrclient.Station
			for _, e := range r.Entries {
				if st, exists := m.discover.Stations[e.StationAddress]; exists {
					list = append(list, st)
				}
			}
			if len(list) > 0 {
				return list
			}
		}
		if len(m.featuredStations) > 0 {
			return m.featuredStations
		}
		return m.stations

	case transmitHistory:
		var list []nostrclient.Station
		for _, h := range m.history {
			if st, ok := m.stationByAddr[h.Address]; ok {
				list = append(list, st)
			} else {
				list = append(list, nostrclient.Station{
					Address:     h.Address,
					Name:        h.Name,
					CountryCode: h.CountryCode,
					Genres:      h.Genres,
				})
			}
		}
		return list

	default:
		return m.stations
	}
}

func (m *AppModel) selectedTransmitStation() (nostrclient.Station, bool) {
	list := m.activeTransmitStations()
	if len(list) == 0 || m.transmit.cursor < 0 || m.transmit.cursor >= len(list) {
		return nostrclient.Station{}, false
	}
	return list[m.transmit.cursor], true
}

func (m *AppModel) updateTransmit(msg tea.KeyMsg) tea.Cmd {
	if m.transmit.searchActive {
		switch msg.String() {
		case "esc":
			m.transmit.searchActive = false
			m.transmit.searchInput.Blur()
			return nil
		case "enter":
			m.transmit.searchActive = false
			m.transmit.searchInput.Blur()
			m.transmit.sub = transmitStations
			m.transmit.cursor = 0
			m.transmit.scroll = 0
			return m.fetchStationsCmd(false)
		}
		var cmd tea.Cmd
		prev := m.transmit.searchInput.Value()
		m.transmit.searchInput, cmd = m.transmit.searchInput.Update(msg)
		next := m.transmit.searchInput.Value()
		if next != prev {
			m.transmit.sub = transmitStations
			m.transmit.cursor = 0
			m.transmit.scroll = 0
			m.transmit.searchSeq++
			return tea.Batch(cmd, debounceSearchCmd(m.transmit.searchSeq, next))
		}
		return cmd
	}

	list := m.activeTransmitStations()
	switch msg.String() {
	case "/":
		m.transmit.sub = transmitStations
		m.transmit.searchActive = true
		m.transmit.searchInput.Focus()
		return textinput.Blink
	case "[":
		m.transmit.sub = (m.transmit.sub + 2) % 3
		m.transmit.cursor = 0
		m.transmit.scroll = 0
		return nil
	case "]":
		m.transmit.sub = (m.transmit.sub + 1) % 3
		m.transmit.cursor = 0
		m.transmit.scroll = 0
		return nil
	case "h", "left":
		if m.transmit.sub == transmitDiscover {
			m.transmit.chartMetricIdx = (m.transmit.chartMetricIdx - 1 + len(chartMetrics)) % len(chartMetrics)
			m.transmit.cursor = 0
			m.transmit.scroll = 0
		}
		return nil
	case "l", "right":
		if m.transmit.sub == transmitDiscover {
			m.transmit.chartMetricIdx = (m.transmit.chartMetricIdx + 1) % len(chartMetrics)
			m.transmit.cursor = 0
			m.transmit.scroll = 0
		}
		return nil
	case "g":
		m.transmit.sub = transmitStations
		m.transmit.genreIdx = (m.transmit.genreIdx + 1) % len(quickGenres)
		m.transmit.cursor = 0
		m.transmit.scroll = 0
		return m.fetchStationsCmd(false)
	case "c":
		m.transmit.sub = transmitStations
		m.transmit.countryIdx = (m.transmit.countryIdx + 1) % len(quickCountries)
		m.transmit.cursor = 0
		m.transmit.scroll = 0
		return m.fetchStationsCmd(false)
	case "x":
		m.transmit.searchInput.SetValue("")
		m.transmit.genreIdx = 0
		m.transmit.countryIdx = 0
		m.transmit.cursor = 0
		m.transmit.scroll = 0
		return m.fetchStationsCmd(false)
	case "up", "k":
		if m.transmit.cursor > 0 {
			m.transmit.cursor--
		}
	case "down", "j":
		if m.transmit.cursor+1 < len(list) {
			m.transmit.cursor++
		}
	case "pgup", "ctrl+u":
		m.transmit.cursor = maxInt(0, m.transmit.cursor-10)
	case "pgdown", "ctrl+d":
		if len(list) > 0 {
			m.transmit.cursor = minInt(len(list)-1, m.transmit.cursor+10)
		}
	case "home":
		m.transmit.cursor = 0
	case "G":
		if len(list) > 0 {
			m.transmit.cursor = len(list) - 1
		}
	case "enter":
		if st, ok := m.selectedTransmitStation(); ok {
			if len(st.Streams) == 0 && st.Address != "" {
				return m.resolveAndPlayCmd(st.Address)
			}
			m.playStation(st, 0)
		}
	case "f":
		if st, ok := m.selectedTransmitStation(); ok {
			return m.triggerFavoriteStation(st)
		}
	case "r":
		if st, ok := m.selectedTransmitStation(); ok {
			return m.reactStationCmd(st)
		}
	case "i":
		if st, ok := m.selectedTransmitStation(); ok {
			return m.openStationDrawer(st)
		}
	}
	return nil
}

func (m *AppModel) viewTransmit(width, height int) string {
	s := m.styles

	// Sub-navigation + filter toolbar.
	subLabels := []string{"STATIONS", "CHARTS & FEATURED", "RECENT"}
	var subBar []string
	for i, lbl := range subLabels {
		if transmitSub(i) == m.transmit.sub {
			subBar = append(subBar, s.BadgeCyan.Render(lbl))
		} else {
			subBar = append(subBar, s.Muted.Render(lbl))
		}
	}
	countPill := ""
	if m.stationCount > 0 {
		countPill = s.Muted.Render(fmt.Sprintf("  %d total", m.stationCount))
	}
	topLine := strings.Join(subBar, " ") + countPill + s.Muted.Render("   [/] search · [[]/[]] view")

	// Filter/search line.
	var filterLine string
	switch m.transmit.sub {
	case transmitStations:
		searchBox := s.Muted.Render("[/] Search...")
		if m.transmit.searchActive {
			searchBox = s.Accent.Render("/ ") + m.transmit.searchInput.View()
		} else if q := strings.TrimSpace(m.transmit.searchInput.Value()); q != "" {
			searchBox = s.BadgeCyan.Render("SEARCH: " + q)
		}
		genreLabel := "ALL"
		if g := quickGenres[m.transmit.genreIdx]; g != "" {
			genreLabel = strings.ToUpper(g)
		}
		countryLabel := "ALL"
		if cc := quickCountries[m.transmit.countryIdx]; cc != "" {
			countryLabel = cc
		}
		filterLine = searchBox + "   " +
			s.Muted.Render("[g] GENRE: ") + s.Title.Render(genreLabel) + "   " +
			s.Muted.Render("[c] COUNTRY: ") + s.Title.Render(countryLabel)
		if m.transmit.genreIdx > 0 || m.transmit.countryIdx > 0 || m.transmit.searchInput.Value() != "" {
			filterLine += "   " + s.KeyHint.Render("[x] clear")
		}
	case transmitDiscover:
		var chartPills []string
		for i, cm := range chartMetrics {
			if i == m.transmit.chartMetricIdx {
				chartPills = append(chartPills, s.BadgeLive.Render(cm.Label))
			} else {
				chartPills = append(chartPills, s.Muted.Render(cm.Label))
			}
		}
		filterLine = strings.Join(chartPills, " ") + s.Muted.Render("  (←/→ switch chart)")
	case transmitHistory:
		filterLine = s.Muted.Render(fmt.Sprintf("Last %d stations played on this machine", len(m.history)))
	}

	list := m.activeTransmitStations()
	panelTotalH := maxInt(5, height-2) // topLine (1) + filterLine (1)
	panelInnerH := maxInt(3, panelTotalH-2)
	wide := width >= 104
	listW := width
	previewW := 0
	if wide {
		previewW = minInt(38, width/3)
		listW = width - previewW - 1
	}

	// Adjust scroll window.
	visibleRows := maxInt(3, panelInnerH)
	if m.transmit.cursor < m.transmit.scroll {
		m.transmit.scroll = m.transmit.cursor
	}
	if m.transmit.cursor >= m.transmit.scroll+visibleRows {
		m.transmit.scroll = m.transmit.cursor - visibleRows + 1
	}
	if m.transmit.scroll < 0 {
		m.transmit.scroll = 0
	}

	var rows []string
	if m.transmit.loading && len(list) == 0 {
		rows = append(rows, "", s.Accent.Render("  ◌ Tuning into WaveFunc relay..."))
	} else if len(list) == 0 {
		rows = append(rows, "", s.Muted.Render("  No matching stations found. Press [x] to clear filters or [/] to search."))
	} else {
		end := minInt(len(list), m.transmit.scroll+visibleRows)
		innerW := maxInt(32, listW-4)
		for i := m.transmit.scroll; i < end; i++ {
			st := list[i]
			rows = append(rows, m.renderStationRow(st, i == m.transmit.cursor, innerW))
		}
	}

	listPanel := s.PanelFocus.
		Width(listW - 2).
		Height(panelInnerH).
		MaxHeight(panelTotalH).
		Render(strings.Join(rows, "\n"))

	content := listPanel
	if wide {
		preview := m.renderStationPreview(previewW-2, panelInnerH, panelTotalH)
		content = lipgloss.JoinHorizontal(lipgloss.Top, listPanel, " ", preview)
	}

	return strings.Join([]string{topLine, filterLine, content}, "\n")
}

func (m *AppModel) renderStationRow(st nostrclient.Station, selected bool, width int) string {
	s := m.styles
	isPlaying := m.playerSnap.Station != nil && m.playerSnap.Station.Address == st.Address
	isFav := m.isFavorited(st.Address)

	// Health dot from 31238 cache.
	healthDot := "○"
	if h, ok := m.nostr.CachedHealth(st.Address); ok {
		switch h.Status {
		case "up":
			healthDot = "●"
		case "degraded":
			healthDot = "◐"
		case "down":
			healthDot = "✕"
		}
	}

	playMark := " "
	if isPlaying {
		playMark = "▶"
	}
	favMark := " "
	if isFav {
		favMark = "★"
	}

	metaParts := []string{}
	if st.CountryCode != "" {
		metaParts = append(metaParts, st.CountryCode)
	}
	if q := st.QualityBadge(); q != "" {
		metaParts = append(metaParts, q)
	}
	if len(st.Genres) > 0 {
		g := st.Genres[0]
		if len(st.Genres) > 1 {
			g += "/" + st.Genres[1]
		}
		metaParts = append(metaParts, g)
	}

	// Fixed meta column width (by visual cell width, not UTF-8 bytes) so every
	// row's country, bitrate, and genre columns line up cleanly.
	metaW := maxInt(18, minInt(28, width*2/5))
	meta := truncate(strings.Join(metaParts, " · "), metaW)
	nameW := maxInt(14, width-metaW-7)
	name := truncate(st.Name, nameW)
	paddedName := name + strings.Repeat(" ", maxInt(0, nameW-lipgloss.Width(name)))
	paddedMeta := meta + strings.Repeat(" ", maxInt(0, metaW-lipgloss.Width(meta)))

	rawLine := fmt.Sprintf("%s %s %s %s %s", playMark, healthDot, paddedName, favMark, paddedMeta)
	if selected {
		return s.RowActive.Width(width).Render(rawLine)
	}

	// Colorize accents on unselected rows.
	styledDot := s.Muted.Render(healthDot)
	switch healthDot {
	case "●":
		styledDot = s.Success.Render("●")
	case "◐":
		styledDot = s.Warning.Render("◐")
	case "✕":
		styledDot = s.Danger.Render("✕")
	}
	styledPlay := " "
	if isPlaying {
		styledPlay = s.Primary.Render("▶")
	}
	styledFav := " "
	if isFav {
		styledFav = s.Primary.Render("★")
	}
	styledName := s.Text.Render(paddedName)
	if isPlaying {
		styledName = s.Accent.Render(paddedName)
	}
	return fmt.Sprintf("%s %s %s %s %s", styledPlay, styledDot, styledName, styledFav, s.Muted.Render(paddedMeta))
}

func (m *AppModel) renderStationPreview(w, innerH, totalH int) string {
	s := m.styles
	st, ok := m.selectedTransmitStation()
	if !ok {
		return s.Panel.Width(w).Height(innerH).MaxHeight(totalH).Render(s.Muted.Render("Select a station to inspect signal details."))
	}
	inner := maxInt(20, w-2)

	var lines []string
	lines = append(lines, s.BadgeLive.Render("SIGNAL INSPECTOR"))
	lines = append(lines, s.Title.Render(truncate(st.Name, inner)))
	if st.Location != "" || st.CountryCode != "" {
		loc := st.Location
		if loc == "" {
			loc = st.CountryCode
		}
		lines = append(lines, s.Muted.Render("@ "+truncate(loc, inner-2)))
	}

	if hInfo, ok := m.nostr.CachedHealth(st.Address); ok {
		badge := s.Success.Render(fmt.Sprintf("● %s (%d/100)", strings.ToUpper(hInfo.Status), hInfo.Score))
		if hInfo.Status == "degraded" {
			badge = s.Warning.Render(fmt.Sprintf("◐ DEGRADED (%d/100)", hInfo.Score))
		} else if hInfo.Status == "down" {
			badge = s.Danger.Render("✕ DOWN")
		}
		if hInfo.LatencyMs > 0 {
			badge += s.Muted.Render(fmt.Sprintf(" · %dms", hInfo.LatencyMs))
		}
		lines = append(lines, badge)
	}

	if tr, ok := m.nostr.CachedNowPlaying(st.Address); ok && tr.Display() != "" {
		lines = append(lines, s.Accent.Render("♪ "+truncate(tr.Display(), inner-2)))
	}

	if len(st.Genres) > 0 {
		lines = append(lines, "", s.Subtitle.Render("GENRES"), s.Text.Render(truncate(strings.Join(st.Genres, ", "), inner)))
	}

	// Adapt ABOUT + STREAMS to available height so the bottom shortcut hints
	// stay visible and the panel never overflows into the Now Playing Dock.
	footerLines := []string{
		s.KeyHint.Render("Enter") + s.Muted.Render(" play  ") + s.KeyHint.Render("f") + s.Muted.Render(" fav"),
		s.KeyHint.Render("i") + s.Muted.Render(" details & comments  ") + s.KeyHint.Render("r") + " " + s.Primary.Render("♥"),
	}
	remaining := innerH - len(lines) - len(footerLines) - 1

	if st.Description != "" && remaining >= 3 {
		aboutMax := minInt(3, remaining-2)
		if len(st.Streams) > 0 && remaining >= 5 {
			aboutMax = minInt(2, remaining-4)
		}
		if aboutMax > 0 {
			wrapped := strings.Split(wrapText(st.Description, inner, aboutMax), "\n")
			lines = append(lines, "", s.Subtitle.Render("ABOUT"))
			for _, wl := range wrapped {
				lines = append(lines, s.Muted.Render(wl))
			}
			remaining = innerH - len(lines) - len(footerLines) - 1
		}
	}

	if len(st.Streams) > 0 && remaining >= 2 {
		lines = append(lines, "", s.Subtitle.Render(fmt.Sprintf("STREAMS (%d)", len(st.Streams))))
		maxStreams := minInt(2, remaining-2)
		if maxStreams < 1 {
			maxStreams = 1
		}
		for idx, stream := range st.Streams {
			if idx >= maxStreams {
				break
			}
			tag := ""
			if stream.Primary {
				tag = " ★"
			}
			lines = append(lines, s.Muted.Render("• "+stream.DisplayLabel()+tag))
		}
	}

	// Pad cleanly so footer shortcuts sit neatly near the bottom of the inspector.
	if pad := innerH - len(lines) - len(footerLines); pad > 0 {
		for i := 0; i < pad; i++ {
			lines = append(lines, "")
		}
	}
	lines = append(lines, footerLines...)
	if len(lines) > innerH {
		lines = lines[:innerH]
	}

	return s.Panel.Width(w).Height(innerH).MaxHeight(totalH).Render(strings.Join(lines, "\n"))
}
