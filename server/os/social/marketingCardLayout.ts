export type MarketingCardLayout = {
  mockupTop: number
  mockupHeight: number
  headlineStartY: number
  headlineSize: number
  subheadlineSize: number
  featureRowY: number
}

export const DEFAULT_CARD_LAYOUT: MarketingCardLayout = {
  mockupTop: 56,
  mockupHeight: 560,
  headlineStartY: 640,
  headlineSize: 34,
  subheadlineSize: 28,
  featureRowY: 980,
}

/** Full-bleed layout — mockup + copy fill the frame, minimal empty margins. */
export const DENSE_CARD_LAYOUT: MarketingCardLayout = {
  mockupTop: 28,
  mockupHeight: 640,
  headlineStartY: 688,
  headlineSize: 36,
  subheadlineSize: 26,
  featureRowY: 1020,
}

/** Map founder image feedback → layout tweaks for the marketing SVG. */
export function layoutFromFounderFeedback(comment: string): Partial<MarketingCardLayout> {
  const c = comment.toLowerCase()
  const hints: Partial<MarketingCardLayout> = {}

  if (/too high|crossing|overlap|sit.*better|realign|above box/i.test(c)) {
    hints.headlineStartY = 540
  }
  if (/bigger|larger/i.test(c) && /subheadline|tag|audit trail|spreadsheet|automate/i.test(c)) {
    hints.subheadlineSize = 28
  }
  if (/worst|first post|professional|reference|stock photo|wireframe/i.test(c)) {
    return {}
  }
  if (/too much black|empty|whitespace|empty place|no images|empty space/i.test(c)) {
    hints.mockupTop = 24
    hints.mockupHeight = 660
    hints.headlineStartY = 700
    hints.featureRowY = 1045
  }

  return hints
}

export function mergeCardLayout(partial?: Partial<MarketingCardLayout>): MarketingCardLayout {
  return { ...DEFAULT_CARD_LAYOUT, ...partial }
}
