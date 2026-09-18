/**
 * PS-T1-MARCUS-01 — detection → Marcus, not Telegram-only theater.
 *
 * Live miss 2026-09-12 → 09-17: last T1 dead 5 days, sanitizedEligible=0,
 * pauseNewTouch1=true, QEV empty on Vercel. Watchdog/HQ could Telegram;
 * Janet crisis ticks assigned convert_warm only; dual-crisis skip rules
 * forbade TOF/touch-1; nobody coded ACTION: queue_marcus.
 *
 * Pure ticket + one gated queue. Named bugs only (sanitize refill / QEV env /
 * pause logic). Do not raise DAILY_SEND_LIMIT, add touch 93, or set
 * REFILL_ALLOW_MX_ONLY.
 */
import { COMPANY_ID } from './version'
import { mailboxVerifierKeys, isDexDailyThrottle, type MailboxVerifierKeys } from './touch1Health'
import { diagnoseRevenueFailure, isOperatingCrisis, type RevenueDiagnosis } from './cgoMandate'
import { T1_QUALITY_REFILL_MAX, isSmallQualityT1Refill } from './sequenceBacklog'

export const T1_MARCUS_EMPTY_HOURS = 6
export const T1_MARCUS_DAY_KEY = 't1_marcus_handoff_day'
export { T1_QUALITY_REFILL_MAX }

/** Named bugs the founder asked for — not analysis theater. */
export type T1MarcusBug = 'PS-T1-STARVE' | 'PS-T1-QEV-EMPTY' | 'PS-T1-PAUSE-LOCK'

export type T1MarcusTicket = {
  queue: boolean
  bug: T1MarcusBug | null
  task: string
  notes: string
}

export type T1Scoreboard = {
  daysSinceLastT1: number | null
  hoursSinceLastT1: number | null
  sanitizedEligible: number
  unsanitizedEligible: number
  pauseNewTouch1: boolean
  verifierMode: 'mev_qev' | 'mev' | 'qev' | 'empty'
  verifier: MailboxVerifierKeys
  warmCtaToTrue: { ctaSent: number; trueTrials: number } | null
  operatingCrisis: boolean
  drainableOverdue: number
  touch1LastAt: string | null
  starvationAlert: boolean
  sendableUntouched: number
  t1StarveReason?: string | null
  newSentToday?: number
  secondSentToday?: number
  newTouchAllowance?: number
}

export function verifierModeOf(keys: MailboxVerifierKeys): T1Scoreboard['verifierMode'] {
  if (!keys.any) return 'empty'
  if (keys.mev && keys.qev) return 'mev_qev'
  if (keys.qev) return 'qev'
  return 'mev'
}

export function daysSinceLastT1(touch1LastAt: Date | string | null, now: Date = new Date()): number | null {
  if (!touch1LastAt) return null
  const t = new Date(touch1LastAt).getTime()
  if (!Number.isFinite(t)) return null
  return (now.getTime() - t) / 86_400_000
}

function namedTask(bug: T1MarcusBug, detail: string): string {
  const forbid =
    'Do not raise DAILY_SEND_LIMIT. Do not add touch 93. Do not set REFILL_ALLOW_MX_ONLY=1.'
  if (bug === 'PS-T1-QEV-EMPTY') {
    return (
      `Named bug: PS-T1-QEV-EMPTY — mailbox verifier empty (QEV/MEV). ` +
      `Set QEV_API_KEY in Vercel Production (or a non-empty MYEMAILVERIFIER_API_KEY). ` +
      `Files: server/os/sanitizeRefill.ts, server/os/touch1Health.ts. ${detail} ${forbid}`
    )
  }
  if (bug === 'PS-T1-PAUSE-LOCK') {
    return (
      `Named bug: PS-T1-PAUSE-LOCK — pauseNewTouch1 locked a small quality pool. ` +
      `Files: server/os/sequenceBacklog.ts shouldPauseTouch1 / isSmallQualityT1Refill. Allow T1 drip while 0 < sanitizedEligible≤${T1_QUALITY_REFILL_MAX}. ` +
      `${detail} ${forbid}`
    )
  }
  return (
    `Named bug: PS-T1-STARVE — restore sanitize refill so T1 can send (sanitized_at IS NOT NULL). ` +
    `Files: server/os/sanitizeRefill.ts, server/os/sequences.ts, server/os/touch1Health.ts. ` +
    `${detail} ${forbid}`
  )
}

