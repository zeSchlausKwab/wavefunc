package ui

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/zeSchlausKwab/wavefunc/tui/internal/auth"
	nostrclient "github.com/zeSchlausKwab/wavefunc/tui/internal/nostr"
)

type crateSub int

const (
	crateMySongs crateSub = iota
	crateSignals
)

type crateState struct {
	sub     crateSub
	cursor  int
	scroll  int
	loading bool
}

func (m *AppModel) activeCrateSongs() []nostrclient.Song {
	if m.crate.sub == crateSignals {
		return m.communitySignals
	}
	var out []nostrclient.Song
	seen := make(map[string]struct{})
	for _, sl := range m.songLists {
		for _, addr := range sl.SongAddresses {
			if _, ok := seen[addr]; ok {
				continue
			}
			seen[addr] = struct{}{}
			if song, ok := m.songByAddr[addr]; ok {
				out = append(out, song)
			} else {
				parts := strings.SplitN(addr, ":", 3)
				title := addr
				if len(parts) == 3 {
					title = parts[2]
				}
				out = append(out, nostrclient.Song{
					Address: addr,
					Title:   title,
				})
			}
		}
	}
	return out
}

func (m *AppModel) updateCrate(msg tea.KeyMsg) tea.Cmd {
	songs := m.activeCrateSongs()
	switch msg.String() {
	case "[", "]", "h", "l", "left", "right":
		if m.crate.sub == crateMySongs {
			m.crate.sub = crateSignals
			m.crate.cursor = 0
			m.crate.scroll = 0
			if len(m.communitySignals) == 0 {
				return m.fetchSignalsCmd()
			}
		} else {
			m.crate.sub = crateMySongs
			m.crate.cursor = 0
			m.crate.scroll = 0
		}
	case "up", "k":
		if m.crate.cursor > 0 {
			m.crate.cursor--
		}
	case "down", "j":
		if m.crate.cursor+1 < len(songs) {
			m.crate.cursor++
		}
	case "R":
		if m.crate.sub == crateSignals {
			return m.fetchSignalsCmd()
		}
		return m.fetchUserListsCmd()
	case "x":
		if m.crate.sub == crateMySongs && len(songs) > 0 && m.crate.cursor < len(songs) && len(m.songLists) > 0 {
			return m.removeSongFromCrateCmd(m.songLists[0], songs[m.crate.cursor].Address)
		}
	case "s":
		return m.saveCurrentTrackCmd()
	}
	return nil
}

func (m *AppModel) viewCrate(width, height int) string {
	s := m.styles

	myPill := s.Muted.Render("MY CRATE")
	sigPill := s.Muted.Render("COMMUNITY SIGNALS")
	if m.crate.sub == crateMySongs {
		myPill = s.BadgeCyan.Render("MY CRATE")
	} else {
		sigPill = s.BadgeCyan.Render("COMMUNITY SIGNALS")
	}

	toolbar := myPill + " " + sigPill + "   " +
		s.KeyHint.Render("[s]") + s.Muted.Render(" save now-playing track  ") +
		s.KeyHint.Render("[[]/[]]") + s.Muted.Render(" switch  ") +
		s.KeyHint.Render("[R]") + s.Muted.Render(" refresh")

	subline := s.Muted.Render("Songs saved via kind 31337 + 30078 — synced with WaveFunc web & desktop")
	if m.crate.sub == crateMySongs && m.session.Mode() == auth.ModeGuest {
		subline = s.Warning.Render("Guest mode — press [a] to sign in to save songs, or switch to COMMUNITY SIGNALS with ]")
	}

	songs := m.activeCrateSongs()
	panelTotalH := maxInt(5, height-2)
	panelInnerH := maxInt(3, panelTotalH-2)
	visibleRows := maxInt(3, panelInnerH)
	if m.crate.cursor < m.crate.scroll {
		m.crate.scroll = m.crate.cursor
	}
	if m.crate.cursor >= m.crate.scroll+visibleRows {
		m.crate.scroll = m.crate.cursor - visibleRows + 1
	}

	var rows []string
	if m.crate.loading && len(songs) == 0 {
		rows = append(rows, s.Accent.Render("  ◌ Loading song signals..."))
	} else if len(songs) == 0 {
		if m.crate.sub == crateMySongs {
			rows = append(rows,
				"",
				s.Muted.Render("  Your crate is empty!"),
				s.Muted.Render("  Tune into a station with live ICY track metadata and press [s] to save tracks here."),
			)
		} else {
			rows = append(rows, "", s.Muted.Render("  No community song signals received yet."))
		}
	} else {
		innerW := maxInt(36, width-6)
		end := minInt(len(songs), m.crate.scroll+visibleRows)
		for i := m.crate.scroll; i < end; i++ {
			song := songs[i]
			title := song.Title
			if title == "" {
				title = "UNKNOWN_TRACK"
			}
			artist := song.Artist
			if artist == "" {
				artist = "Unknown Artist"
			}
			meta := artist
			if song.Album != "" {
				meta += " · " + song.Album
			}
			if song.ReleaseYear > 0 {
				meta += fmt.Sprintf(" (%d)", song.ReleaseYear)
			}
			titleW := maxInt(20, innerW/2-4)
			metaW := maxInt(16, innerW-titleW-6)
			line := fmt.Sprintf("♪ %-*s  %s", titleW, truncate(title, titleW), truncate(meta, metaW))
			if i == m.crate.cursor {
				rows = append(rows, s.RowActive.Width(innerW).Render(line))
			} else {
				rows = append(rows, s.Accent.Render("♪ ")+s.Title.Render(fmt.Sprintf("%-*s", titleW, truncate(title, titleW)))+"  "+s.Muted.Render(truncate(meta, metaW)))
			}
		}
	}

	panel := s.PanelFocus.Width(width - 2).Height(panelInnerH).MaxHeight(panelTotalH).Render(strings.Join(rows, "\n"))
	return strings.Join([]string{toolbar, subline, panel}, "\n")
}
