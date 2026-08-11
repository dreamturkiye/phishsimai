// ─────────────────────────────────────────────────────────────────────────────
//  PS-MIA-HONEST-01 — Mia's actions, and the rule that her claims may not outrun them.
//
//  THE THREE FALSE CLAIMS THIS REPLACES
//    1. miaChat.ts:336 instructed her UNCONDITIONALLY to "thank them and say the team will review
//       it" — regardless of whether anything was written. "This is really annoying" matches no
//       feedback pattern, so no row was created, and she promised review anyway.
//    2. miaChat.ts:295-303 called recordProductFeedback and set feedbackRecorded = true WITHOUT
//       CHECKING THE RETURN. That function returns null when the DB is unavailable, so a failed
//       write still produced "You just logged their feedback — acknowledge that."
//    3. She fired on INTENT rather than CONTENT. The only row in production is
//       "can I give you suggestions tabout the product or report bugs" — a user ASKING WHETHER they
//       could give feedback, logged as feedback, acknowledged as logged. The real feedback, if it
//       followed, may have matched nothing.
//    And separately, she invented a "Talk to Sales" control that exists nowhere in the logged-in
//    app, and promised "someone will reach out shortly" when no code path notifies any human.
//
//  THE RULE, STATED ONCE
//    THE ACTION ALWAYS ATTEMPTS. THE CLAIM IS CONDITIONAL ON THE VERIFIED RESULT.
//    Every function here returns an explicit outcome — a row id, or a reason it failed. Nothing
//    returns a bare boolean, because a bare boolean is what let "true" mean "I called something".
//    The caller may not say "logged" unless it holds an id.
//
//  WHY NOT LLM TOOL-CALLING
//    The provider chain (Cerebras -> DeepInfra -> Ollama) has no tool-calling support; grep for
//    tools/tool_choice/function_call in llmChat.ts returns nothing. Adding it would pin Mia to one
//    provider. A deterministic code-side write is also STRICTLY more reliable here: the model
//    cannot forget to call it, cannot call it twice, and cannot call it with invented arguments.
//    The model's only job is to describe an outcome it is handed — never to decide whether one
//    occurred.
// ─────────────────────────────────────────────────────────────────────────────
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { organizations, productFeedback, users } from '../../drizzle/schema'
import { sendTelegram } from '../os/telegram'
import { resolveCallWindow, KAAN_TZ, type CallWindow } from './callWindow'
import { rememberFact } from '../os/memory'

export type FeedbackCategory = 'bug' | 'ux' | 'feature' | 'praise' | 'other'
export type HandoffKind = 'sales' | 'support' | 'callback' | 'other'

/**
 * Every action returns this. An id means it happened; a reason means it did not.
 *
 * `notified` and `reachable` are distinct outcomes of a handoff and must not be collapsed:
 * notified = a human was actually told; reachable = the notification carried an address that human
 * can answer. A handoff can be delivered and unanswerable, which is what PS-MIA-REACHABLE-01 fixes.
 */
export type ActionResult =
  | { ok: true; id: number; notified?: boolean; reachable?: boolean }
  | { ok: false; reason: string }

// ─── THE CONTENT GATE ────────────────────────────────────────────────────────

/**
 * Does this message CONTAIN feedback, or merely announce an intention to give some?
 *
 * The distinction is the whole of defect 3. "Can I give you suggestions about the product or report
 * bugs" is a question about the channel, not a report. Writing it produces a content-free row and,
 * worse, licenses Mia to say she logged something the user has not yet said.
 *
 * Returns 'intent_only' for those, so the caller writes NOTHING and Mia asks for the actual content.
 */
