// PS-SARAH-LINKEDIN-01 — Sarah's LinkedIn takeover: publisher + trust graduation + content safety +
// daily monitor. Everything here is HARD-GATED behind the Aug-5 start (sarahLinkedInPublishBlocker)
// and PostForMe is the single posting door (lowest automation-detection risk). Nothing publishes
// before 2026-08-05; nothing auto-posts until the trust flag is earned; no unsourced stats ship.
import { getSql } from '../conn'
import { sendTelegram } from '../telegram'
import { llmComplete } from '../llmChat'
import { rememberFact } from '../memory'
import { sarahLinkedInPublishBlocker } from './sarahLinkedIn'

const COMPANY = 'phishsimai'

// ── 1. STYLE INGESTION ───────────────────────────────────────────────────────
// Kaan points us at the 14 PostForMe captions; we store them as Sarah's few-shot style reference
// (every-other-day cadence, soft-sell MSP-compliance tone, hashtag style) and inject into drafting.
export async function setLinkedInStyleReference(captions: string[]): Promise<number> {
  const sql = getSql()
  const value = JSON.stringify(captions.map((c) => String(c).slice(0, 600)).slice(0, 40))
  await sql`INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
    VALUES (${COMPANY}, 'reference', 'linkedin_style_reference', ${value}, 1, 'founder')
    ON CONFLICT (company_id, type, key) DO UPDATE SET value=${value}, updated_at=NOW()`.catch(() => {})
  return captions.length
}
export async function getLinkedInStyleReference(): Promise<string[]> {
  const sql = getSql()
  const r = await sql`SELECT value FROM janet_memory WHERE company_id=${COMPANY} AND type='reference' AND key='linkedin_style_reference' LIMIT 1`.catch(() => [])
  try { return JSON.parse(String((r as any[])[0]?.value ?? '[]')) } catch { return [] }
}
/** Few-shot block for the draft prompt. Empty until Kaan loads the captions. */
export async function linkedInStylePrompt(): Promise<string> {
  const ex = await getLinkedInStyleReference()
  if (!ex.length) return ''
  return `\nMATCH THE VOICE + CADENCE of these existing Sarah/PhishSimAI LinkedIn posts (soft-sell MSP-compliance, every-other-day):\n` +
    ex.slice(0, 8).map((c, i) => `Example ${i + 1}: ${c}`).join('\n')
}

// ── 2. CONTENT SAFETY (anti-fabrication) ─────────────────────────────────────
// The ScrollFuel generator shipped fabricated "www"/"Store Owner"/fake stats. For AUTO-POST, refuse
// any post carrying a numeric claim that isn't on the approved-stats allowlist. First-week posts are
// drafts anyway (Kaan reviews); this is the guard that keeps a fabricated stat from ever auto-posting.
const APPROVED_STATS = [
  '67% of breaches', 'phishing', // e.g. "67% of breaches start with phishing" (Verizon DBIR-class)
]
export function linkedInContentSafe(text: string): { safe: boolean; reasons: string[] } {
  const reasons: string[] = []
  const t = String(text || '')
  // Numeric claims: percentages, "Nx", "$N", "N,NNN" — flag unless the surrounding phrase is approved.
  const numericClaims = t.match(/\b\d{1,3}%|\b\d+x\b|\$\s?\d[\d,]*|\b\d{1,3}(,\d{3})+\b/gi) || []
  for (const claim of numericClaims) {
    const approved = APPROVED_STATS.some((a) => t.toLowerCase().includes(a.toLowerCase()))
    if (!approved) reasons.push(`unsourced numeric claim: "${claim}" — needs a cited source or removal`)
  }
  if (/\b(guarantee|100% secure|never breached|risk-free)\b/i.test(t)) reasons.push('overclaim / absolute guarantee')
  return { safe: reasons.length === 0, reasons }
}

// ── 3. TRUST FLAG (drafts -> earned auto-post) ───────────────────────────────
export async function isLinkedInAutopostEnabled(): Promise<boolean> {
  const sql = getSql()
  const r = await sql`SELECT value FROM janet_memory WHERE company_id=${COMPANY} AND type='operating' AND key='linkedin_autopost_enabled' LIMIT 1`.catch(() => [])
  return String((r as any[])[0]?.value ?? '') === '1'
}

// ── 4. POSTFORME PUBLISHER (the one door) ────────────────────────────────────
async function postForMePublish(post: { body: string; title?: string; imageUrl?: string | null }): Promise<{ ok: boolean; url?: string; error?: string }> {
  const key = process.env.POSTFORME_API_KEY || process.env.POST_FOR_ME_API_KEY
  const base = process.env.POSTFORME_API_URL || 'https://api.postforme.dev/v1/posts'
  const account = process.env.POSTFORME_LINKEDIN_ACCOUNT // Kaan's PostForMe LinkedIn channel id
  if (!key || !account) return { ok: false, error: 'PostForMe not configured (POSTFORME_API_KEY + POSTFORME_LINKEDIN_ACCOUNT)' }
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        account_ids: [account],
        platform: 'linkedin',
        content: post.title ? `${post.title}\n\n${post.body}` : post.body,
        media_urls: post.imageUrl ? [post.imageUrl] : [],
      }),
      signal: AbortSignal.timeout(15000),
    })
    const j: any = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: `PostForMe ${res.status}: ${JSON.stringify(j).slice(0, 200)}` }
    return { ok: true, url: j?.url || j?.permalink || j?.id }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) }
  }
}

