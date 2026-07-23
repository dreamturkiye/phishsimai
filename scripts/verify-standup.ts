/**
 * PS-PHANTOM-01 / PS-DEDUPE-01 / PS-TRUNCATE-01 — post-deploy verification.
 *
 * Checks the five properties the fix is supposed to guarantee, against the LIVE prod DB,
 * for the most recent daily standup. Read-only: it runs SELECTs and nothing else.
 *
 *   npx tsx scripts/verify-standup.ts            # newest standup
 *   npx tsx scripts/verify-standup.ts 2026-07-24 # a specific day (UTC)
 *
 * Needs a DATABASE_URL for ep-spring-leaf. Reads .env.spring-leaf.real (gitignored) or the
 * DATABASE_URL env var. Per CLAUDE.md, do NOT source this from `vercel env pull` — that
 * resolves the wrong scope on this machine and returns ScrollFuel's database.
 */
import { neon } from '@neondatabase/serverless'
import fs from 'fs'
import path from 'path'
import { parseStandupAssignments, normalizeTaskTitle } from '../server/lib/kaan_os_v4'

// ── connection ───────────────────────────────────────────────────────────────
function resolveUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const f = path.resolve(process.cwd(), '.env.spring-leaf.real')
  if (!fs.existsSync(f)) throw new Error('No DATABASE_URL and no .env.spring-leaf.real — cannot reach prod.')
  const m = fs.readFileSync(f, 'utf8').match(/^DATABASE_URL(?:_UNPOOLED)?=(.+)$/m)
  if (!m) throw new Error('.env.spring-leaf.real has no DATABASE_URL line.')
  const url = m[1].trim().replace(/^["']|["']$/g, '')
  if (!/ep-spring-leaf/.test(url)) {
    throw new Error(`Refusing to run: host is not ep-spring-leaf. PhishSim's schema lives ONLY there.`)
  }
  return url
}

const sql = neon(resolveUrl())
const day = process.argv[2] // optional YYYY-MM-DD (UTC)

// ── result plumbing ──────────────────────────────────────────────────────────
type Check = { name: string; pass: boolean; detail: string }
const checks: Check[] = []
const record = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail })

// Claims no text-only agent can possibly back. Matched against each agent's own report.
// Deliberately targets ACTIONS ("I audited the database"), not recommendations ("we should
// audit the database") — the fix teaches agents to do the latter, so it must not be flagged.
const FABRICATION_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'code/repo access', re: /\b(?:i|we)\s+(?:have\s+)?(?:wrote|written|shipped|pushed|committed|deployed|merged|refactored|patched|reverted)\b(?!\s+(?:a\s+)?(?:recommend|proposal|spec|plan|brief|doc))/i },
  { label: 'dev-queue bypass', re: /bypass(?:ing|ed)?\s+(?:the\s+)?(?:dev|development|eng(?:ineering)?)\s+queue/i },
  { label: 'touching production code', re: /\b(?:touch(?:ing|ed)?|modif(?:y|ying|ied)|chang(?:e|ing|ed))\s+(?:the\s+)?production\s+code\b/i },
  { label: 'ran a DB query / audited the DB', re: /\b(?:i|we)\s+(?:audited|queried|ran\s+a\s+query\s+(?:on|against)|inspected|pulled\s+from)\s+(?:the\s+)?(?:prod(?:uction)?\s+)?(?:database|db|postgres|neon)\b/i },
  { label: 'sent email / contacted a customer', re: /\b(?:i|we)\s+(?:emailed|e-mailed|sent\s+(?:an?\s+)?(?:email|e-mail|message)\s+to|called|contacted|reached\s+out\s+to)\s+(?!.*\b(?:recommend|should|propose|plan)\b)/i },
]