/**
 * Watchdog / sanitize-refill: starvation.alert OR !verifier.any OR sendable untouched=0
 * (sustained ≥ T1_MARCUS_EMPTY_HOURS) → one named Marcus architect task.
 */
export function t1MarcusTicket(input: {
  operatingCrisis?: boolean
  daysSinceLastT1?: number | null
  hoursSinceLastT1?: number | null
  sanitizedEligible: number
  unsanitizedEligible: number
  pauseNewTouch1: boolean
  verifier: MailboxVerifierKeys
  drainableOverdue?: number
  starvationAlert?: boolean
  sendableUntouched?: number
  t1StarveReason?: string | null
}): T1MarcusTicket {
  const hours =
    input.hoursSinceLastT1 ??
    (input.daysSinceLastT1 != null ? input.daysSinceLastT1 * 24 : null)
  const neverSent = hours == null
  const emptyLongEnough = neverSent || hours >= T1_MARCUS_EMPTY_HOURS
  const sendable = input.sendableUntouched ?? input.sanitizedEligible
  const reservoir = input.unsanitizedEligible + input.sanitizedEligible
  const detail =
    `daysSinceLastT1=${input.daysSinceLastT1 ?? 'never'} sanitizedEligible=${input.sanitizedEligible} ` +
    `unsanitizedEligible=${input.unsanitizedEligible} pauseNewTouch1=${input.pauseNewTouch1} ` +
    `verifierMode=${verifierModeOf(input.verifier)} drainableOverdue=${input.drainableOverdue ?? '?'} ` +
    `starvationAlert=${!!input.starvationAlert} sendableUntouched=${sendable} t1StarveReason=${input.t1StarveReason ?? 'n/a'}`

  if (!input.verifier.any) {
    return { queue: true, bug: 'PS-T1-QEV-EMPTY', task: namedTask('PS-T1-QEV-EMPTY', detail), notes: detail }
  }

  // Live 2026-09-17: dual-stamped T3 exhausted combined and T1 sat healthy. That is a
  // throttle, not sanitize starve — do not open PS-T1-STARVE or page the founder.
  if (isDexDailyThrottle(input.t1StarveReason)) {
    return { queue: false, bug: null, task: '', notes: detail }
  }

  const sendableDeadSustained = sendable <= 0 && emptyLongEnough && (input.unsanitizedEligible > 100 || reservoir > 100)
  if (input.starvationAlert || sendableDeadSustained) {
    return { queue: true, bug: 'PS-T1-STARVE', task: namedTask('PS-T1-STARVE', detail), notes: detail }
  }

  const smallPool = isSmallQualityT1Refill(sendable)
  if (input.pauseNewTouch1 && smallPool) {
    return { queue: true, bug: 'PS-T1-PAUSE-LOCK', task: namedTask('PS-T1-PAUSE-LOCK', detail), notes: detail }
  }

  return { queue: false, bug: null, task: '', notes: detail }
}

export function diagnoseFromT1Scoreboard(
  board: Pick<
    T1Scoreboard,
    'daysSinceLastT1' | 'sanitizedEligible' | 'unsanitizedEligible' | 'pauseNewTouch1' | 'verifier' | 'warmCtaToTrue' | 't1StarveReason'
  > & { trueTrials?: number | null; paying?: number | null; warm?: Parameters<typeof diagnoseRevenueFailure>[0]['warm'] },
): RevenueDiagnosis {
  return diagnoseRevenueFailure({
    trueTrials: board.trueTrials ?? null,
    paying: board.paying ?? null,
    warm: board.warm ?? null,
    t1: {
      daysSinceLastT1: board.daysSinceLastT1,
      sanitizedEligible: board.sanitizedEligible,
      unsanitizedEligible: board.unsanitizedEligible,
      pauseNewTouch1: board.pauseNewTouch1,
      verifier: board.verifier,
      warmCtaToTrue: board.warmCtaToTrue,
      t1StarveReason: board.t1StarveReason,
    },
  })
}