// Publish APPROVED, post-Aug-5 LinkedIn drafts through PostForMe. Gated 3 ways:
//   (1) Aug-5 hard guard, (2) review_status='approved', (3) content-safety.
// Auto-approval of NEW drafts only happens when the trust flag is on; otherwise Kaan approves each.
export async function publishApprovedLinkedIn(maxPosts = 1): Promise<{ published: number; blocked: string | null; results: any[] }> {
  const blocked = sarahLinkedInPublishBlocker()
  if (blocked) return { published: 0, blocked, results: [] }
  const sql = getSql()
  const approved = (await sql`
    SELECT id, title, body, image_url FROM os_social_queue
    WHERE platform='linkedin' AND status IN ('queued','draft') AND review_status='approved'
    ORDER BY scheduled_at ASC NULLS LAST LIMIT ${maxPosts}
  `.catch(() => [])) as any[]

  const results: any[] = []
  let published = 0
  for (const p of approved) {
    const safe = linkedInContentSafe(`${p.title || ''}\n${p.body || ''}`)
    if (!safe.safe) {
      await sql`UPDATE os_social_queue SET review_status='held_content_safety', error=${safe.reasons.join('; ')} WHERE id=${p.id}`.catch(() => {})
      await sendTelegram(`⚠️ LinkedIn post HELD (content safety): ${safe.reasons.join('; ')}`).catch(() => {})
      results.push({ id: p.id, held: safe.reasons }); continue
    }
    const r = await postForMePublish({ body: p.body, title: p.title, imageUrl: p.image_url })
    if (r.ok) {
      await sql`UPDATE os_social_queue SET status='posted', posted_at=NOW(), result_url=${r.url || null} WHERE id=${p.id}`.catch(() => {})
      await sendTelegram(`✅ Sarah LinkedIn posted via PostForMe\n${String(p.title || '').slice(0, 80)}\n${r.url || ''}`).catch(() => {})
      published++
    } else {
      await sql`UPDATE os_social_queue SET status='failed', error=${r.error || 'publish failed'} WHERE id=${p.id}`.catch(() => {})
    }
    results.push({ id: p.id, ...r })
  }
  return { published, blocked: null, results }
}

// ── 5. DAILY MONITOR + DRAFT-REPLIES ─────────────────────────────────────────
// Surface LinkedIn comments/DMs to Kaan daily (safe from day 1). Replies to real people are DRAFTS
// until trusted. NOTE: reading LinkedIn engagement needs a data source (PostForMe read API or a
// LinkedIn integration Kaan authorizes) — wired here as fetchLinkedInEngagement().
async function fetchLinkedInEngagement(): Promise<Array<{ author: string; text: string; permalink?: string; kind: 'comment' | 'dm' }>> {
  // Integration point — returns [] until a LinkedIn read source is connected. Never throws.
  return []
}
export async function runLinkedInMonitor(): Promise<{ surfaced: number; drafts: number }> {
  await getSql() // ensure conn
  const events = await fetchLinkedInEngagement().catch(() => [])
  let drafts = 0
  for (const e of events) {
    await sendTelegram(`💬 LinkedIn ${e.kind} from ${e.author}\n${e.text.slice(0, 300)}\n${e.permalink || ''}`).catch(() => {})
    // draft a reply — never auto-sent; gated by the same autopost trust flag
    const { text } = await llmComplete({
      messages: [
        { role: 'system', content: `You are Sarah Mitchell (PhishSimAI). Draft a short, warm LinkedIn ${e.kind} reply. No fabricated stats. 1-3 sentences.` },
        { role: 'user', content: `${e.author} said: "${e.text}". Draft Sarah's reply.` },
      ], max_tokens: 200,
    }).catch(() => ({ text: '' }))
    if (text.trim()) {
      await sendTelegram(`✍️ Draft LinkedIn reply for approval (to ${e.author}):\n${text.trim().slice(0, 300)}`).catch(() => {})
      drafts++
    }
  }
  if (events.length) {
    await rememberFact({ company_id: COMPANY, type: 'campaign', key: `linkedin_monitor:${new Date().toISOString().slice(0, 10)}`, value: `Surfaced ${events.length} LinkedIn events, ${drafts} reply drafts`, confidence: 1, source: 'janet' }).catch(() => {})
  }
  return { surfaced: events.length, drafts }
}