const FEEDBACK_SIGNAL =
  /\b(feedback|suggest(ion|ions)?|confus(ed|ing)|frustrat(ed|ing)|annoy(ed|ing)|bug|broken|error|crash|doesn'?t work|not working|improve(ment)?|wish|hard to|difficult|missing|feature request|report)\b/i

/**
 * Phrasings that ANNOUNCE an intent rather than deliver content. Deliberately anchored to the
 * question/permission shape ("can I", "how do I", "where do I", "I'd like to", "want to") followed
 * by a giving verb — that is what an intent-only message looks like, and it is narrow enough not to
 * swallow a real report that happens to contain "I want to".
 */
const INTENT_ONLY =
  // `(?:do|can|should|would)\s+` is required: "how DO i give feedback" and "where DO i report" are
  // the commonest phrasings and the first version missed both by demanding "how i".
  /\b(can|could|may|should|how|where|who)\s+(?:do|did|can|should|would|shall)?\s*(i|we)\b[^.?!]{0,60}\b(give|send|submit|report|share|leave|provide|make)\b|\bi(?:'d| would)?\s*(?:like|want|wish)\s+to\s+(give|send|submit|report|share|leave|provide|make)\b/i

/**
 * Generic CATEGORY nouns. Naming the kind of thing you intend to send is still not sending it —
 * "I'd like to submit a feature request" names a category and reports nothing. Stripped before the
 * substance check so the category word cannot masquerade as content.
 */
const CATEGORY_NOUN =
  /\b(feedback|suggestions?|bugs?|issues?|problems?|feature\s+requests?|features?|requests?|reports?|comments?|thoughts?|ideas?)\b/gi

/** A message with no substance beyond the announcement — too short to carry a real report. */
const MIN_CONTENT_CHARS = 12

export type ContentVerdict = 'content' | 'intent_only' | 'none'

export function classifyFeedbackContent(message: string): ContentVerdict {
  const m = (message ?? '').trim()
  if (m.length < MIN_CONTENT_CHARS) return 'none'
  if (!FEEDBACK_SIGNAL.test(m)) return 'none'

  if (INTENT_ONLY.test(m)) {
    // An intent phrase MAY precede real content in the same message:
    //   "I'd like to report a bug — the CSV import fails on files over 2MB"
    // Strip the announcement clause and see whether anything substantive survives.
    const remainder = m
      .replace(INTENT_ONLY, ' ')
      .replace(CATEGORY_NOUN, ' ')
      .replace(/\b(a|an|some|any|about|regarding|on|for|to|the|product|app|platform|you|your|please)\b/gi, ' ')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    // What survives must be a SPECIFIC observation, not a restated category.
    return remainder.length >= 15 ? 'content' : 'intent_only'
  }
  return 'content'
}

export function inferFeedbackCategory(message: string): FeedbackCategory {
  const m = message.toLowerCase()
  if (/\b(bug|broken|error|crash|doesn'?t work|not working)\b/.test(m)) return 'bug'
  // \b after a PREFIX never matches: "confus" is followed by "i" in "confusing", so there is no
  // word boundary and the alternative can never fire. The original inference carried this bug, so
  // every "this is confusing" / "frustrating" / "annoying" has been landing in `other` since launch.
  // Caught by a test asserting the obvious case.
  if (/\b(confus\w*|hard to|difficult|unclear|frustrat\w*|annoy\w*|ux|ui)\b/.test(m)) return 'ux'
  if (/\b(feature|wish|would be nice|add |missing|need )\b/.test(m)) return 'feature'
  if (/\b(love|great|awesome|thanks|helpful|perfect)\b/.test(m)) return 'praise'
  return 'other'
}

// ─── HUMAN HANDOFF DETECTION ─────────────────────────────────────────────────

/**
 * Is the user asking for a HUMAN? Distinct from feedback: feedback is information flowing to us, a
 * handoff is a person being requested. They need different actions and different honest sentences.
 */
const HANDOFF_SIGNAL =
  /\b(talk|speak|chat)\s+(to|with)\s+(a\s+)?(human|person|someone|sales|support|rep|agent|team)\b|\b(contact|call|phone|email)\s+(me|us)\b|\b(sales|account manager|human support|real person)\b|\bcall\s?back\b|\bschedule\s+(a\s+)?(call|demo|meeting)\b/i

export function detectHandoffRequest(message: string): HandoffKind | null {
  const m = (message ?? '').trim()
  if (!HANDOFF_SIGNAL.test(m)) return null
  if (/\bsales\b|\bpricing\b|\bquote\b|\bdemo\b|\bupgrade\b|\benterprise\b/i.test(m)) return 'sales'
  if (/\bcall\s?back\b|\bcall me\b|\bphone\b|\bschedule\b/i.test(m)) return 'callback'
  if (/\bsupport\b|\bhelp\b|\bissue\b|\bproblem\b/i.test(m)) return 'support'
  return 'other'
}

// ─── ACTION 1: RECORD FEEDBACK ───────────────────────────────────────────────

async function orgContext(db: any, orgId: number) {
  const rows = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1)
  const org = rows[0]
  const createdAt = org?.createdAt
  return {
    name: org?.name ?? `Org #${orgId}`,
    plan: org?.plan ?? 'free',
    trialDay: createdAt ? Math.max(1, Math.ceil((Date.now() - new Date(createdAt).getTime()) / 86_400_000)) : null,
  }
}

/**
 * Write the feedback. Returns the row id, or an explicit reason it failed.
 *
 * Never throws for an expected failure — the caller needs the reason in order to have Mia say the
 * honest thing, and an exception would just produce a generic error to the user instead.
 */
export async function recordFeedbackVerified(opts: {
  userId: number
  orgId: number
  message: string
  conversationContext?: string
  pathname?: string
  category?: FeedbackCategory
  rating?: number
  source?: string
}): Promise<ActionResult> {
  let db: any
  try {
    db = await getDb()
  } catch (e: any) {
    return { ok: false, reason: `database unavailable (${String(e?.message || e).slice(0, 80)})` }
  }
  if (!db) return { ok: false, reason: 'database unavailable' }

  try {
    const ctx = await orgContext(db, opts.orgId)
    const category = opts.category ?? inferFeedbackCategory(opts.message)

    const inserted = await db.insert(productFeedback).values({
      userId: opts.userId,
      orgId: opts.orgId,
      page: opts.pathname?.slice(0, 255) ?? null,
      message: opts.message.slice(0, 4000),
      conversationContext: opts.conversationContext?.slice(0, 4000) ?? null,
      category,
      rating: opts.rating ?? null,
      plan: ctx.plan,
      trialDay: ctx.trialDay,
      source: opts.source ?? 'mia',
    }).returning({ id: productFeedback.id })

    const id = inserted[0]?.id
    // THE GATE. No id means no verified row, whatever the insert appeared to do.
    if (typeof id !== 'number') return { ok: false, reason: 'insert returned no row id' }

    await sendTelegram(
      `💬 <b>Trial ${category}</b> — ${ctx.name} · ${ctx.plan}${ctx.trialDay ? ` · day ${ctx.trialDay}` : ''}\n` +
      `Page: ${opts.pathname || 'n/a'}\n${opts.message.slice(0, 500)}`,
    ).catch(() => {})

    await rememberFact({
      company_id: 'phishsimai', type: 'operating', key: `trial_feedback_${id}`,
      value: `[${category}] ${ctx.name}: ${opts.message.slice(0, 200)}`,
      confidence: 0.9, source: 'mia_feedback',
    }).catch(() => {})

    return { ok: true, id }
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e).slice(0, 120) }
  }
}

// ─── ACTION 2: REQUEST A HUMAN ───────────────────────────────────────────────

/**
 * Record a request for a human AND tell one.
 *
 * `notified` is only true when the Telegram send actually resolved. Mia may promise contact only on
 * ok && notified — because a row nobody was told about is not a callback, it is a queue entry the
 * customer does not know is invisible.
 */
export type HandoffContact = {
  firstName?: string
  lastName?: string
  phone?: string
  /**
   * PS-MIA-REACHABLE-01. Supplied by the contact form ONLY, for the case where a customer wants a
   * reply somewhere other than their account address. It is not required and must not be solicited
   * from a logged-in user by default — see resolveAccountEmail below.
   */
  email?: string
  preferredContact?: 'call' | 'email' | 'either'
  /** What they typed: "9am", "after 3", "mornings". */
  bestTimeRaw?: string
  /** IANA zone from the browser, user-correctable. */
  timezone?: string
}

/**
 * PS-MIA-REACHABLE-01 — the address a human can actually reply to.
 *
 * Resolved HERE, at the single write point, rather than threaded in from each caller. There are two
 * live callers (`server/routers.ts` tRPC and `server/mia/http.ts` express) and any threading change
 * that updates one and forgets the other reproduces the composition failure exactly: the call is
 * fixed, the payload is not. A handoff row cannot be written without passing through this function,
 * so it cannot be written without the address when one exists.
 *
 * Returns null when there is genuinely nothing on file — `users.email` is nullable. Null is
 * reported in words; it is never defaulted, guessed from the org, or filled with a placeholder.
 */
export async function resolveAccountEmail(db: any, userId: number): Promise<string | null> {
  try {
    const rows = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1)
    const e = rows?.[0]?.email
    return typeof e === 'string' && e.includes('@') ? e.trim() : null
  } catch {
    // A lookup failure is NOT an absent address, but from the notification's point of view it has
    // the same consequence: nothing to reply to. Report it as missing rather than inventing one.
    return null
  }
}