export async function loadT1Scoreboard(sql: any, now: Date = new Date()): Promise<T1Scoreboard> {
  const { loadTouch1Health } = await import('./touch1Health')
  const { shouldPauseTouch1, countSequenceBacklog } = await import('./sequenceBacklog')
  const { measureTrueOrgCounts } = await import('./trueTrials')
  const t1 = await loadTouch1Health(sql, now)
  const backlog = await countSequenceBacklog(sql).catch(() => ({ drainableOverdue: 0 }))
  let operatingCrisis = true
  try {
    const counts = await measureTrueOrgCounts(sql)
    operatingCrisis = isOperatingCrisis({
      liveProductTrials: counts.trueLiveTrials,
      crmTrials: 0,
      payingCustomers: counts.truePaying,
    })
  } catch {
    operatingCrisis = true
  }
  const days = daysSinceLastT1(t1.touch1LastAt, now)
  const pauseNewTouch1 = shouldPauseTouch1(backlog.drainableOverdue ?? 0, operatingCrisis, {
    t1Starved: t1.sanitizedEligible <= 0,
    sanitizedEligible: t1.sanitizedEligible,
  })
  let warmCtaToTrue: T1Scoreboard['warmCtaToTrue'] = null
  try {
    const { measureWarmCtaToTrial } = await import('./warmCloseMetrics')
    const rate = await measureWarmCtaToTrial(sql)
    warmCtaToTrue = { ctaSent: rate.ctaSent14d, trueTrials: rate.trueTrialsFromCta }
  } catch {
    warmCtaToTrue = null
  }
  const verifier = t1.verifier?.any != null ? t1.verifier : mailboxVerifierKeys()
  return {
    daysSinceLastT1: days,
    hoursSinceLastT1: days == null ? null : days * 24,
    sanitizedEligible: t1.sanitizedEligible,
    unsanitizedEligible: t1.unsanitizedEligible,
    pauseNewTouch1,
    verifierMode: verifierModeOf(verifier),
    verifier,
    warmCtaToTrue,
    operatingCrisis,
    drainableOverdue: backlog.drainableOverdue ?? 0,
    touch1LastAt: t1.touch1LastAt,
    starvationAlert: !!t1.starvation?.alert,
    sendableUntouched: t1.sanitizedEligible,
    t1StarveReason: t1.t1StarveReason ?? null,
    newSentToday: t1.newSentToday,
    secondSentToday: t1.secondSentToday,
    newTouchAllowance: t1.newTouchAllowance,
  }
}

export async function applyT1MarcusTicket(
  ticket: T1MarcusTicket,
  deps: {
    queueTask: (opts: { task: string; source?: string; notes?: string; notify?: boolean }) => Promise<string | null>
    alreadyQueuedToday: (dayBug: string) => Promise<boolean>
    markQueuedToday: (dayBug: string) => Promise<void>
    day?: string
    supersedeSpam?: (keepId: string) => Promise<void>
  },
): Promise<{ queued: boolean; bug: T1MarcusBug | null; id: string | null }> {
  if (!ticket.queue || !ticket.bug) return { queued: false, bug: ticket.bug, id: null }
  const day = deps.day ?? new Date().toISOString().slice(0, 10)
  const dayBug = `${day}:${ticket.bug}`
  if (await deps.alreadyQueuedToday(dayBug)) {
    // Day-dedupe must still cancel the Lead Eligibility Checker clone storm.
    if (deps.supersedeSpam) await deps.supersedeSpam('')
    return { queued: false, bug: ticket.bug, id: null }
  }
  const id = await deps.queueTask({
    task: ticket.task.slice(0, 4000),
    source: 'agent:dex',
    notes: ticket.notes.slice(0, 500),
    notify: false,
  })
  if (!id) return { queued: false, bug: ticket.bug, id: null }
  await deps.markQueuedToday(dayBug)
  if (deps.supersedeSpam) await deps.supersedeSpam(id)
  return { queued: true, bug: ticket.bug, id }
}

