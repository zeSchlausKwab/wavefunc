package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/zeSchlausKwab/wavefunc/tui/internal/auth"
	nostrclient "github.com/zeSchlausKwab/wavefunc/tui/internal/nostr"
)

type archiveInputMode int

const (
	archiveInputNone archiveInputMode = iota
	archiveInputCreate
	archiveInputRename
	archiveInputConfirmDelete
)

type archiveState struct {
	focusRight    bool
	listCursor    int
	stationCursor int
	stationScroll int
	inputMode     archiveInputMode
	input         textinput.Model
	loading       bool
}

func newArchiveState() archiveState {
	in := textinput.New()
	in.Placeholder = "List name (e.g. Late Night Jazz)"
	in.CharLimit = 64
	in.Width = 36
	return archiveState{input: in}
}

func (m *AppModel) selectedFavoriteList() (nostrclient.FavoritesList, bool) {
	if len(m.favoriteLists) == 0 || m.archive.listCursor < 0 || m.archive.listCursor >= len(m.favoriteLists) {
		return nostrclient.FavoritesList{}, false
	}
	return m.favoriteLists[m.archive.listCursor], true
}

func (m *AppModel) activeArchiveStations() []nostrclient.Station {
	fl, ok := m.selectedFavoriteList()
	if !ok {
		return nil
	}
	out := make([]nostrclient.Station, 0, len(fl.StationAddresses))
	for _, addr := range fl.StationAddresses {
		if st, exists := m.stationByAddr[addr]; exists {
			out = append(out, st)
		} else {
			parts := strings.SplitN(addr, ":", 3)
			fallbackName := addr
			if len(parts) == 3 {
				fallbackName = parts[2]
			}
			out = append(out, nostrclient.Station{
				Address: addr,
				Name:    fallbackName,
			})
		}
	}
	return out
}

func (m *AppModel) updateArchive(msg tea.KeyMsg) tea.Cmd {
	k := msg.String()

	if m.archive.inputMode != archiveInputNone {
		switch m.archive.inputMode {
		case archiveInputConfirmDelete:
			switch k {
			case "y", "Y", "enter":
				m.archive.inputMode = archiveInputNone
				if fl, ok := m.selectedFavoriteList(); ok {
					return m.deleteFavoriteListCmd(fl)
				}
			case "n", "N", "esc":
				m.archive.inputMode = archiveInputNone
			}
			return nil
		case archiveInputCreate, archiveInputRename:
			switch k {
			case "esc":
				m.archive.inputMode = archiveInputNone
				m.archive.input.Blur()
				return nil
			case "enter":
				name := strings.TrimSpace(m.archive.input.Value())
				mode := m.archive.inputMode
				m.archive.inputMode = archiveInputNone
				m.archive.input.Blur()
				if name == "" {
					return nil
				}
				if mode == archiveInputCreate {
					return m.createFavoriteListCmd(name)
				}
				if fl, ok := m.selectedFavoriteList(); ok {
					return m.renameFavoriteListCmd(fl, name)
				}
				return nil
			}
			var cmd tea.Cmd
			m.archive.input, cmd = m.archive.input.Update(msg)
			return cmd
		}
	}

	if m.session.Mode() == auth.ModeGuest {
		if k == "enter" || k == "a" {
			m.openAccountModal()
		}
		return nil
	}

	stations := m.activeArchiveStations()
	switch k {
	case "left", "h":
		m.archive.focusRight = false
	case "right", "l":
		if len(m.favoriteLists) > 0 {
			m.archive.focusRight = true
		}
	case "up", "k":
		if !m.archive.focusRight {
			if m.archive.listCursor > 0 {
				m.archive.listCursor--
				m.archive.stationCursor = 0
				m.archive.stationScroll = 0
			}
		} else if m.archive.stationCursor > 0 {
			m.archive.stationCursor--
		}
	case "down", "j":
		if !m.archive.focusRight {
			if m.archive.listCursor+1 < len(m.favoriteLists) {
				m.archive.listCursor++
				m.archive.stationCursor = 0
				m.archive.stationScroll = 0
			}
		} else if m.archive.stationCursor+1 < len(stations) {
			m.archive.stationCursor++
		}
	case "n":
		if !m.session.CanSign() {
			return m.toastCmd("Read-only mode — sign in with NIP-46 or nsec to create lists", true)
		}
		m.archive.inputMode = archiveInputCreate
		m.archive.input.SetValue("")
		m.archive.input.Placeholder = "New favorites list name..."
		m.archive.input.Focus()
		return textinput.Blink
	case "e":
		if !m.session.CanSign() {
			return m.toastCmd("Read-only mode — sign in to rename lists", true)
		}
		if fl, ok := m.selectedFavoriteList(); ok {
			m.archive.inputMode = archiveInputRename
			m.archive.input.SetValue(fl.Name)
			m.archive.input.Focus()
			return textinput.Blink
		}
	case "d":
		if !m.session.CanSign() {
			return m.toastCmd("Read-only mode — sign in to delete lists", true)
		}
		if _, ok := m.selectedFavoriteList(); ok {
			m.archive.inputMode = archiveInputConfirmDelete
		}
	case "x":
		if m.archive.focusRight && len(stations) > 0 && m.archive.stationCursor < len(stations) {
			if fl, ok := m.selectedFavoriteList(); ok {
				return m.removeStationFromListCmd(fl, stations[m.archive.stationCursor].Address)
			}
		}
	case "R":
		return m.fetchUserListsCmd()
	case "enter":
		if !m.archive.focusRight {
			if len(m.favoriteLists) > 0 {
				m.archive.focusRight = true
			}
			return nil
		}
		if len(stations) > 0 && m.archive.stationCursor < len(stations) {
			st := stations[m.archive.stationCursor]
			if len(st.Streams) == 0 {
				return m.resolveAndPlayCmd(st.Address)
			}
			m.playStation(st, 0)
		}
	case "i":
		if m.archive.focusRight && len(stations) > 0 && m.archive.stationCursor < len(stations) {
			return m.openStationDrawer(stations[m.archive.stationCursor])
		}
	}
	return nil
}