/**
 * The Telegram body for a handoff, as a pure function of the facts.
 *
 * Extracted so the thing that actually reaches Kaan's phone can be asserted directly, without a
 * database and without a live send. The defect this fixes was invisible to every test precisely
 * because the message body was built inline inside an I/O function and never inspected.
 */
export function buildHandoffTelegram(a: {
  kind: HandoffKind
  orgName: string
  plan: string
  trialDay?: number | null
  email: string | null
  firstName?: string
  lastName?: string
  phone?: string
  preferredContact?: string
  callWindowDisplay: string
  pathname?: string
  id: number
  message: string
}): string {
  const who = [a.firstName, a.lastName].filter(Boolean).join(' ')
  return (
    `🙋 <b>CUSTOMER WANTS A HUMAN</b> (${a.kind})\n` +
    `${a.orgName} · plan ${a.plan}${a.trialDay ? ` · trial day ${a.trialDay}` : ''}\n` +
    // THE REPLY-TO LINE. First, because it is the one field that decides whether this notification
    // can result in anything. A handoff without it is a person waiting on a promise nobody can keep.
    (a.email
      ? `Email: ${a.email}\n`
      : `⚠️ NO CONTACT EMAIL ON FILE — cannot reply. Reach them in-app.\n`) +
    (who ? `Name: ${who}\n` : '') +
    (a.phone ? `Phone: ${a.phone}\n` : '') +
    (a.preferredContact ? `Prefers: ${a.preferredContact}\n` : '') +
    // BOTH zones, always — this is the line that stops a 9am Pacific call at 6am.
    `Call window: ${a.callWindowDisplay}\n` +
    `Page: ${a.pathname || 'n/a'} · request #${a.id}\n\n` +
    `"${a.message.slice(0, 500)}"\n\n` +
    `They are waiting. Nothing else contacts them.`
  )
}

