/**
 * PS-TELEGRAM-GATE-01 — owner 2026-09-23:
 * Silence almost all Telegram status spam.
 * Allowlist ONLY: hard_failure | founder_brief.
 *
 * All sendTelegram traffic routes through classify + allow.
 * Caps unchanged. No blast. No touch 93.
 */

export type TelegramKind = 'hard_failure' | 'founder_brief' | 'status' | 'win' | 'money'

/** Owner allowlist — everything else is silenced at the choke point. */
export const TELEGRAM_ALLOWLIST: ReadonlySet<TelegramKind> = new Set(['hard_failure', 'founder_brief'])

export function isTelegramAllowed(kind: TelegramKind): boolean {
  return TELEGRAM_ALLOWLIST.has(kind)
}

/**
 * Classify a message. Prefer explicit `kind` from the caller when present;
 * otherwise infer from prefixes / body so legacy callers stay gated.
 *
 * hard_failure = bounce breaker, breaker_trip, T1 starve, verifier empty,
 *   bug fix failed, HQ chat down, truth-report build fail, LLM/provider billing (money),
 *   FOUNDER DECISION PENDING on non-noise, destructive refuse.
 * founder_brief = the once/day founder brief (and morning brief that is explicitly that).
 * Everything else (ARIA SEQUENCE, TASK flips, trial nudges, digests, wins, restarts) = status.
 */
export function classifyTelegramKind(text: string, explicit?: TelegramKind | null): TelegramKind {
  if (explicit && (TELEGRAM_ALLOWLIST.has(explicit) || explicit === 'status' || explicit === 'win' || explicit === 'money')) {
    if (explicit === 'money') return 'hard_failure' // money pages as hard_failure per owner
    return explicit
  }
  const t = String(text || '')

  // Founder brief (once/day) — keep.
  if (
    /^#\s*Founder Brief\b/m.test(t) ||
    /\bFOUNDER BRIEF\b/i.test(t) ||
    /☀️\s*\*?KAAN'S MORNING BRIEF/i.test(t) ||
    /\bPhishSim — Founder Brief\b/i.test(t)
  ) {
    return 'founder_brief'
  }

  // Hard failures / money.
  if (
    /BOUNCE BREAKER|BOUNCE ALERT|breaker_trip|PHISHSIMAI BOUNCE\b/i.test(t) ||
    /T1 STARVED|mailbox verifier EMPTY|verifier empty/i.test(t) ||
    /BUG FIX FAILED|JANET HQ CHAT DOWN|ARCHITECT QUEUE FAILED|TRUTH REPORT FAILED/i.test(t) ||
    /FIX PARKED — AWAITING YOUR APPROVAL/i.test(t) ||
    /FOUNDER DECISION PENDING/i.test(t) ||
    /llm_provider_billing|Shared LLM\/provider billing|Payment required|payment failed/i.test(t) ||
    /CREDITS — .*(below floor|runway|UNREADABLE)/i.test(t) ||
    /ESCALATION — (breaker_trip|protected_path|agent_critical)/i.test(t) ||
    /🔴\s*<b>ESCALATION/i.test(t) ||
    /Destructive diff refused/i.test(t)
  ) {
    return 'hard_failure'
  }

  // Explicit wins / status digests — silenced.
  return 'status'
}

export function gateTelegram(
  text: string,
  explicit?: TelegramKind | null,
): { allowed: boolean; kind: TelegramKind; reason?: string } {
  const kind = classifyTelegramKind(text, explicit)
  if (isTelegramAllowed(kind)) return { allowed: true, kind }
  return {
    allowed: false,
    kind,
    reason: `telegramGate: silenced kind=${kind} (allowlist: hard_failure|founder_brief)`,
  }
}
