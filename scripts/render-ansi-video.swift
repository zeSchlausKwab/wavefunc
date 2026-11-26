import AppKit
import CoreGraphics
import CoreText
import Foundation

// Renders newline-delimited JSON ANSI frames from wf-teaser-frames into
// 1280x720 Retina-sharp RGBA frames piped directly to ffmpeg (stdout).

struct FrameRecord: Decodable {
    let frame: Int
    let theme: String
    let ansi: String
}

struct RGB {
    let r: CGFloat
    let g: CGFloat
    let b: CGFloat
}

struct Cell {
    var ch: Character = " "
    var fg: RGB
    var bg: RGB? = nil
    var bold: Bool = false
}

let darkCanvasBg = RGB(r: 0x14 / 255.0, g: 0x13 / 255.0, b: 0x0f / 255.0)
let darkDefaultFg = RGB(r: 0xf5 / 255.0, g: 0xef / 255.0, b: 0xe0 / 255.0)
let lightCanvasBg = RGB(r: 0xfe / 255.0, g: 0xf9 / 255.0, b: 0xea / 255.0)
let lightDefaultFg = RGB(r: 0x1d / 255.0, g: 0x1c / 255.0, b: 0x13 / 255.0)
let backdropBg = RGB(r: 0x0b / 255.0, g: 0x0a / 255.0, b: 0x08 / 255.0)
let chromeBg = RGB(r: 0x1d / 255.0, g: 0x1b / 255.0, b: 0x15 / 255.0)

func ansi256ToRGB(_ code: Int) -> RGB {
    if code < 16 {
        let base: [(Int, Int, Int)] = [
            (20, 19, 15), (230, 57, 70), (46, 196, 182), (244, 162, 97),
            (0, 153, 168), (182, 0, 19), (0, 219, 233), (245, 239, 224),
            (120, 113, 102), (255, 77, 90), (80, 220, 205), (255, 195, 130),
            (60, 190, 210), (220, 60, 80), (80, 238, 248), (254, 249, 234),
        ]
        let c = base[max(0, min(15, code))]
        return RGB(r: CGFloat(c.0) / 255.0, g: CGFloat(c.1) / 255.0, b: CGFloat(c.2) / 255.0)
    }
    if code >= 232 {
        let v = CGFloat(8 + (code - 232) * 10) / 255.0
        return RGB(r: v, g: v, b: v)
    }
    let idx = code - 16
    let r = idx / 36
    let g = (idx % 36) / 6
    let b = idx % 6
    let lut: [CGFloat] = [0, 95, 135, 175, 215, 255]
    return RGB(r: lut[r] / 255.0, g: lut[g] / 255.0, b: lut[b] / 255.0)
}

func parseANSILines(_ text: String, defaultFg: RGB) -> [[Cell]] {
    var rows: [[Cell]] = []
    for rawLine in text.split(separator: "\n", omittingEmptySubsequences: false) {
        var row: [Cell] = []
        var fg = defaultFg
        var bg: RGB? = nil
        var bold = false

        let scalars = Array(rawLine)
        var i = 0
        while i < scalars.count {
            let ch = scalars[i]
            if ch == "\u{001B}", i + 1 < scalars.count, scalars[i + 1] == "[" {
                var j = i + 2
                var seq = ""
                while j < scalars.count && scalars[j] != "m" && !scalars[j].isLetter {
                    seq.append(scalars[j])
                    j += 1
                }
                if j < scalars.count && scalars[j] == "m" {
                    let parts = seq.isEmpty ? [0] : seq.split(separator: ";").compactMap { Int($0) }
                    var p = 0
                    while p < parts.count {
                        let code = parts[p]
                        switch code {
                        case 0:
                            fg = defaultFg
                            bg = nil
                            bold = false
                        case 1:
                            bold = true
                        case 22:
                            bold = false
                        case 39:
                            fg = defaultFg
                        case 49:
                            bg = nil
                        case 30...37:
                            fg = ansi256ToRGB(code - 30)
                        case 90...97:
                            fg = ansi256ToRGB(code - 90 + 8)
                        case 40...47:
                            bg = ansi256ToRGB(code - 40)
                        case 100...107:
                            bg = ansi256ToRGB(code - 100 + 8)
                        case 38:
                            if p + 4 < parts.count && parts[p + 1] == 2 {
                                fg = RGB(r: CGFloat(parts[p + 2]) / 255.0, g: CGFloat(parts[p + 3]) / 255.0, b: CGFloat(parts[p + 4]) / 255.0)
                                p += 4
                            } else if p + 2 < parts.count && parts[p + 1] == 5 {
                                fg = ansi256ToRGB(parts[p + 2])
                                p += 2
                            }
                        case 48:
                            if p + 4 < parts.count && parts[p + 1] == 2 {
                                bg = RGB(r: CGFloat(parts[p + 2]) / 255.0, g: CGFloat(parts[p + 3]) / 255.0, b: CGFloat(parts[p + 4]) / 255.0)
                                p += 4
                            } else if p + 2 < parts.count && parts[p + 1] == 5 {
                                bg = ansi256ToRGB(parts[p + 2])
                                p += 2
                            }
                        default:
                            break
                        }
                        p += 1
                    }
                    i = j + 1
                    continue
                }
            }
            if ch != "\r" {
                row.append(Cell(ch: ch, fg: fg, bg: bg, bold: bold))
            }
            i += 1
        }
        rows.append(row)
    }
    return rows
}

