// opentype.js ships no types (v2.0.0 has no `types` field and no .d.ts), so the
// ambient declaration in server/types/opentype-js.d.ts describes the surface we use.
// It exposes Path/parse on the default export but not Font, so `opentype.Font` in a
// TYPE position cannot resolve (TS2503). Import the types by name; the default
// import stays for the VALUES (opentype.parse, new opentype.Path()) — no runtime change.
import opentype from 'opentype.js'
import type { Font as OTFont, Path as OTPath } from 'opentype.js'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const FONT_FILES = {
  400: 'inter-latin-400-normal.woff',
  500: 'inter-latin-500-normal.woff',
  600: 'inter-latin-600-normal.woff',
  700: 'inter-latin-700-normal.woff',
} as const

type FontWeight = keyof typeof FONT_FILES

function fontDir(): string {
  const candidates = [
    join(process.cwd(), 'server/os/social/fonts'),
    join(process.cwd(), 'fonts'),
  ]
  for (const dir of candidates) {
    if (existsSync(join(dir, FONT_FILES[400]))) return dir
  }
  throw new Error('Inter fonts missing (server/os/social/fonts)')
}

const fontCache: Partial<Record<FontWeight, OTFont>> = {}

function loadFont(weight: FontWeight): OTFont {
  if (fontCache[weight]) return fontCache[weight]!
  const file = join(fontDir(), FONT_FILES[weight])
  fontCache[weight] = opentype.parse(readFileSync(file))
  return fontCache[weight]!
}

export type SvgTextOpts = {
  size: number
  weight?: FontWeight
  anchor?: 'start' | 'middle' | 'end'
  fill?: string
  stroke?: string
  strokeWidth?: number
}

function textPath(font: OTFont, text: string, x: number, y: number, size: number): OTPath {
  const path = new opentype.Path()
  let cursor = x
  for (const ch of text) {
    const glyph = font.charToGlyph(ch)
    path.extend(glyph.getPath(cursor, y, size))
    cursor += (glyph.advanceWidth / font.unitsPerEm) * size
  }
  return path
}

function anchorX(font: OTFont, text: string, x: number, size: number, anchor: SvgTextOpts['anchor']): number {
  if (anchor === 'start' || !anchor) return x
  const bb = textPath(font, text, 0, 0, size).getBoundingBox()
  const w = bb.x2 - bb.x1
  if (anchor === 'middle') return x - w / 2 - bb.x1
  return x - bb.x2
}

/** Render text as SVG paths — works with sharp/librsvg (no fontconfig needed). */
export function svgText(text: string, x: number, y: number, opts: SvgTextOpts): string {
  const font = loadFont(opts.weight || 400)
  const size = opts.size
  const startX = anchorX(font, text, x, size, opts.anchor)
  const path = textPath(font, text, startX, y, size)
  const d = path.toPathData(2)
  const fill = opts.fill || '#ffffff'
  if (opts.stroke) {
    const sw = opts.strokeWidth ?? 2
    return `<path d="${d}" fill="${fill}" stroke="${opts.stroke}" stroke-width="${sw}" paint-order="stroke"/>`
  }
  return `<path d="${d}" fill="${fill}"/>`
}

/** Multi-line centered text block; returns group of paths. */
export function svgTextBlock(
  lines: string[],
  x: number,
  startY: number,
  lineHeight: number,
  opts: SvgTextOpts
): string {
  return lines
    .map((line, i) => svgText(line, x, startY + i * lineHeight, { ...opts, anchor: opts.anchor || 'middle' }))
    .join('\n')
}
