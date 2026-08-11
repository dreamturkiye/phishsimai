// ─────────────────────────────────────────────────────────────────────────────
//  PS-FINDER-LEDGER-01 — every paid finder call gets written down.
//
//  This exists because of a question we could not answer. On 2026-07-24, 299 Icypeas credits
//  disappeared in 24 hours and the founder asked for per-product attribution. There was none to
//  give: `credit_readings` holds a daily total BALANCE, `provider_usage` was empty, and Icypeas
//  is one shared pool across two products living in two different Neon projects. The spend had
//  to be inferred from row counts. That inference happened to be sound, but "sound inference"
//  and "records" are not the same thing, and only one of them survives contact with a vendor
//  dispute or a second product.
//
//  DESIGN RULES:
//  1. Record FACTS, never estimates. calls and results are counted, not modelled. There is no
//     credits column because Icypeas does not publish its rate — inventing one would put a
//     guessed number in a table people read as measured, which is the exact failure this
//     codebase keeps finding.
//  2. NEVER let accounting break the work it is accounting for. Every write is best-effort and
//     swallowed; a ledger outage must not stop lead generation.
//  3. Count SKIPS too. A guard that prevents spend is invisible in a balance reading — the only
//     way to prove PS-ICY-GUARD-01 is working is to count what it stopped.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from './conn'
import { COMPANY_ID } from './version'

export type ProviderCall = {
  provider: string
  /** Vendor path, e.g. 'find-people', 'sync/email-search', 'amf/search', 'hunter/domain-search'. */
  endpoint: string
  /** Billable units returned: leads for a search, 1 for a FOUND email, 0 for a miss. */
  results?: number
  /** 1 when the call was PREVENTED by a guard (no request sent, no spend). */
  skipped?: number
  /** Set false when the request never reached the vendor, so it should not count as a call. */
  sent?: boolean
  productId?: string
}

/**
 * Upsert one day's tally for (provider, day, product, endpoint).
 *
 * Best-effort by construction: a failure here is logged and dropped. The alternative — a finder
 * that stops finding because a metrics table is unavailable — trades revenue for bookkeeping.
 */
export async function recordProviderCall(call: ProviderCall, sqlOverride?: any): Promise<void> {
  const product = call.productId ?? COMPANY_ID
  const calls = call.sent === false ? 0 : 1
  const results = Math.max(0, Math.trunc(call.results ?? 0))
  const skipped = Math.max(0, Math.trunc(call.skipped ?? 0))
  try {
    // getSql() is INSIDE the try on purpose. It throws when DATABASE_URL is unset, and a throw
    // here would propagate out of a best-effort ledger write and take the finder down with it —
    // the precise inversion this module's rule 2 forbids. Resolving the client is part of the
    // attempt, not a precondition of it.
    const sql = sqlOverride ?? getSql()
    await sql`
      INSERT INTO provider_usage (provider, usage_date, product_id, endpoint, calls, results, skipped, tokens_used)
      VALUES (${call.provider}, CURRENT_DATE, ${product}, ${call.endpoint}, ${calls}, ${results}, ${skipped}, 0)
      ON CONFLICT (provider, usage_date, product_id, endpoint) DO UPDATE SET
        calls   = provider_usage.calls   + EXCLUDED.calls,
        results = provider_usage.results + EXCLUDED.results,
        skipped = provider_usage.skipped + EXCLUDED.skipped`
  } catch (e: any) {
    console.error(`[provider-usage] ledger write failed for ${call.provider}/${call.endpoint}: ${String(e?.message || e).slice(0, 120)}`)
  }
}

/**
 * What a day actually cost, per product and endpoint — the query that replaces the arithmetic.
 * Pair the totals with the credit_readings delta for the same window to derive the real rate.
 */
export async function finderSpend(dayIso: string, sqlOverride?: any): Promise<Array<{
  provider: string; product_id: string; endpoint: string; calls: number; results: number; skipped: number
}>> {
  const sql = sqlOverride ?? getSql()
  const rows = (await sql`
    SELECT provider, product_id, endpoint, calls::int AS calls, results::int AS results, skipped::int AS skipped
    FROM provider_usage WHERE usage_date = ${dayIso}::date
    ORDER BY provider, product_id, endpoint`) as any[]
  return rows as any
}