export async function requestHumanHandoff(opts: {
  userId: number
  orgId: number
  kind: HandoffKind
  message: string
  conversationContext?: string
  pathname?: string
  contact?: HandoffContact
}): Promise<ActionResult> {
  let db: any
  try {
    db = await getDb()
  } catch (e: any) {
    return { ok: false, reason: `database unavailable (${String(e?.message || e).slice(0, 80)})` }
  }
  if (!db) return { ok: false, reason: 'database unavailable' }

  try {
    const ctx = await orgContext(db, opts.orgId)

    const c = opts.contact ?? {}
    // Resolve the window at CAPTURE time, in the customer's zone. Storing a bare "9am" would be a
    // correct record that produces a wrong action.
    const win: CallWindow = resolveCallWindow(c.bestTimeRaw ?? '', c.timezone ?? null)

    // PS-MIA-REACHABLE-01. Form-supplied address wins if the customer gave one (they may want a
    // reply elsewhere); otherwise the account address we have held since signup. A logged-in
    // customer is never asked for an email we already stored.
    const formEmail = typeof c.email === 'string' && c.email.includes('@') ? c.email.trim() : null
    const email = formEmail ?? (await resolveAccountEmail(db, opts.userId))

    const rows = await db.execute(sql`
      INSERT INTO mia_handoff_requests
        ("userId","orgId",kind,message,"conversationContext",page,plan,
         "firstName","lastName",email,phone,"preferredContact","bestTimeRaw",timezone,
         "callWindowAt","callWindowDisplay")
      VALUES (${opts.userId}, ${opts.orgId}, ${opts.kind}, ${opts.message.slice(0, 2000)},
              ${opts.conversationContext?.slice(0, 4000) ?? null}, ${opts.pathname?.slice(0, 255) ?? null}, ${ctx.plan},
              ${c.firstName ?? null}, ${c.lastName ?? null}, ${email}, ${c.phone ?? null},
              ${c.preferredContact ?? null}, ${win.raw || null}, ${win.timezone ?? null},
              ${win.iso ?? null}, ${win.display})
      RETURNING id`)

    const id: number | undefined = (rows as any)?.rows?.[0]?.id ?? (rows as any)?.[0]?.id
    if (typeof id !== 'number') return { ok: false, reason: 'insert returned no row id' }

    // Telling a human is the part that makes a callback promise true. Its success is tracked
    // separately from the row, because they fail independently.
    // THE BUG I SHIPPED INTO THE FIX FOR THIS EXACT BUG.
    // sendTelegram does NOT throw when unconfigured or refused — it RESOLVES with
    // { ok:false, skipped:true } (telegram.ts:186). Catching only a throw therefore set
    // notified = true for a message that was never sent, which is the false-confirmation defect
    // this whole module exists to prevent, one level deeper. `ok` must be READ, not inferred from
    // the absence of an exception.
    let notified = false
    try {
      const sent = await sendTelegram(buildHandoffTelegram({
        kind: opts.kind,
        orgName: ctx.name,
        plan: ctx.plan,
        trialDay: ctx.trialDay,
        email,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        preferredContact: c.preferredContact,
        callWindowDisplay: win.display,
        pathname: opts.pathname,
        id,
        message: opts.message,
      }))
      notified = sent?.ok === true
    } catch {
      notified = false
    }

    if (notified) {
      await db.execute(sql`UPDATE mia_handoff_requests SET "notifiedAt" = NOW() WHERE id = ${id}`).catch(() => {})
    }

    // `reachable` is returned SEPARATELY from `notified` because they fail independently and mean
    // different things: notified = a human was told, reachable = that human can answer. Mia's
    // permission to promise an email is gated on both — see miaChat.ts.
    return { ok: true, id, notified, reachable: email !== null }
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e).slice(0, 120) }
  }
}