let imgW = 1280
let imgH = 720
let gridCols = 114
let gridRows = 30

// Window chrome geometry inside 1280x720 HD canvas.
let winMarginX: CGFloat = 44
let winMarginTop: CGFloat = 24
let winMarginBot: CGFloat = 24
let titleBarH: CGFloat = 34
let winX = winMarginX
let winY = winMarginBot
let winW = CGFloat(imgW) - winMarginX * 2
let winH = CGFloat(imgH) - winMarginTop - winMarginBot
let termPadX: CGFloat = 18
let termPadY: CGFloat = 12
let termW = winW - termPadX * 2
let termH = winH - titleBarH - termPadY * 2
let cellW = floor(termW / CGFloat(gridCols) * 10.0) / 10.0
let cellH = floor(termH / CGFloat(gridRows) * 10.0) / 10.0
let gridOriginX = winX + (winW - cellW * CGFloat(gridCols)) / 2.0
let gridTopY = winY + winH - titleBarH - (winH - titleBarH - cellH * CGFloat(gridRows)) / 2.0

let fontSize: CGFloat = 15.2
let regularFont = NSFont(name: "Menlo-Regular", size: fontSize) ?? NSFont.monospacedSystemFont(ofSize: fontSize, weight: .regular)
let boldFont = NSFont(name: "Menlo-Bold", size: fontSize) ?? NSFont.monospacedSystemFont(ofSize: fontSize, weight: .bold)
let titleFont = NSFont(name: "Menlo-Bold", size: 12.5) ?? NSFont.monospacedSystemFont(ofSize: 12.5, weight: .bold)

let colorSpace = CGColorSpaceCreateDeviceRGB()
let bytesPerRow = imgW * 4
var pixelBuffer = [UInt8](repeating: 0, count: bytesPerRow * imgH)

guard let ctx = CGContext(
    data: &pixelBuffer,
    width: imgW,
    height: imgH,
    bitsPerComponent: 8,
    bytesPerRow: bytesPerRow,
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else {
    fputs("Failed to create CGContext\n", stderr)
    exit(1)
}

ctx.setAllowsAntialiasing(true)
ctx.setShouldAntialias(true)
ctx.setAllowsFontSmoothing(true)
ctx.setShouldSmoothFonts(true)

let posterPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
let posterFrameIdx = CommandLine.arguments.count > 2 ? (Int(CommandLine.arguments[2]) ?? 118) : 118

func cgColor(_ c: RGB, alpha: CGFloat = 1.0) -> CGColor {
    CGColor(colorSpace: colorSpace, components: [c.r, c.g, c.b, alpha])!
}

func drawGlyph(_ ch: Character, at x: CGFloat, baselineY: CGFloat, fg: RGB, bold: Bool) {
    let str = String(ch)
    let font = bold ? boldFont : regularFont
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: NSColor(calibratedRed: fg.r, green: fg.g, blue: fg.b, alpha: 1.0),
    ]
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: str, attributes: attrs))
    ctx.textPosition = CGPoint(x: x, y: baselineY)
    CTLineDraw(line, ctx)
}

let decoder = JSONDecoder()
let stdoutHandle = FileHandle.standardOutput

