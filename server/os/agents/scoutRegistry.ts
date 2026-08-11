// ─────────────────────────────────────────────────────────────────────────────
//  PS-SCOUT-LANDSCAPE-01 — landscape / regulatory intelligence, from a FIXED source registry.
//
//  Scout is the highest fabrication-risk agent: a model asked "is a cyber-insurance phishing-sim
//  mandate coming?" will always produce a confident answer, and that answer would become a claim we
//  make to a prospect. An invented regulatory mandate is a lie a knowledgeable MSP catches instantly.
//
//  THE GUARDS ARE STRUCTURAL, NOT PROMPTED
//    1. ALLOWLIST ONLY. Scout fetches URLs from SOURCE_REGISTRY and nothing else. There is no open
//       web search anywhere in this module — a source not in the registry cannot be read, so a claim
//       from outside it cannot be made. (Grep this file for a search API: there is none.)
//    2. SOURCE + DATE + VERBATIM QUOTE, or UNVERIFIED. A finding is credited as fact only if its
//       quote appears VERBATIM on the fetched page (the same substring check competitorIntel.ts uses
//       for prices). No quote on the page -> verified:false -> may not enter positioning or Janet's
//       brief as fact.
//    3. PROPOSAL, NEVER DOCTRINE. Every finding is intel for Kaan, cited and dated. Scout may NEVER
//       rewrite pricing, brand voice, honesty rules, or its own guardrails from an external claim —
//       PROTECTED_TOPICS are refused before extraction even runs.
//    4. NOT_CHECKED over an empty or failed fetch — never a fabricated trend, same as every agent.
//
//  Routing: llmComplete -> Cerebras free tier (cron-safe, ~30s/run, $0), same chain competitorIntel
//  uses. Local Ollama cannot serve a Vercel cron (confirmed).
// ─────────────────────────────────────────────────────────────────────────────

export type RegistrySource = {
  slug: string
  name: string
  url: string
  /** What this source is authoritative FOR — bounds what a finding from it may claim. */
  topic: 'regulatory' | 'framework' | 'insurance' | 'threat'
  /** Why it is trusted, recorded so the allowlist is auditable rather than arbitrary. */
  authority: string
}

/**
 * THE ALLOWLIST — TRACK 3 ONLY (regulatory / insurance / compliance). Fixed, primary/authoritative
 * sources, each reachability-probed 2026-08-04 (all return 200). Adding a source is a deliberate code
 * change reviewed here; nothing else is ever fetched. Tracks 1 (competitor) and 2 (buyer demand) are
 * NOT in this pass — Track 3's provenance is proven first.
 *
 * DELIBERATELY EXCLUDED, with reasons (not fetched-and-guessed):
 *   · Specific cyber-insurers' underwriting pages (Coalition, Chubb) — 404 / unstable / gated. NAIC,
 *     the insurance regulator body, is the stable authoritative INSURANCE source in their place.
 *   · HHS/HIPAA (hhs.gov) — 403s a server fetch, so a finding could carry no verifiable on-page
 *     quote. Out until a fetchable HIPAA source exists. (NIST/PCI cover overlapping control ground.)
 *   · G2 / Capterra (buyer-demand review sites) — 403; that is Track 2, and blocked regardless.
 */
export const SOURCE_REGISTRY: readonly RegistrySource[] = [
  { slug: 'naic_cyber', name: 'NAIC Cybersecurity (CIPR)', url: 'https://content.naic.org/cipr-topics/cybersecurity',
    topic: 'insurance', authority: 'US insurance regulators body; author of the Insurance Data Security Model Law that shapes cyber underwriting' },
  { slug: 'pci_standards', name: 'PCI Security Standards', url: 'https://www.pcisecuritystandards.org/standards/',
    topic: 'framework', authority: 'PCI SSC; card-industry compliance standard binding on any org handling card data' },
  { slug: 'nist_csf', name: 'NIST Cybersecurity Framework', url: 'https://www.nist.gov/cyberframework',
    topic: 'framework', authority: 'US federal standards body; the CSF is cited by carriers and auditors' },
  { slug: 'ncsc_cyber_essentials', name: 'UK NCSC Cyber Essentials', url: 'https://www.ncsc.gov.uk/cyberessentials/overview',
    topic: 'regulatory', authority: 'UK national cyber authority; Cyber Essentials is a procurement mandate' },
  { slug: 'cis_controls', name: 'CIS Critical Security Controls', url: 'https://www.cisecurity.org/controls',
    topic: 'framework', authority: 'widely-referenced control set; awareness training is a named control' },
  { slug: 'ftc_data_security', name: 'FTC Data Security Guidance', url: 'https://www.ftc.gov/business-guidance/privacy-security/data-security',
    topic: 'regulatory', authority: 'US regulator; enforcement guidance that shapes obligations' },
] as const

/**
 * Topics Scout may NEVER adopt from an external source, at any confidence. An external claim about
 * any of these is refused before extraction — it is not intel, it is our constitution. Matches the
 * reflection loop's PROTECTED_DIMENSIONS: evidence is the wrong currency for these.
 */
export const PROTECTED_TOPICS = ['pricing', 'price', 'discount', 'brand_voice', 'tone', 'honesty', 'guardrail', 'safety'] as const

export type ScoutFinding = {
  sourceSlug: string
  sourceName: string
  sourceUrl: string
  /** ISO date the source page states or was captured — provenance travels with the claim. */
  sourceDate: string | null
  /** The proposed intel, in Scout's words. */
  claim: string
  /** The VERBATIM text from the page that supports it. Empty => the claim is unverifiable. */
  quote: string
  /** True ONLY when quote is non-empty AND appears verbatim in the fetched page text. */
  verified: boolean
  topic: RegistrySource['topic']
}

/** Strip a fetched page to comparable text — the quote check runs against THIS. */
export function normaliseText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * THE PROVENANCE GATE. A finding is verified ONLY if its quote genuinely appears on the page.
 * A model can invent a claim; it cannot invent a quote that survives this check against the real
 * fetched text. An empty quote, or a quote not on the page, is verified:false — dropped from fact.
 */
export function verifyFinding(pageText: string, quote: string): boolean {
  const q = (quote ?? '').trim()
  if (q.length < 12) return false // too short to be a real citation
  const norm = normaliseText(pageText).toLowerCase()
  return norm.includes(q.toLowerCase())
}

/** A topic Scout is forbidden to adopt from outside. Checked before extraction. */
export function isProtectedTopic(text: string): boolean {
  const t = (text || '').toLowerCase()
  return (PROTECTED_TOPICS as readonly string[]).some((p) => t.includes(p))
}

/** Only registry members are fetchable. Anything else is refused — the structural allowlist. */
export function isRegistrySource(url: string): boolean {
  return SOURCE_REGISTRY.some((s) => s.url === url)
}
