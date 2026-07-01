import type { SarahMarketingImageSpec } from './sarahLinkedInImage'
import { mergeCardLayout, DEFAULT_CARD_LAYOUT, type MarketingCardLayout } from './marketingCardLayout'
import { svgText, svgTextBlock } from './svgTextPaths'

export type MarketingCardRenderMode = 'full' | 'overlay'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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

function complianceFocus(topic: string, headline: string): string {
  const src = `${topic} ${headline}`.toUpperCase()
  if (src.includes('HIPAA')) return 'HIPAA'
  if (src.includes('PCI')) return 'PCI DSS'
  if (src.includes('CMMC')) return 'CMMC'
  if (src.includes('SOC')) return 'SOC 2'
  return 'SOC 2'
}

function featureLabel(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  const title = s.split(/\s*—\s*/)[0].split(/\s+-\s+/)[0].trim()
  return title.slice(0, 24)
}

function renderFeatureFooter(features: string[], rowY: number): string {
  const cols = features.slice(0, 4)
  const colWidth = 1080 / cols.length
  return cols
    .map((f, i) => {
      const cx = colWidth * i + colWidth / 2
      const label = esc(featureLabel(f))
      return svgText(label, cx, rowY, { size: 14, weight: 600, anchor: 'middle', fill: '#f87171' })
    })
    .join('\n')
}

/** Topic-specific marketing card — UI mockup; overlay mode keeps photo visible underneath. */
export function renderSarahMarketingCardSvg(
  spec: SarahMarketingImageSpec,
  topic = '',
  layoutPartial?: Partial<MarketingCardLayout>,
  mode: MarketingCardRenderMode = 'full'
): Buffer {
  const layout = mergeCardLayout({ ...DEFAULT_CARD_LAYOUT, ...layoutPartial })
  const headlineLines = wrap(spec.headline, 34)
  const subLines = wrap(spec.subheadline, 44)
  const focus = complianceFocus(topic, spec.headline)
  const features = (spec.features.length ? spec.features : ['Realistic Simulations', 'Reduce Risk', 'Prove Compliance', 'MSP Ready']).slice(0, 4)

  const mockBottom = layout.mockupTop + layout.mockupHeight
  const innerTop = layout.mockupTop + 20
  const innerH = layout.mockupHeight - 40
  const splitX = 540
  const headlineY = Math.max(layout.headlineStartY, mockBottom + 48)

  const headlineSvg = svgTextBlock(headlineLines, 540, headlineY, layout.headlineSize + 10, {
    size: layout.headlineSize,
    weight: 700,
    anchor: 'middle',
    fill: '#ffffff',
  })

  const subY = headlineY + headlineLines.length * (layout.headlineSize + 10) + 28
  const subSvg = svgTextBlock(subLines, 540, subY, layout.subheadlineSize + 8, {
    size: layout.subheadlineSize,
    weight: 500,
    anchor: 'middle',
    fill: '#cbd5e1',
  })

  const featureSvg = renderFeatureFooter(features, layout.featureRowY)

  const bgLayer =
    mode === 'overlay'
      ? ''
      : `<rect width="1080" height="1080" fill="url(#bg)"/>
  <rect x="0" y="620" width="1080" height="460" fill="#0a0a0f" opacity="0.92"/>`

  const mockupFill = mode === 'overlay' ? 'rgba(15,23,42,0.88)' : '#0f172a'

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a0f"/>
      <stop offset="100%" style="stop-color:#111827"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  ${bgLayer}

  ${svgText('PhishSim', 48, 48, { size: 32, weight: 700, fill: '#ffffff', stroke: '#000', strokeWidth: 2 })}
  ${svgText('AI', 238, 48, { size: 32, weight: 700, fill: '#e53e3e', stroke: '#000', strokeWidth: 2 })}
  ${svgText('BUILDING HUMAN FIREWALLS.', 48, 72, { size: 10, weight: 500, fill: '#e2e8f0', stroke: '#000', strokeWidth: 1 })}

  <rect x="60" y="${layout.mockupTop}" width="960" height="${layout.mockupHeight}" rx="16" fill="${mockupFill}" stroke="#334155" stroke-width="2"/>
  <rect x="120" y="${innerTop}" width="400" height="${innerH}" rx="8" fill="#1a0a0acc" stroke="#991b1b"/>
  <rect x="${splitX + 10}" y="${innerTop}" width="400" height="${innerH}" rx="8" fill="#0a1a12cc" stroke="#166534"/>
  <line x1="${splitX}" y1="${innerTop}" x2="${splitX}" y2="${mockBottom - 20}" stroke="#e53e3e" stroke-width="4" filter="url(#glow)"/>

  <rect x="145" y="${innerTop + 18}" width="110" height="18" rx="4" fill="#7f1d1d"/>
  ${svgText('EXTERNAL EMAIL', 200, innerTop + 31, { size: 10, weight: 700, anchor: 'middle', fill: '#fecaca' })}
  ${svgText('Urgent: Reset Password', 320, innerTop + 70, { size: 18, weight: 700, anchor: 'middle', fill: '#ffffff' })}
  <rect x="155" y="${innerTop + 88}" width="330" height="8" rx="2" fill="#374151"/>
  <rect x="155" y="${innerTop + 106}" width="270" height="8" rx="2" fill="#374151"/>
  <rect x="155" y="${innerTop + 124}" width="300" height="8" rx="2" fill="#374151"/>
  <rect x="235" y="${innerTop + innerH - 58}" width="170" height="38" rx="6" fill="#dc2626"/>
  ${svgText('Reset Password', 320, innerTop + innerH - 33, { size: 13, weight: 600, anchor: 'middle', fill: '#ffffff' })}

  ${svgText('Simulation Complete', 750, innerTop + 45, { size: 17, weight: 700, anchor: 'middle', fill: '#86efac' })}
  ${svgText('98%', 750, innerTop + 100, { size: 48, weight: 700, anchor: 'middle', fill: '#ffffff' })}
  ${svgText('Completion Rate', 750, innerTop + 128, { size: 12, weight: 400, anchor: 'middle', fill: '#94a3b8' })}
  <rect x="590" y="${innerTop + 145}" width="290" height="10" rx="5" fill="#1f2937"/>
  <rect x="590" y="${innerTop + 145}" width="284" height="10" rx="5" fill="#22c55e"/>
  ${svgText(focus, 610, innerTop + 180, { size: 11, weight: 600, fill: '#4ade80' })}
  ${svgText('HIPAA', 710, innerTop + 180, { size: 11, weight: 600, fill: '#4ade80' })}
  ${svgText('PCI DSS', 810, innerTop + 180, { size: 11, weight: 600, fill: '#4ade80' })}
  ${svgText('Risk Score: 12 (Low)', 750, innerTop + innerH - 40, { size: 13, weight: 400, anchor: 'middle', fill: '#64748b' })}

  ${headlineSvg}
  ${subSvg}
  ${featureSvg}
</svg>`
  return Buffer.from(svg, 'utf-8')
}
