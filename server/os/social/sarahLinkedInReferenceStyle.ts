/**
 * Match Sarah's first LinkedIn post — photorealistic reference base + topic headline overlay.
 * No stock photos, no flat wireframe mockups.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import sharp from 'sharp'
import type { SarahMarketingImageSpec } from './sarahLinkedInImage'
import { svgText, svgTextBlock } from './svgTextPaths'

export const REFERENCE_PUBLIC_URL = 'https://phishsimai.com/brand/sarah-linkedin-reference-v2.png'

const REF_CANDIDATES = [
  join(process.cwd(), 'client/public/brand/sarah-linkedin-reference-v2.png'),
  join(process.cwd(), 'server/os/social/assets/sarah-linkedin-reference-v2.png'),
]

function resolveReferencePath(): string {
  for (const p of REF_CANDIDATES) {
    if (existsSync(p)) return p
  }
  throw new Error('Sarah LinkedIn reference PNG missing')
}

function wrap(text: string, maxLen: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (next.length > maxLen && line) {
      lines.push(line)
      line = w
    } else line = next
  }
  if (line) lines.push(line)
  return lines.slice(0, 2)
}

function featureLabel(raw: string): string {
  return raw.trim().split(/\s*—\s*/)[0].split(/\s+-\s+/)[0].trim().slice(0, 28)
}

/** Bottom text band — covers reference headline area with updated copy. */
function renderTextOverlaySvg(spec: SarahMarketingImageSpec, width: number, height: number): Buffer {
  const headlineLines = wrap(spec.headline, 36)
  const subLines = wrap(spec.subheadline, 48)
  const features = (spec.features.length ? spec.features : ['Realistic Simulations', 'Reduce Risk', 'Prove Compliance', 'MSP Ready']).slice(0, 4)
  const colW = width / 4

  const headlineY = 88
  const headlineSvg = svgTextBlock(headlineLines, width / 2, headlineY, 40, {
    size: 34,
    weight: 700,
    anchor: 'middle',
    fill: '#ffffff',
  })

  const subY = headlineY + headlineLines.length * 40 + 24
  const subSvg = svgTextBlock(subLines, width / 2, subY, 26, {
    size: 20,
    weight: 500,
    anchor: 'middle',
    fill: '#94a3b8',
  })

  const featureY = height - 36
  const featureSvg = features
    .map((f, i) => {
      const cx = colW * i + colW / 2
      const label = featureLabel(f)
      return `${svgText(label, cx, featureY, { size: 13, weight: 600, anchor: 'middle', fill: '#f87171' })}
  <circle cx="${cx}" cy="${featureY - 28}" r="12" fill="#1f2937" stroke="#e53e3e" stroke-width="1.5"/>`
    })
    .join('\n')

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a0a0f" stop-opacity="0.92"/>
      <stop offset="12%" stop-color="#0a0a0f" stop-opacity="1"/>
      <stop offset="100%" stop-color="#0a0a0f" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#band)"/>
  ${headlineSvg}
  ${subSvg}
  ${featureSvg}
</svg>`
  return Buffer.from(svg, 'utf-8')
}

/** 1200×800 PNG — reference laptop render + SOC2 (or topic) headline band. */
export async function renderSarahReferenceStylePng(spec: SarahMarketingImageSpec): Promise<Buffer> {
  const refBuf = readFileSync(resolveReferencePath())
  const W = 1200
  const H = 800
  const overlayH = 300

  const base = await sharp(refBuf).resize(W, H, { fit: 'cover', position: 'top' }).png().toBuffer()
  const overlaySvg = renderTextOverlaySvg(spec, W, overlayH)
  const overlayPng = await sharp(overlaySvg).png().toBuffer()

  return sharp(base)
    .composite([{ input: overlayPng, top: H - overlayH, left: 0 }])
    .png({ quality: 95, compressionLevel: 6 })
    .toBuffer()
}
