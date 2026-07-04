/**
 * Raster export — reference-style or full SVG card (no stock photos).
 */
import sharp from 'sharp'
import type { SarahMarketingImageSpec } from './sarahLinkedInImage'
import { renderSarahMarketingCardSvg } from './sarahMarketingCardSvg'
import { DEFAULT_CARD_LAYOUT, mergeCardLayout, type MarketingCardLayout } from './marketingCardLayout'
import { renderSarahReferenceStylePng } from './sarahLinkedInReferenceStyle'

/** First-post reference template — preferred programmatic fallback. */
export async function renderSarahMarketingRasterPng(
  spec: SarahMarketingImageSpec,
  _topic = '',
  _layoutPartial?: Partial<MarketingCardLayout>
): Promise<Buffer> {
  return renderSarahReferenceStylePng(spec)
}

/** Full SVG card → PNG (last-resort if reference asset missing). */
export async function renderSarahMarketingSvgPng(
  spec: SarahMarketingImageSpec,
  topic = '',
  layoutPartial?: Partial<MarketingCardLayout>
): Promise<Buffer> {
  const layout = mergeCardLayout({ ...DEFAULT_CARD_LAYOUT, ...layoutPartial })
  const svg = renderSarahMarketingCardSvg(spec, topic, layout, 'full')
  return sharp(svg).resize(1200, 800, { fit: 'contain', background: '#0a0a0f' }).png({ quality: 95 }).toBuffer()
}