while let lineStr = readLine() {
    guard let data = lineStr.data(using: .utf8),
          let rec = try? decoder.decode(FrameRecord.self, from: data) else {
        continue
    }

    let isLight = rec.theme == "light"
    let canvasBg = isLight ? lightCanvasBg : darkCanvasBg
    let defaultFg = isLight ? lightDefaultFg : darkDefaultFg

    // 1. Editorial outer backdrop + subtle Constructivist red accent shadow.
    ctx.setFillColor(cgColor(backdropBg))
    ctx.fill(CGRect(x: 0, y: 0, width: imgW, height: imgH))

    ctx.setFillColor(cgColor(RGB(r: 0xb6 / 255.0, g: 0x00, b: 0x13 / 255.0)))
    ctx.fill(CGRect(x: winX + 8, y: winY - 8, width: winW, height: winH))

    // 2. Terminal window body + border.
    ctx.setFillColor(cgColor(canvasBg))
    ctx.fill(CGRect(x: winX, y: winY, width: winW, height: winH))

    // 3. Titlebar chrome.
    let barRect = CGRect(x: winX, y: winY + winH - titleBarH, width: winW, height: titleBarH)
    ctx.setFillColor(cgColor(chromeBg))
    ctx.fill(barRect)

    // Traffic light dots (Constructivist red, amber, cyan).
    let dotY = barRect.midY
    let dotColors: [RGB] = [
        RGB(r: 0xe6 / 255.0, g: 0x39 / 255.0, b: 0x46 / 255.0),
        RGB(r: 0xf4 / 255.0, g: 0xa2 / 255.0, b: 0x61 / 255.0),
        RGB(r: 0x00 / 255.0, g: 0xdb / 255.0, b: 0xe9 / 255.0),
    ]
    for (idx, col) in dotColors.enumerated() {
        let cx = winX + 20 + CGFloat(idx) * 18
        ctx.setFillColor(cgColor(col))
        ctx.fillEllipse(in: CGRect(x: cx - 5, y: dotY - 5, width: 10, height: 10))
    }

    // Centered titlebar text.
    let titleAttrs: [NSAttributedString.Key: Any] = [
        .font: titleFont,
        .foregroundColor: NSColor(calibratedRed: 0.72, green: 0.69, blue: 0.63, alpha: 1.0),
    ]
    let titleLine = CTLineCreateWithAttributedString(NSAttributedString(string: "wf  —  wavefunc.live  //  terminal radio", attributes: titleAttrs))
    let titleBounds = CTLineGetBoundsWithOptions(titleLine, [])
    ctx.textPosition = CGPoint(x: winX + (winW - titleBounds.width) / 2.0, y: barRect.midY - 4.5)
    CTLineDraw(titleLine, ctx)

    // Outer crisp border around window.
    ctx.setStrokeColor(cgColor(RGB(r: 0x5b / 255.0, g: 0x52 / 255.0, b: 0x4a / 255.0)))
    ctx.setLineWidth(2.0)
    ctx.stroke(CGRect(x: winX, y: winY, width: winW, height: winH))

    // 4. Draw terminal ANSI cell grid.
    let parsedRows = parseANSILines(rec.ansi, defaultFg: defaultFg)
    let descent = abs(regularFont.descender)

    for (rIdx, cells) in parsedRows.prefix(gridRows).enumerated() {
        let cellTopY = gridTopY - CGFloat(rIdx) * cellH
        let cellBottomY = cellTopY - cellH
        let baselineY = cellBottomY + descent + 1.5

        for (cIdx, cell) in cells.prefix(gridCols).enumerated() {
            let x = gridOriginX + CGFloat(cIdx) * cellW
            if let bg = cell.bg {
                ctx.setFillColor(cgColor(bg))
                ctx.fill(CGRect(x: x, y: cellBottomY, width: cellW + 0.5, height: cellH + 0.5))
            }
            if cell.ch != " " {
                drawGlyph(cell.ch, at: x, baselineY: baselineY, fg: cell.fg, bold: cell.bold)
            }
        }
    }

    // Save crisp poster PNG on the designated highlight frame.
    if !posterPath.isEmpty && rec.frame == posterFrameIdx {
        if let cgImg = ctx.makeImage() {
            let rep = NSBitmapImageRep(cgImage: cgImg)
            if let pngData = rep.representation(using: .png, properties: [:]) {
                try? pngData.write(to: URL(fileURLWithPath: posterPath))
            }
        }
    }

    // Stream raw RGBA frame bytes to stdout (ffmpeg stdin).
    pixelBuffer.withUnsafeBytes { rawBuf in
        if let base = rawBuf.baseAddress {
            stdoutHandle.write(Data(bytesNoCopy: UnsafeMutableRawPointer(mutating: base), count: rawBuf.count, deallocator: .none))
        }
    }
}
