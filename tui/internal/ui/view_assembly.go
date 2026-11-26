package ui

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"

	nostrclient "github.com/zeSchlausKwab/wavefunc/tui/internal/nostr"
)

type assemblyComposeMode int

const (
	assemblyComposeNone assemblyComposeMode = iota
	assemblyComposeNew
	assemblyComposeReply
)

var assemblyCategories = []string{"general", "greeting", "feature", "bug"}

type assemblyState struct {
	cursor      int
	scroll      int
	loading     bool
	oldestUnix  int64
	composeMode assemblyComposeMode
	categoryIdx int
	input       textinput.Model
}

func newAssemblyState() assemblyState {
	in := textinput.New()
	in.Placeholder = "Share a station discovery or say hi to #wavefunc..."
	in.CharLimit = 280
	in.Width = 56
	return assemblyState{input: in}
}

func (m *AppModel) updateAssembly(msg tea.KeyMsg) tea.Cmd {
	k := msg.String()

	if m.assembly.composeMode != assemblyComposeNone {
		switch k {
		case "esc":
			m.assembly.composeMode = assemblyComposeNone
			m.assembly.input.Blur()
			return nil
		case "tab":
			if m.assembly.composeMode == assemblyComposeNew {
				m.assembly.categoryIdx = (m.assembly.categoryIdx + 1) % len(assemblyCategories)
			}
			return nil
		case "enter":
			text := strings.TrimSpace(m.assembly.input.Value())
			mode := m.assembly.composeMode
			cat := assemblyCategories[m.assembly.categoryIdx]
			m.assembly.composeMode = assemblyComposeNone
			m.assembly.input.Blur()
			if text == "" {
				return nil
			}
			if mode == assemblyComposeReply && len(m.assemblyPosts) > 0 && m.assembly.cursor < len(m.assemblyPosts) {
				return m.publishCommunityReplyCmd(m.assemblyPosts[m.assembly.cursor], text)
			}
			return m.publishCommunityPostCmd(text, cat)
		}
		var cmd tea.Cmd
		m.assembly.input, cmd = m.assembly.input.Update(msg)
		return cmd
	}

	switch k {
	case "up", "k":
		if m.assembly.cursor > 0 {
			m.assembly.cursor--
		}
	case "down", "j":
		if m.assembly.cursor+1 < len(m.assemblyPosts) {
			m.assembly.cursor++
		}
	case "n":
		if !m.session.CanSign() {
			return m.toastCmd("Sign in with 'a' to post in #wavefunc Assembly", true)
		}
		m.assembly.composeMode = assemblyComposeNew
		m.assembly.input.SetValue("")
		m.assembly.input.Placeholder = "Post to #wavefunc..."
		m.assembly.input.Focus()
		return textinput.Blink
	case "R":
		if !m.session.CanSign() {
			return m.toastCmd("Sign in with 'a' to reply", true)
		}
		if len(m.assemblyPosts) > 0 && m.assembly.cursor < len(m.assemblyPosts) {
			m.assembly.composeMode = assemblyComposeReply
			m.assembly.input.SetValue("")
			m.assembly.input.Placeholder = "Write a reply..."
			m.assembly.input.Focus()
			return textinput.Blink
		}
	case "r":
		if len(m.assemblyPosts) > 0 && m.assembly.cursor < len(m.assemblyPosts) {
			return m.reactNoteCmd(m.assemblyPosts[m.assembly.cursor].Event)
		}
	case "L":
		return m.fetchOlderAssemblyCmd()
	case "ctrl+r":
		return m.fetchAssemblyCmd(false)
	}
	return nil
}

func (m *AppModel) viewAssembly(width, height int) string {
	s := m.styles

	toolbar := s.BadgeLive.Render("ASSEMBLY // #WAVEFUNC") + "  " +
		s.KeyHint.Render("[n]") + s.Muted.Render(" new post  ") +
		s.KeyHint.Render("[R]") + s.Muted.Render(" reply  ") +
		s.KeyHint.Render("[r]") + " " + s.Primary.Render("♥") + "  " +
		s.KeyHint.Render("[L]") + s.Muted.Render(" load older")

	var subline string
	switch m.assembly.composeMode {
	case assemblyComposeNew:
		cat := strings.ToUpper(assemblyCategories[m.assembly.categoryIdx])
		subline = s.BadgeCyan.Render("TAG: "+cat) + " " + m.assembly.input.View() + s.Muted.Render(" (Tab tag · Enter post · Esc cancel)")
	case assemblyComposeReply:
		subline = s.BadgeCyan.Render("REPLY") + " " + m.assembly.input.View() + s.Muted.Render(" (Enter send · Esc cancel)")
	default:
		subline = s.Muted.Render(fmt.Sprintf("%d notes loaded from #wavefunc (NIP-10 kind 1)", len(m.assemblyPosts)))
	}

	panelTotalH := maxInt(5, height-2)
	panelInnerH := maxInt(3, panelTotalH-2)
	cardsPerScreen := maxInt(2, panelInnerH/3)
	if m.assembly.cursor < m.assembly.scroll {
		m.assembly.scroll = m.assembly.cursor
	}
	if m.assembly.cursor >= m.assembly.scroll+cardsPerScreen {
		m.assembly.scroll = m.assembly.cursor - cardsPerScreen + 1
	}

	var rows []string
	if m.assembly.loading && len(m.assemblyPosts) == 0 {
		rows = append(rows, "", s.Accent.Render("  ◌ Loading #wavefunc community feed..."))
	} else if len(m.assemblyPosts) == 0 {
		rows = append(rows, "", s.Muted.Render("  No #wavefunc posts in the last 7 days. Press [n] to say hello or [L] to load older!"))
	} else {
		innerW := maxInt(36, width-6)
		end := minInt(len(m.assemblyPosts), m.assembly.scroll+cardsPerScreen)
		for i := m.assembly.scroll; i < end; i++ {
			post := m.assemblyPosts[i]
			rows = append(rows, m.renderAssemblyRow(post, i == m.assembly.cursor, innerW))
		}
	}

	panel := s.PanelFocus.Width(width - 2).Height(panelInnerH).MaxHeight(panelTotalH).Render(strings.Join(rows, "\n"))
	return strings.Join([]string{toolbar, subline, panel}, "\n")
}

func (m *AppModel) renderAssemblyRow(post nostrclient.CommunityPost, selected bool, width int) string {
	s := m.styles
	prof := m.nostr.Profile(post.PubKey)
	author := prof.Label()
	age := relativeAge(post.CreatedAt)

	prefix := ""
	if post.IsReply {
		prefix = "↳ "
	}
	catBadges := ""
	for _, cat := range post.Categories {
		catBadges += " [" + strings.ToUpper(cat) + "]"
	}
	header := fmt.Sprintf("%s@%s%s  ·  %s", prefix, author, catBadges, age)
	body := wrapText(strings.ReplaceAll(post.Content, "\n", " "), maxInt(24, width-4), 2)

	if selected {
		return s.RowActive.Width(width).Render(" " + truncate(header, width-2)) + "\n" + s.Text.Render("  "+body) + "\n"
	}
	return s.Accent.Render(" "+truncate(header, width-2)) + "\n" + s.Muted.Render("  "+body) + "\n"
}

func relativeAge(unixSec int64) string {
	if unixSec <= 0 {
		return ""
	}
	d := time.Since(time.Unix(unixSec, 0))
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd ago", int(d.Hours()/24))
	}
}