async function main() {
  // ── the standup under test ─────────────────────────────────────────────────
  const meetings: any = day
    ? await sql`SELECT held_at, transcript, decisions FROM agent_meetings
                WHERE meeting_type='daily_standup' AND held_at::date = ${day}::date
                ORDER BY held_at DESC LIMIT 1`
    : await sql`SELECT held_at, transcript, decisions FROM agent_meetings
                WHERE meeting_type='daily_standup' ORDER BY held_at DESC LIMIT 1`

  const meeting = meetings[0]
  if (!meeting) {
    console.error(day ? `No daily_standup found for ${day}.` : 'No daily_standup found at all.')
    process.exit(2)
  }

  const heldAt = new Date(meeting.held_at)
  const transcript: string = String(meeting.transcript || '')
  const janet: string = Array.isArray(meeting.decisions) ? meeting.decisions.join('\n') : String(meeting.decisions || '')

  console.log(`\n━━ standup ${heldAt.toISOString()} ━━`)
  const ageH = (Date.now() - heldAt.getTime()) / 3_600_000
  if (!day && ageH > 26) {
    console.log(`⚠️  This standup is ${ageH.toFixed(1)}h old — the cron may not have fired yet today.`)
  }

  // Split the transcript into per-agent report blocks: "[ARIA]: ...".
  const reports = new Map<string, string>()
  const rx = /\[([A-Z]+)\]:\s*([\s\S]*?)(?=\n\n\[[A-Z]+\]:|$)/g
  for (const m of transcript.matchAll(rx)) reports.set(m[1].toLowerCase(), m[2].trim())

  // ── CHECK 1 — Aria tells the literal truth ────────────────────────────────
  const aria = reports.get('aria') || ''
  const ariaDone: any = await sql`
    SELECT count(*)::int AS n FROM agent_tasks
    WHERE agent_id='aria' AND status IN ('completed','reviewed')
      AND completed_at BETWEEN ${heldAt.toISOString()}::timestamptz - interval '24 hours' AND ${heldAt.toISOString()}::timestamptz`
  const ariaOpen: any = await sql`
    SELECT count(*)::int AS n FROM agent_tasks
    WHERE agent_id='aria' AND status IN ('assigned','in_progress')
      AND created_at <= ${heldAt.toISOString()}::timestamptz`
  const completed24 = Number(ariaDone[0]?.n || 0)
  const open = Number(ariaOpen[0]?.n || 0)

  if (!aria) {
    record('1. Aria reports the truth', false, 'No [ARIA] block found in the transcript.')
  } else if (completed24 === 0 && open === 0) {
    // The exact case that produced the phantom. Her report must own the emptiness.
    const saysNothing = /nothing\s+completed|no(?:thing)?\s+(?:tasks?\s+)?completed|completed\s*:?\s*none|did\s+not\s+complete/i.test(aria)
    const saysUnassigned = /unassigned|awaiting\s+(?:a\s+)?task|no\s+(?:assigned\s+)?tasks?|none\s+assigned/i.test(aria)
    record('1. Aria reports the truth', saysNothing && saysUnassigned,
      `ledger: 0 completed in 24h, 0 assigned. Report says "nothing completed"=${saysNothing}, "unassigned"=${saysUnassigned}.` +
      (saysNothing && saysUnassigned ? '' : `\n      ARIA said: ${aria.slice(0, 220).replace(/\n/g, ' ')}…`))
  } else {
    record('1. Aria reports the truth', true,
      `ledger is non-empty (${completed24} completed in 24h, ${open} assigned) — the "must say nothing" case does not apply today.`)
  }

  // ── CHECK 2 — nobody claims impossible actions ────────────────────────────
  const hits: string[] = []
  for (const [agent, text] of reports) {
    for (const { label, re } of FABRICATION_PATTERNS) {
      const m = text.match(re)
      if (m) hits.push(`${agent}: ${label} — "${text.slice(Math.max(0, m.index! - 30), m.index! + 90).replace(/\n/g, ' ').trim()}"`)
    }
  }
  record('2. No fabricated capability claims', hits.length === 0,
    hits.length ? hits.map(h => `\n      ✗ ${h}`).join('') : `clean across ${reports.size} agent report(s).`)

  // ── CHECK 3 — the footer number is real ───────────────────────────────────
  // Tasks Janet's standup actually created, within a 10-min window of the meeting.
  const issued: any = await sql`
    SELECT agent_id, title FROM agent_tasks
    WHERE issued_by='janet'
      AND created_at BETWEEN ${heldAt.toISOString()}::timestamptz AND ${heldAt.toISOString()}::timestamptz + interval '10 minutes'
      AND description LIKE 'Issued during daily standup:%'`
  const parsed = parseStandupAssignments(janet)
  const nIssued = (issued as any[]).length

  if (parsed.length === 0) {
    record('3. Footer number is honest', true,
      `Janet proposed no parseable assignments and 0 were created — consistent (footer should read "none proposed").`)
  } else if (nIssued > 0) {
    record('3. Footer number is honest', true,
      `Janet proposed ${parsed.length}; ${nIssued} row(s) created. Parser is live — this is the bug that produced "0 tasks issued".`)
  } else {
    // Zero created despite parseable assignments is only OK if they were all duplicates.
    const dupes = await Promise.all(parsed.map(async p => {
      const prior: any = await sql`
        SELECT title FROM agent_tasks WHERE agent_id=${p.agentId}
          AND created_at BETWEEN ${heldAt.toISOString()}::timestamptz - interval '72 hours' AND ${heldAt.toISOString()}::timestamptz
        ORDER BY created_at DESC LIMIT 50`
      return (prior as any[]).some(r => normalizeTaskTitle(r.title) === normalizeTaskTitle(p.title))
    }))
    const allDup = dupes.every(Boolean)
    record('3. Footer number is honest', allDup,
      allDup
        ? `Janet proposed ${parsed.length}, all already open/recent → correctly suppressed as duplicates.`
        : `Janet proposed ${parsed.length} but ${dupes.filter(d => !d).length} non-duplicate(s) were NOT created — issuance may be broken again.`)
  }

  // ── CHECK 4 — the repeat-offender titles are not re-issued ────────────────
  const REPEATERS = [
    'Trend scan: emerging AI/SaaS signals relevant to our category',
    'Unit economics review: LTV/CAC estimate update, payback period, margin sensitivity',
    '30-day revenue forecast with best/base/worst scenarios',
  ].map(normalizeTaskTitle)

  const window: any = await sql`
    SELECT agent_id, title, created_at::date AS d FROM agent_tasks
    WHERE created_at > ${heldAt.toISOString()}::timestamptz - interval '72 hours'
    ORDER BY created_at`
  const byKey = new Map<string, Set<string>>()
  for (const r of window as any[]) {
    const k = `${r.agent_id}|${normalizeTaskTitle(r.title)}`
    if (!byKey.has(k)) byKey.set(k, new Set())
    byKey.get(k)!.add(String(r.d))
  }
  const repeats = [...byKey.entries()].filter(([, days]) => days.size > 1)
  const repeaterHits = [...byKey.keys()].filter(k => REPEATERS.some(t => t && k.endsWith(`|${t}`)))
    .filter(k => (byKey.get(k)!.size > 1))
  record('4. No duplicate re-issue', repeats.length === 0,
    repeats.length === 0
      ? `${window.length} task(s) in 72h, all distinct after normalization.`
      : repeats.map(([k, d]) => `\n      ✗ x${d.size} days — ${k.replace('|', ': ')}`).join('') +
        (repeaterHits.length ? `\n      (includes ${repeaterHits.length} of the 3 known repeat offenders)` : ''))

  // ── CHECK 5 — the whole response is deliverable, assignments included ─────
  // We cannot read Telegram, but we can verify the two properties that made it lossy:
  // the response is stored in full, and its assignments are machine-visible.
  const oldKept = janet.length ? Math.min(600, janet.length) / janet.length : 1
  const assignmentsVisible = parsed.length > 0 || !/\bassign/i.test(janet)
  record('5. Full response + assignments survive', janet.length > 0 && assignmentsVisible,
    `response ${janet.length} chars (old slice(0,600) would have kept ${Math.round(oldKept * 100)}%); ` +
    `${parsed.length} assignment(s) machine-visible${parsed.length ? `: ${parsed.map(p => p.agentId).join(', ')}` : ''}.`)

  // ── report ────────────────────────────────────────────────────────────────
  console.log()
  for (const c of checks) console.log(`${c.pass ? '✅' : '❌'} ${c.name}\n      ${c.detail}\n`)
  const failed = checks.filter(c => !c.pass)
  console.log(failed.length === 0
    ? `━━ ALL ${checks.length} CHECKS PASS ━━`
    : `━━ ${failed.length}/${checks.length} FAILED: ${failed.map(f => f.name.split('.')[0]).join(', ')} ━━`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch(e => { console.error(`verify-standup failed: ${e?.message || e}`); process.exit(2) })
