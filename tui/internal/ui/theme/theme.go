package theme

import (
	"github.com/charmbracelet/lipgloss"

	"github.com/zeSchlausKwab/wavefunc/tui/internal/config"
)

// Palette defines the Constructivist "Pocket Sonic Machine" color tokens.
type Palette struct {
	Name       string
	Bg         lipgloss.Color
	Surface    lipgloss.Color
	SurfaceHi  lipgloss.Color
	Text       lipgloss.Color
	Muted      lipgloss.Color
	Border     lipgloss.Color
	Primary    lipgloss.Color // Signal Red
	Accent     lipgloss.Color // High-Voltage Cyan
	Success    lipgloss.Color // Signal Up
	Warning    lipgloss.Color // Degraded / Amber
	Danger     lipgloss.Color
	OnPrimary  lipgloss.Color
	OnAccent   lipgloss.Color
}

var SonicDark = Palette{
	Name:      config.ThemeSonicDark,
	Bg:        lipgloss.Color("#14130f"),
	Surface:   lipgloss.Color("#1e1c16"),
	SurfaceHi: lipgloss.Color("#29261e"),
	Text:      lipgloss.Color("#f5efe0"),
	Muted:     lipgloss.Color("#8f887a"),
	Border:    lipgloss.Color("#5b524a"),
	Primary:   lipgloss.Color("#e63946"),
	Accent:    lipgloss.Color("#00dbe9"),
	Success:   lipgloss.Color("#2ec4b6"),
	Warning:   lipgloss.Color("#f4a261"),
	Danger:    lipgloss.Color("#ff4d5a"),
	OnPrimary: lipgloss.Color("#fef9ea"),
	OnAccent:  lipgloss.Color("#14130f"),
}

var ConstructivistPaper = Palette{
	Name:      config.ThemePaperLight,
	Bg:        lipgloss.Color("#fef9ea"),
	Surface:   lipgloss.Color("#f2ecdc"),
	SurfaceHi: lipgloss.Color("#e7e2d3"),
	Text:      lipgloss.Color("#1d1c13"),
	Muted:     lipgloss.Color("#6e655c"),
	Border:    lipgloss.Color("#926e6b"),
	Primary:   lipgloss.Color("#b60013"),
	Accent:    lipgloss.Color("#008b99"),
	Success:   lipgloss.Color("#168077"),
	Warning:   lipgloss.Color("#b86b00"),
	Danger:    lipgloss.Color("#b60013"),
	OnPrimary: lipgloss.Color("#fef9ea"),
	OnAccent:  lipgloss.Color("#fef9ea"),
}

// Styles holds precomputed Lip Gloss styles for the active theme.
type Styles struct {
	Palette Palette

	Brand      lipgloss.Style
	TabActive  lipgloss.Style
	TabIdle    lipgloss.Style
	BadgeLive  lipgloss.Style
	BadgeCyan  lipgloss.Style
	BadgeMuted lipgloss.Style
	BadgeWarn  lipgloss.Style

	Panel       lipgloss.Style
	PanelFocus  lipgloss.Style
	Dock        lipgloss.Style
	Modal       lipgloss.Style
	Frame       lipgloss.Style
	FrameAccent lipgloss.Style
	ToastOK     lipgloss.Style
	ToastErr    lipgloss.Style

	Title      lipgloss.Style
	Subtitle   lipgloss.Style
	Muted      lipgloss.Style
	Text       lipgloss.Style
	Primary    lipgloss.Style
	Accent     lipgloss.Style
	Success    lipgloss.Style
	Warning    lipgloss.Style
	Danger     lipgloss.Style
	RowNormal  lipgloss.Style
	RowActive  lipgloss.Style
	KeyHint    lipgloss.Style
	InputBox   lipgloss.Style
}

func ForName(name string) Styles {
	if name == config.ThemePaperLight {
		return New(ConstructivistPaper)
	}
	return New(SonicDark)
}

func New(p Palette) Styles {
	return Styles{
		Palette: p,
		Brand: lipgloss.NewStyle().
			Bold(true).
			Foreground(p.OnPrimary).
			Background(p.Primary).
			Padding(0, 1),
		TabActive: lipgloss.NewStyle().
			Bold(true).
			Foreground(p.OnAccent).
			Background(p.Accent).
			Padding(0, 1),
		TabIdle: lipgloss.NewStyle().
			Foreground(p.Muted).
			Padding(0, 1),
		BadgeLive: lipgloss.NewStyle().
			Bold(true).
			Foreground(p.OnPrimary).
			Background(p.Primary).
			Padding(0, 1),
		BadgeCyan: lipgloss.NewStyle().
			Bold(true).
			Foreground(p.OnAccent).
			Background(p.Accent).
			Padding(0, 1),
		BadgeMuted: lipgloss.NewStyle().
			Foreground(p.Text).
			Background(p.SurfaceHi).
			Padding(0, 1),
		BadgeWarn: lipgloss.NewStyle().
			Bold(true).
			Foreground(p.OnAccent).
			Background(p.Warning).
			Padding(0, 1),

		Panel: lipgloss.NewStyle().
			Border(lipgloss.NormalBorder()).
			BorderForeground(p.Border).
			Padding(0, 1),
		PanelFocus: lipgloss.NewStyle().
			Border(lipgloss.ThickBorder()).
			BorderForeground(p.Accent).
			Padding(0, 1),
		Dock: lipgloss.NewStyle().
			Border(lipgloss.ThickBorder()).
			BorderForeground(p.Border).
			Padding(0, 1),
		Modal: lipgloss.NewStyle().
			Border(lipgloss.ThickBorder()).
			BorderForeground(p.Primary).
			Padding(1, 2),
		Frame: lipgloss.NewStyle().
			Border(lipgloss.ThickBorder()).
			BorderForeground(p.Primary).
			Padding(0, 1),
		FrameAccent: lipgloss.NewStyle().
			Border(lipgloss.ThickBorder()).
			BorderForeground(p.Border).
			Padding(0, 1),
		ToastOK: lipgloss.NewStyle().
			Bold(true).
			Foreground(p.OnAccent).
			Background(p.Accent).
			Padding(0, 1),
		ToastErr: lipgloss.NewStyle().
			Bold(true).
			Foreground(p.OnPrimary).
			Background(p.Primary).
			Padding(0, 1),

		Title:    lipgloss.NewStyle().Bold(true).Foreground(p.Text),
		Subtitle: lipgloss.NewStyle().Bold(true).Foreground(p.Accent),
		Muted:    lipgloss.NewStyle().Foreground(p.Muted),
		Text:     lipgloss.NewStyle().Foreground(p.Text),
		Primary:  lipgloss.NewStyle().Bold(true).Foreground(p.Primary),
		Accent:   lipgloss.NewStyle().Bold(true).Foreground(p.Accent),
		Success:  lipgloss.NewStyle().Bold(true).Foreground(p.Success),
		Warning:  lipgloss.NewStyle().Bold(true).Foreground(p.Warning),
		Danger:   lipgloss.NewStyle().Bold(true).Foreground(p.Danger),
		RowNormal: lipgloss.NewStyle().
			Foreground(p.Text),
		RowActive: lipgloss.NewStyle().
			Bold(true).
			Foreground(p.OnAccent).
			Background(p.Accent),
		KeyHint: lipgloss.NewStyle().
			Foreground(p.Accent).
			Bold(true),
		InputBox: lipgloss.NewStyle().
			Border(lipgloss.NormalBorder()).
			BorderForeground(p.Accent).
			Padding(0, 1),
	}
}
