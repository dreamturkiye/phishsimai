/**
 * PS-PORT-01 / SF-DELIV-01 — pre-send MX gate, ported from ScrollFuel (lib/leadgen/sendGate.ts).
 *
 * ScrollFuel measured this on 125 real sends: a domain with NO MX record cannot receive mail and
 * bounces 100% of the time — 10 of 125 sends went to no-MX domains and ALL TEN bounced (10 of 24
 * total bounces). Many still serve a parked page (HTTP 200), so an HTTP liveness check passes them;
 * only MX catches it. "Parked pages pass HTTP but fail MX" (V7.3). DNS is free, a send against a
 * dead domain costs sender reputation — check first.
 *
 * This is the exact rail that would have caught PhishSim's 6 dead mailboxes (csgnetworks.com et al.)
 * before they were emailed. Copied from proven code, with one refinement from PhishSim's own
 * evidence: RFC 7505 "null MX" (a single `MX 0 .` record) explicitly declares a domain accepts NO
 * mail — mtd.us in PhishSim's list did exactly this. ScrollFuel's `records.length > 0` would treat
 * that as deliverable; we treat an empty/root exchange as no-MX.
 */

import { resolveMx } from 'node:dns/promises'

export async function hasMx(domain: string): Promise<boolean> {
  try {
    const records = await resolveMx(domain)
    if (!Array.isArray(records) || records.length === 0) return false
    // RFC 7505 null MX: a lone `0 .` (empty/root exchange) means "this domain accepts no mail".
    const real = records.filter((r) => r.exchange && r.exchange.trim() !== '' && r.exchange.trim() !== '.')
    return real.length > 0
  } catch {
    // NXDOMAIN / SERVFAIL / no MX -> not deliverable. Fail closed: unknown is not permission.
    return false
  }
}

/** Extract the domain from an email, lowercased. Returns '' if malformed. */
export function domainOf(email: string): string {
  const at = email.lastIndexOf('@')
  return at === -1 ? '' : email.slice(at + 1).trim().toLowerCase()
}
