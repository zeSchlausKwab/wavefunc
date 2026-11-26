package anim

import (
	"math"
	"strings"

	"github.com/charmbracelet/lipgloss"

	"github.com/zeSchlausKwab/wavefunc/tui/internal/player"
)

type vec3 struct {
	x, y, z float64
}

var (
	cubeVertices = [8]vec3{
		{-1, -1, -1},
		{1, -1, -1},
		{1, 1, -1},
		{-1, 1, -1},
		{-1, -1, 1},
		{1, -1, 1},
		{1, 1, 1},
		{-1, 1, 1},
	}

	cubeEdges = [12][2]int{
		{0, 1}, {1, 2}, {2, 3}, {3, 0}, // back face
		{4, 5}, {5, 6}, {6, 7}, {7, 4}, // front face
		{0, 4}, {1, 5}, {2, 6}, {3, 7}, // connectors
	}

	// Braille dot bitmasks indexed by [subY (0..3)][subX (0..1)].
	brailleDot = [4][2]uint8{
		{0x01, 0x08},
		{0x02, 0x10},
		{0x04, 0x20},
		{0x40, 0x80},
	}
)

func rotateVec3(v vec3, ax, ay, az float64) vec3 {
	// Rotate X
	sx, cx := math.Sin(ax), math.Cos(ax)
	y1 := v.y*cx - v.z*sx
	z1 := v.y*sx + v.z*cx
	x1 := v.x

	// Rotate Y
	sy, cy := math.Sin(ay), math.Cos(ay)
	x2 := x1*cy + z1*sy
	z2 := -x1*sy + z1*cy
	y2 := y1

	// Rotate Z
	sz, cz := math.Sin(az), math.Cos(az)
	x3 := x2*cz - y2*sz
	y3 := x2*sz + y2*cz

	return vec3{x: x3, y: y3, z: z2}
}

type brailleCell struct {
	mask     uint8
	maxZ     float64
	isVertex bool
	isCore   bool
}

// RenderCube renders a smooth, depth-shaded rotating 3D wireframe cube using
// Unicode Braille sub-pixels (2x4 dots per character cell). Every output line
// has exact terminal width `cols` and total height `rows`.
func (a *Animator) RenderCube(
	cols, rows int,
	status player.Status,
	muted bool,
	withCore bool,
	accent, primary, dim lipgloss.Style,
) string {
	if cols < 4 {
		cols = 4
	}
	if rows < 2 {
		rows = 2
	}

	pxW := cols * 2
	pxH := rows * 4

	grid := make([]brailleCell, cols*rows)
	for i := range grid {
		grid[i].maxZ = -1e9
	}

	plot := func(px, py int, z float64, vertex, core bool) {
		if px < 0 || px >= pxW || py < 0 || py >= pxH {
			return
		}
		cx := px / 2
		cy := py / 4
		idx := cy*cols + cx
		cell := &grid[idx]
		cell.mask |= brailleDot[py%4][px%2]
		if z > cell.maxZ {
			cell.maxZ = z
		}
		if vertex {
			cell.isVertex = true
		}
		if core {
			cell.isCore = true
		}
	}

	drawLine := func(x0, y0, z0, x1, y1, z1 float64, core bool) {
		dx := x1 - x0
		dy := y1 - y0
		steps := int(math.Ceil(math.Max(math.Abs(dx), math.Abs(dy)) * 1.4))
		if steps < 1 {
			steps = 1
		}
		for i := 0; i <= steps; i++ {
			t := float64(i) / float64(steps)
			px := int(math.Round(x0 + dx*t))
			py := int(math.Round(y0 + dy*t))
			z := z0 + (z1-z0)*t
			plot(px, py, z, false, core)
		}
	}

	// Gentle beat-breathing scale when actively playing audio.
	pulse := 1.0
	if status == player.StatusPlaying && !muted {
		pulse = 1.0 + 0.055*math.Sin(float64(a.Frame)*0.22)
	}

	const camDist = 3.4
	minDim := float64(pxW)
	if float64(pxH) < minDim {
		minDim = float64(pxH)
	}
	scale := minDim * 0.34 * pulse
	cx := float64(pxW-1) / 2.0
	cy := float64(pxH-1) / 2.0

	project := func(v vec3, ax, ay, az, s float64) (float64, float64, float64) {
		r := rotateVec3(vec3{v.x * s, v.y * s, v.z * s}, ax, ay, az)
		f := camDist / (camDist - r.z)
		return cx + r.x*f*scale, cy - r.y*f*scale, r.z
	}

	// Project outer cube vertices.
	var proj [8][3]float64
	for i, v := range cubeVertices {
		px, py, pz := project(v, a.cubeX, a.cubeY, a.cubeZ, 1.0)
		proj[i] = [3]float64{px, py, pz}
	}

	// Draw outer wireframe edges.
	for _, e := range cubeEdges {
		p0 := proj[e[0]]
		p1 := proj[e[1]]
		drawLine(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], false)
	}

	// Accentuate the 8 cube corners (and thicken front vertices on larger cubes).
	for _, p := range proj {
		vx := int(math.Round(p[0]))
		vy := int(math.Round(p[1]))
		plot(vx, vy, p[2]+0.15, true, false)
		if cols >= 14 && p[2] > 0 {
			plot(vx+1, vy, p[2]+0.1, true, false)
			plot(vx, vy+1, p[2]+0.1, true, false)
		}
	}

	// Optional counter-rotating mini inner cube (tesseract/sonic core vibe) for
	// medium & large canvases (onboarding hero and 12x5 player dock).
	if withCore && cols >= 12 && rows >= 5 {
		var inner [8][3]float64
		for i, v := range cubeVertices {
			px, py, pz := project(v, -a.cubeX*1.35, -a.cubeY*1.2, a.cubeZ*0.8, 0.42)
			inner[i] = [3]float64{px, py, pz}
		}
		for _, e := range cubeEdges {
			p0 := inner[e[0]]
			p1 := inner[e[1]]
			drawLine(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], true)
		}
	}

	// Render cell grid into styled lines of uniform width `cols`.
	lines := make([]string, rows)
	for r := 0; r < rows; r++ {
		var b strings.Builder
		for c := 0; c < cols; c++ {
			cell := grid[r*cols+c]
			if cell.mask == 0 {
				b.WriteByte(' ')
				continue
			}
			ch := string(rune(0x2800 | uint16(cell.mask)))
			switch {
			case cell.isCore && status == player.StatusPlaying && !muted:
				b.WriteString(primary.Render(ch))
			case cell.isCore:
				b.WriteString(accent.Render(ch))
			case cell.isVertex && cell.maxZ > 0.15 && status == player.StatusPlaying && !muted:
				b.WriteString(primary.Render(ch))
			case cell.maxZ >= 0.0:
				b.WriteString(accent.Render(ch))
			default:
				b.WriteString(dim.Render(ch))
			}
		}
		lines[r] = b.String()
	}

	return strings.Join(lines, "\n")
}