func (m *AppModel) viewArchive(width, height int) string {
	s := m.styles

	if m.session.Mode() == auth.ModeGuest {
		box := s.Panel.Width(minInt(72, width-4)).Render(strings.Join([]string{
			s.BadgeLive.Render("ARCHIVE // CROSS-DEVICE FAVORITES"),
			"",
			s.Title.Render("Sign in with Nostr to sync your favorite radio stations"),
			s.Muted.Render("Lists are saved as kind 30078 events on wss://relay.wavefunc.live and stay"),
			s.Muted.Render("in sync across wavefunc.live, desktop, Android, and this terminal."),
			"",
			s.BadgeCyan.Render(" a ") + " " + s.Title.Render("Open Account & Sign-In (Create key / QR NIP-46 / bunker / npub)"),
		}, "\n"))
		return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, box)
	}

	toolbar := s.BadgeCyan.Render("MY FAVORITE LISTS") + "  " +
		s.KeyHint.Render("[n]") + s.Muted.Render(" new  ") +
		s.KeyHint.Render("[e]") + s.Muted.Render(" rename  ") +
		s.KeyHint.Render("[d]") + s.Muted.Render(" delete  ") +
		s.KeyHint.Render("[x]") + s.Muted.Render(" remove station  ") +
		s.KeyHint.Render("[R]") + s.Muted.Render(" sync")

	var promptLine string
	switch m.archive.inputMode {
	case archiveInputCreate:
		promptLine = s.Accent.Render("NEW LIST: ") + m.archive.input.View() + s.Muted.Render("  (Enter save · Esc cancel)")
	case archiveInputRename:
		promptLine = s.Accent.Render("RENAME LIST: ") + m.archive.input.View() + s.Muted.Render("  (Enter save · Esc cancel)")
	case archiveInputConfirmDelete:
		if fl, ok := m.selectedFavoriteList(); ok {
			promptLine = s.Danger.Render(fmt.Sprintf("DELETE LIST %q? [y] Yes  [n] Cancel", fl.Name))
		}
	default:
		promptLine = s.Muted.Render("Synced as " + shortNpub(m.session.Npub()) + "  ·  ←/→ switch panes")
	}

	panelTotalH := maxInt(5, height-2)
	panelInnerH := maxInt(3, panelTotalH-2)
	leftW := maxInt(26, minInt(34, width/3))
	rightW := maxInt(32, width-leftW-1)

	// Left pane: favorite lists.
	var listRows []string
	if m.archive.loading && len(m.favoriteLists) == 0 {
		listRows = append(listRows, s.Accent.Render("◌ Syncing favorite lists..."))
	} else if len(m.favoriteLists) == 0 {
		listRows = append(listRows, s.Muted.Render("No favorite lists yet."), "", s.Muted.Render("Press [f] on any station or [n] to create one!"))
	} else {
		for i, fl := range m.favoriteLists {
			line := fmt.Sprintf("★ %-*s (%d)", maxInt(10, leftW-11), truncate(fl.Name, maxInt(10, leftW-11)), len(fl.StationAddresses))
			if i == m.archive.listCursor {
				if !m.archive.focusRight {
					listRows = append(listRows, s.RowActive.Width(leftW-4).Render(line))
				} else {
					listRows = append(listRows, s.Accent.Render(line))
				}
			} else {
				listRows = append(listRows, s.RowNormal.Render(line))
			}
		}
	}

	leftStyle := s.Panel
	rightStyle := s.Panel
	if !m.archive.focusRight {
		leftStyle = s.PanelFocus
	} else {
		rightStyle = s.PanelFocus
	}
	leftPanel := leftStyle.Width(leftW - 2).Height(panelInnerH).MaxHeight(panelTotalH).Render(strings.Join(listRows, "\n"))

	// Right pane: stations in selected list.
	stations := m.activeArchiveStations()
	visibleRows := maxInt(3, panelInnerH)
	if m.archive.stationCursor < m.archive.stationScroll {
		m.archive.stationScroll = m.archive.stationCursor
	}
	if m.archive.stationCursor >= m.archive.stationScroll+visibleRows {
		m.archive.stationScroll = m.archive.stationCursor - visibleRows + 1
	}
	var stRows []string
	if len(stations) == 0 {
		stRows = append(stRows, s.Muted.Render("This list has no stations yet."), s.Muted.Render("Browse [1] TRANSMIT and press [f] to star stations!"))
	} else {
		end := minInt(len(stations), m.archive.stationScroll+visibleRows)
		for i := m.archive.stationScroll; i < end; i++ {
			stRows = append(stRows, m.renderStationRow(stations[i], m.archive.focusRight && i == m.archive.stationCursor, maxInt(24, rightW-4)))
		}
	}
	rightPanel := rightStyle.Width(rightW - 2).Height(panelInnerH).MaxHeight(panelTotalH).Render(strings.Join(stRows, "\n"))

	return strings.Join([]string{
		toolbar,
		promptLine,
		lipgloss.JoinHorizontal(lipgloss.Top, leftPanel, " ", rightPanel),
	}, "\n")
}
