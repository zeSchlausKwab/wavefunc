package anim

import (
	"math"
	"strings"

	"github.com/charmbracelet/harmonica"
	"github.com/charmbracelet/lipgloss"
	qrcode "github.com/skip2/go-qrcode"

	"github.com/zeSchlausKwab/wavefunc/tui/internal/player"
)

const (
	FPS          = 20
	SpectrumBars = 18
)

var (
	barGlyphs     = []rune{'▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'}
	reelFrames    = []string{"◐", "◓", "◑", "◒"}
	antennaFrames = []string{" ·●· ", " (●) ", "((●))", " (●) "}
)

// Animator drives Harmonica spring physics for the spectrum, analog tuning dial,
// and pocket radio cassette reels.
type Animator struct {
	Frame       uint64
	bars        [SpectrumBars]float64
	barVel      [SpectrumBars]float64
	barSpring   harmonica.Spring
	needlePos   float64
	needleVel   float64
	needleSpr   harmonica.Spring
	targetLock  float64
	cubeX       float64
	cubeY       float64
	cubeZ       float64
	cubeSpeed   float64
	cubeSpdVel  float64
	cubeSpdSpr  harmonica.Spring
}

func New() *Animator {
	return &Animator{
		barSpring:  harmonica.NewSpring(harmonica.FPS(FPS), 7.5, 0.52),
		needleSpr:  harmonica.NewSpring(harmonica.FPS(FPS), 5.0, 0.65),
		cubeSpdSpr: harmonica.NewSpring(harmonica.FPS(FPS), 4.0, 0.75),
		needlePos:  0.15,
		targetLock: 0.58,
		cubeX:      0.55,
		cubeY:      0.75,
		cubeZ:      0.15,
		cubeSpeed:  0.45,
	}
}

// Retune picks a fresh deterministic target position on the FM dial for a station.
func (a *Animator) Retune(seed string) {
	var h uint32 = 2166136261
	for i := 0; i < len(seed); i++ {
		h ^= uint32(seed[i])
		h *= 16777619
	}
	a.targetLock = 0.12 + float64(h%760)/1000.0
}