// ─── THE READER ──────────────────────────────────────────────────────────────

export type MiaInbox = {
  checked: boolean
  feedback7d: number
  bugs7d: number
  openHandoffs: number
  unnotifiedHandoffs: number
  oldestOpenDays: number | null
  line: string
}

/**
 * What the team sees. Read by Janet's daily standup, alongside the existing weekly digest.
 *
 * The weekly digest already existed and worked — this is the DAILY surface, and it exists mainly
 * for `unnotifiedHandoffs`: a customer who asked for a human and whose notification failed is
 * invisible to every other channel. That is the one number here that represents a person currently
 * waiting on nothing.
 */
export async function readMiaInbox(): Promise<MiaInbox> {
  const empty: MiaInbox = {
    checked: false, feedback7d: 0, bugs7d: 0, openHandoffs: 0, unnotifiedHandoffs: 0,
    oldestOpenDays: null, line: 'Mia inbox: NOT CHECKED (database unreachable).',
  }
  let db: any
  try { db = await getDb() } catch { return empty }
  if (!db) return empty

  try {
    const since = new Date(Date.now() - 7 * 86_400_000)
    const fb = await db.select().from(productFeedback).where(gte(productFeedback.createdAt, since))
    const feedback7d = fb.length
    const bugs7d = fb.filter((r: any) => r.category === 'bug').length

    const h = await db.execute(sql`
      SELECT count(*)::int AS open,
             count(*) FILTER (WHERE "notifiedAt" IS NULL)::int AS unnotified,
             EXTRACT(EPOCH FROM (NOW() - min("createdAt")))/86400 AS oldest_days
      FROM mia_handoff_requests WHERE "resolvedAt" IS NULL`)
    const row = (h as any)?.rows?.[0] ?? (h as any)?.[0] ?? {}
    const openHandoffs = Number(row.open ?? 0)
    const unnotifiedHandoffs = Number(row.unnotified ?? 0)
    const oldestOpenDays = openHandoffs > 0 ? Math.floor(Number(row.oldest_days ?? 0)) : null

    return {
      checked: true, feedback7d, bugs7d, openHandoffs, unnotifiedHandoffs, oldestOpenDays,
      line: buildInboxLine({ feedback7d, bugs7d, openHandoffs, unnotifiedHandoffs, oldestOpenDays }),
    }
  } catch {
    return empty
  }
}

export function buildInboxLine(a: {
  feedback7d: number
  bugs7d: number
  openHandoffs: number
  unnotifiedHandoffs: number
  oldestOpenDays: number | null
}): string {
  const parts: string[] = []
  parts.push(
    a.feedback7d === 0
      ? 'no trial feedback in the last 7 days'
      : `${a.feedback7d} feedback item(s) in 7d, ${a.bugs7d} of them bug reports`,
  )
  if (a.openHandoffs > 0) {
    parts.push(
      `${a.openHandoffs} CUSTOMER(S) WAITING FOR A HUMAN` +
      (a.oldestOpenDays !== null ? `, oldest ${a.oldestOpenDays}d` : '') +
      ' — nothing else contacts them',
    )
  } else {
    parts.push('no open human-handoff requests')
  }
  if (a.unnotifiedHandoffs > 0) {
    parts.push(
      `⚠ ${a.unnotifiedHandoffs} handoff request(s) were RECORDED BUT NOBODY WAS NOTIFIED ` +
      `(the Telegram send failed) — these are invisible everywhere else`,
    )
  }
  return `Mia inbox: ${parts.join(' · ')}.`
}
