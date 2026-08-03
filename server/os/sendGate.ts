// ─────────────────────────────────────────────────────────────────────────────
//  PS-DEX-GATE-01 — the universal pre-send suppression gate. Owned by Dex.
//
//  THE DEFECT THIS CLOSES
//    Suppression was checked in exactly ONE place: touch2Eligible()'s SELECT. Every other send path
//    — touch-1, and the dormant touch-2..5 loop — filtered on `unsubscribed` alone and never
//    consulted ps_outreach_suppression. A lead with a provider suppression row but an unset flag
//    (Rex found 8 of them on 2026-08-03, one of which, jbuck@matrixintegration.com, was sitting in
//    'prospect') was invisible to those paths.
//
//  THE PATTERN, NAMED
//    This is the partial-gate shape that has bitten this system repeatedly: MX checking on some
//    paths but not the simulation path; the internal-address exclusion applied downstream in one
//    place and at the query level in another. A gate that covers most paths reads as "we have a
//    gate" in every review and still leaks through the one path nobody listed.
//
//  SO THE GATE IS TWO LAYERS, DELIBERATELY REDUNDANT
//    1. SUPPRESSION_PREDICATE_SQL — belongs in every eligibility SELECT, so suppressed rows are
//       never even fetched.
//    2. assertSendable() — a runtime check on the individual address, called immediately before the
//       send call on EVERY path.
//
//    Layer 1 alone is what we had, and it failed because a new query can be written without it.
//    Layer 2 alone would work but re-queries per lead. Together, a new send path has to defeat both
//    to leak, and the structural test (dexGate.test.ts) fails the build if any sendEmail call site
//    is not preceded by layer 2.
//
//  FAIL CLOSED
//    A database error inside the check returns BLOCKED, not allowed. "We could not determine whether
//    this person opted out" is not permission to email them — this is the one gate where the
//    unknown case has a legal consequence rather than a reporting one.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The SQL fragment every eligibility query must carry. Written against an alias so it can be
 * dropped into a join, and exported so a test can assert its presence in each query's text rather
 * than trusting a reviewer to have noticed it.
 */
export const SUPPRESSION_PREDICATE_SQL = `
       AND l.unsubscribed = false
       AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))`

/** Same predicate for queries that do not alias the table. */
export const SUPPRESSION_PREDICATE_SQL_UNALIASED = `
       AND unsubscribed = false
       AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(ps_outreach_leads.email))`

export type SendVerdict = { allowed: boolean; reason: string }

const ALLOWED: SendVerdict = { allowed: true, reason: 'no suppression signal' }

/**
 * THE gate. Call immediately before any send to a prospect, on every path, no exceptions.
 *
 * Checks the four independent reasons an address must not be mailed, in one query:
 *   - the lead is flagged unsubscribed
 *   - a suppression row exists (provider truth, e.g. a Resend suppression)
 *   - the lead is in a terminal stage
 *   - the address is one of ours (internal test rows must never receive outbound)
 *
 * Returns a verdict rather than throwing: the send loops are per-lead and must SKIP the blocked
 * address and continue, not abort the batch. A thrown error would take the whole run down and the
 * remaining good sends with it.
 */
export async function assertSendable(sql: any, email: string): Promise<SendVerdict> {
  const addr = String(email || '').trim().toLowerCase()
  if (!addr || !addr.includes('@')) return { allowed: false, reason: 'malformed address' }

  try {
    const rows = (await sql`
      SELECT
        COALESCE(bool_or(l.unsubscribed), false)                       AS unsubscribed,
        COALESCE(bool_or(l.pipeline_stage IN ('dead','internal_test')), false) AS terminal,
        EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = ${addr}) AS suppressed
      FROM ps_outreach_leads l
      WHERE lower(l.email) = ${addr}
    `) as any[]

    const r = rows[0]
    // No lead row at all. The suppression subquery is independent of the lead, so a suppressed
    // address with no lead row is still correctly blocked here.
    if (!r) return { allowed: false, reason: 'no lead row — cannot verify consent state' }

    if (r.suppressed === true) return { allowed: false, reason: 'BLOCKED: provider suppression row exists' }
    if (r.unsubscribed === true) return { allowed: false, reason: 'BLOCKED: lead flagged unsubscribed' }
    if (r.terminal === true) return { allowed: false, reason: 'BLOCKED: lead is in a terminal stage' }

    if (addr === 'kaanari@mac.com' || addr === 'asadbek.munasar@forliion.com' || addr.endsWith('@phishsimai.com')) {
      return { allowed: false, reason: 'BLOCKED: internal address, never receives outbound' }
    }
    return ALLOWED
  } catch (e: any) {
    // FAIL CLOSED. An unverifiable consent state is not consent.
    return { allowed: false, reason: `BLOCKED: consent state unverifiable (${String(e?.message || e).slice(0, 60)})` }
  }
}