/** Hourly watchdog / conversion tick: one named Marcus task, deduped per UTC day+bug. */
export async function maybeQueueT1Marcus(opts: {
  sql?: any
  now?: Date
  queueTask?: (opts: { task: string; source?: string; notes?: string; notify?: boolean }) => Promise<string | null>
} = {}): Promise<{ queued: boolean; bug: T1MarcusBug | null; id: string | null; diagnosis: string | null }> {
  const { getSql } = await import('./conn')
  const sql = opts.sql ?? getSql()
  const now = opts.now ?? new Date()
  const board = await loadT1Scoreboard(sql, now)
  const ticket = t1MarcusTicket({
    operatingCrisis: board.operatingCrisis,
    daysSinceLastT1: board.daysSinceLastT1,
    hoursSinceLastT1: board.hoursSinceLastT1,
    sanitizedEligible: board.sanitizedEligible,
    unsanitizedEligible: board.unsanitizedEligible,
    pauseNewTouch1: board.pauseNewTouch1,
    verifier: board.verifier,
    drainableOverdue: board.drainableOverdue,
    starvationAlert: board.starvationAlert,
    sendableUntouched: board.sendableUntouched,
    t1StarveReason: board.t1StarveReason,
  })
  const diagnosis = diagnoseFromT1Scoreboard(board).line
  const queueTask =
    opts.queueTask ??
    (async (args) => {
      const { queueJanetArchitectTask } = await import('./selfHeal')
      return queueJanetArchitectTask(args)
    })
  const day = now.toISOString().slice(0, 10)
  const result = await applyT1MarcusTicket(ticket, {
    queueTask,
    day,
    alreadyQueuedToday: async (dayBug) => {
      const prior = (await sql`
        SELECT value FROM janet_memory
        WHERE company_id=${COMPANY_ID} AND type='operating' AND key=${T1_MARCUS_DAY_KEY}
        LIMIT 1
      `.catch(() => [])) as Array<{ value?: string }>
      return String(prior[0]?.value || '') === dayBug
    },
    markQueuedToday: async (dayBug) => {
      await sql`
        INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
        VALUES (${COMPANY_ID}, 'operating', ${T1_MARCUS_DAY_KEY}, ${dayBug}, 1, 't1_marcus_handoff')
        ON CONFLICT (company_id, type, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `.catch(() => {})
    },
    supersedeSpam: async (keepId) => {
      await supersedeLeadEligibilitySpam(sql, keepId)
    },
  })
  return { ...result, diagnosis }
}

export function isLeadEligibilitySpam(task: string): boolean {
  return /lead eligibility checker/i.test(String(task || ''))
}

export function isNamedT1MarcusTask(task: string): boolean {
  return /PS-T1-(STARVE|QEV-EMPTY|PAUSE-LOCK)/i.test(String(task || ''))
}

/** One-shot: cancel every open "Fix Lead Eligibility Checker" clone when the real T1 bug is queued. */
export async function supersedeLeadEligibilitySpam(sql: any, keepId?: string): Promise<number> {
  const keep = String(keepId || '')
  const rows = (
    keep
      ? await sql`
          UPDATE os_architect_tasks
          SET status='cancelled',
              notes=COALESCE(notes,'') || ' | superseded by PS-T1-STARVE',
              updated_at=NOW()
          WHERE status IN ('queued','pending','approved','running')
            AND task ILIKE '%lead eligibility checker%'
            AND id::text <> ${keep}
          RETURNING id
        `.catch(() => [])
      : await sql`
          UPDATE os_architect_tasks
          SET status='cancelled',
              notes=COALESCE(notes,'') || ' | superseded by PS-T1-STARVE',
              updated_at=NOW()
          WHERE status IN ('queued','pending','approved','running')
            AND task ILIKE '%lead eligibility checker%'
          RETURNING id
        `.catch(() => [])
  ) as Array<{ id: string }>
  return rows.length
}