// Step advances spring animations by one tick based on live player status.
func (a *Animator) Step(status player.Status, muted bool) {
	a.Frame++
	t := float64(a.Frame) / float64(FPS)

	// Smoothly transition 3D cube spin speed based on playback state.
	targetSpeed := 0.48
	switch {
	case status == player.StatusPlaying && !muted:
		targetSpeed = 1.25
	case status == player.StatusTuning || status == player.StatusBuffering:
		targetSpeed = 2.10
	case status == player.StatusPaused || (status == player.StatusPlaying && muted):
		targetSpeed = 0.08
	case status == player.StatusFailed:
		targetSpeed = 0.0
	}
	a.cubeSpeed, a.cubeSpdVel = a.cubeSpdSpr.Update(a.cubeSpeed, a.cubeSpdVel, targetSpeed)
	dt := 1.0 / float64(FPS)
	a.cubeY += 1.05 * a.cubeSpeed * dt
	a.cubeX += 0.62 * a.cubeSpeed * dt
	a.cubeZ += 0.28 * a.cubeSpeed * dt

	// Update FM tuning needle.
	needleTarget := a.targetLock
	switch status {
	case player.StatusTuning, player.StatusBuffering:
		needleTarget = 0.5 + 0.42*math.Sin(t*3.2)
	case player.StatusIdle:
		needleTarget = 0.12 + 0.04*math.Sin(t*0.7)
	}
	a.needlePos, a.needleVel = a.needleSpr.Update(a.needlePos, a.needleVel, needleTarget)

	// Update spring-smoothed equalizer bars.
	for i := 0; i < SpectrumBars; i++ {
		fi := float64(i)
		var target float64
		switch {
		case status == player.StatusPlaying && !muted:
			w1 := 0.42 + 0.36*math.Sin(t*4.7+fi*0.62)
			w2 := 0.24 * math.Sin(t*8.3-fi*1.13)
			w3 := 0.16 * math.Cos(t*2.9+fi*0.35)
			envelope := 0.72 + 0.28*math.Sin((fi/float64(SpectrumBars))*math.Pi)
			target = clamp01((w1 + w2 + w3) * envelope)
		case status == player.StatusTuning || status == player.StatusBuffering:
			pos := math.Mod(t*14.0, float64(SpectrumBars))
			dist := math.Abs(fi - pos)
			target = clamp01(0.85 * math.Exp(-dist*dist/3.5))
		case status == player.StatusIdle:
			target = 0.14 + 0.08*math.Sin(t*1.6+fi*0.45)
		default:
			target = 0.05
		}
		a.bars[i], a.barVel[i] = a.barSpring.Update(a.bars[i], a.barVel[i], target)
	}
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// RenderSpectrum draws a vibrant 1-line spring-animated bar equalizer.
func (a *Animator) RenderSpectrum(width int, status player.Status, muted bool, accent, primary, dim lipgloss.Style) string {
	if width <= 0 {
		return ""
	}
	count := width
	if count > SpectrumBars {
		count = SpectrumBars
	}
	var b strings.Builder
	for i := 0; i < count; i++ {
		val := clamp01(a.bars[i])
		idx := int(math.Round(val * float64(len(barGlyphs)-1)))
		if idx < 0 {
			idx = 0
		}
		if idx >= len(barGlyphs) {
			idx = len(barGlyphs) - 1
		}
		ch := string(barGlyphs[idx])
		switch {
		case status == player.StatusPlaying && !muted && idx >= 6:
			b.WriteString(primary.Render(ch))
		case status == player.StatusPlaying && !muted:
			b.WriteString(accent.Render(ch))
		case status == player.StatusTuning || status == player.StatusBuffering:
			b.WriteString(accent.Render(ch))
		default:
			b.WriteString(dim.Render(ch))
		}
	}
	return b.String()
}

// RenderTuningDial renders a retro Constructivist FM dial with animated needle.
func (a *Animator) RenderTuningDial(width int, status player.Status, accent, primary, dim lipgloss.Style) string {
	if width < 14 {
		width = 14
	}
	pos := int(math.Round(clamp01(a.needlePos) * float64(width-1)))
	if pos < 0 {
		pos = 0
	}
	if pos >= width {
		pos = width - 1
	}
	var b strings.Builder
	for i := 0; i < width; i++ {
		if i == pos {
			if status == player.StatusPlaying {
				b.WriteString(primary.Render("┃"))
			} else {
				b.WriteString(accent.Render("┃"))
			}
		} else if i%4 == 0 {
			b.WriteString(dim.Render("┼"))
		} else {
			b.WriteString(dim.Render("─"))
		}
	}
	return b.String()
}

// RenderCompactDeck draws a cute 1-line spinning cassette indicator for the dock.
func (a *Animator) RenderCompactDeck(status player.Status, accent, primary, dim lipgloss.Style) string {
	switch status {
	case player.StatusPlaying:
		reel := reelFrames[(a.Frame/3)%uint64(len(reelFrames))]
		ant := antennaFrames[(a.Frame/5)%uint64(len(antennaFrames))]
		return primary.Render(ant) + accent.Render("["+reel+"═"+reel+"]")
	case player.StatusTuning, player.StatusBuffering:
		reel := reelFrames[(a.Frame/2)%uint64(len(reelFrames))]
		return accent.Render(" ~"+reel+"~ ") + dim.Render("[═══]")
	case player.StatusPaused:
		return dim.Render("  ⏸  [●═●]")
	default:
		return dim.Render(" ·○· [○═○]")
	}
}

func alignRow(left, right string, width int) string {
	gap := width - lipgloss.Width(left) - lipgloss.Width(right)
	if gap < 1 {
		gap = 1
	}
	return left + strings.Repeat(" ", gap) + right
}

// RenderMascot returns the Pocket Sonic Machine radio art using Lip Gloss
// borders so every row and right border aligns cleanly across all states.
func (a *Animator) RenderMascot(status player.Status, accent, primary, text, dim lipgloss.Style) string {
	const innerW = 36

	ant := antennaFrames[(a.Frame/6)%uint64(len(antennaFrames))]
	reel := "○"
	statusTag := dim.Render("STANDBY")
	if status == player.StatusPlaying {
		reel = reelFrames[(a.Frame/3)%uint64(len(reelFrames))]
		statusTag = primary.Render("◉ ON AIR")
	} else if status == player.StatusTuning || status == player.StatusBuffering {
		reel = reelFrames[(a.Frame/2)%uint64(len(reelFrames))]
		statusTag = accent.Render("◌ TUNING")
	}

	row1Left := accent.Render("["+reel+"]") + dim.Render(" ════════════ ") + accent.Render("["+reel+"]")
	row1 := alignRow(row1Left, statusTag, innerW)

	row2Left := a.RenderTuningDial(26, status, accent, primary, dim)
	row2 := alignRow(row2Left, dim.Render("FM 108"), innerW)

	row3Left := a.RenderSpectrum(18, status, false, accent, primary, dim)
	row3 := alignRow(row3Left, dim.Render("SONIC·MCH"), innerW)

	borderColor := text.GetForeground()
	chassis := lipgloss.NewStyle().
		Border(lipgloss.ThickBorder()).
		BorderForeground(borderColor).
		Padding(0, 1).
		Width(innerW + 2).
		Render(strings.Join([]string{row1, row2, row3}, "\n"))

	antennaLine := lipgloss.NewStyle().
		Width(lipgloss.Width(chassis)).
		Align(lipgloss.Center).
		Render(primary.Render(ant) + dim.Render("  //  ") + accent.Render("WAVEFUNC TERMINAL"))

	return lipgloss.JoinVertical(lipgloss.Left, antennaLine, chassis)
}

// RenderVolumeBar draws a tactile Constructivist block meter.
func RenderVolumeBar(vol int, muted bool, accent, primary, dim lipgloss.Style) string {
	const slots = 8
	if muted {
		return primary.Render("MUTE ") + dim.Render(strings.Repeat("░", slots))
	}
	filled := int(math.Round(float64(vol) / 100.0 * slots))
	if filled < 0 {
		filled = 0
	}
	if filled > slots {
		filled = slots
	}
	return accent.Render(strings.Repeat("█", filled)) + dim.Render(strings.Repeat("░", slots-filled))
}

// RenderQR generates a compact, high-contrast Unicode half-block QR code
// with a clean 1-module white quiet zone. Returns rendered art plus exact
// terminal column width and row height so callers never wrap or clip it.
func RenderQR(content string) (art string, cols int, rows int, err error) {
	qr, err := qrcode.New(content, qrcode.Low)
	if err != nil {
		return "", 0, 0, err
	}
	qr.DisableBorder = true
	raw := qr.Bitmap()
	n := len(raw)
	if n == 0 {
		return "", 0, 0, nil
	}

	// Add a crisp 1-module white quiet zone on all 4 sides (much smaller than
	// go-qrcode's default 4-module border while remaining easily scannable).
	const margin = 1
	size := n + margin*2
	isBlack := func(r, c int) bool {
		rr := r - margin
		cc := c - margin
		if rr < 0 || rr >= n || cc < 0 || cc >= n {
			return false
		}
		return raw[rr][cc]
	}

	// Explicit black foreground on white background guarantees reliable camera
	// scanning on both dark and light terminal themes.
	cellStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#000000")).
		Background(lipgloss.Color("#ffffff"))

	lines := make([]string, 0, (size+1)/2)
	for y := 0; y < size; y += 2 {
		var row strings.Builder
		row.Grow(size * 3)
		for x := 0; x < size; x++ {
			top := isBlack(y, x)
			bottom := false
			if y+1 < size {
				bottom = isBlack(y+1, x)
			}
			switch {
			case top && bottom:
				row.WriteRune('█')
			case top && !bottom:
				row.WriteRune('▀')
			case !top && bottom:
				row.WriteRune('▄')
			default:
				row.WriteRune(' ')
			}
		}
		lines = append(lines, cellStyle.Render(row.String()))
	}
	return strings.Join(lines, "\n"), size, len(lines), nil
}
