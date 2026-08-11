// ─────────────────────────────────────────────────────────────────────────────
//  PS-DEPLOY-VERIFY-01 — the writer that makes "zero blind deploys" measurable.
//
//  THE HOLE: posture probe 7 ("zero blind deploys") counted rows in deploy_verifications with
//  match=false. Nothing ever wrote to that table — three readers, zero writers, zero rows — so
//  the count was always 0 and the criterion passed on ABSENCE of evidence. That is the exact
//  shape this codebase keeps finding: an instrument that reports nothing, read as a pass. A
//  criterion that cannot fail is worse than no criterion, because it looks like coverage.
//
//  WHAT A VERIFIED DEPLOY IS, here. We do NOT have a Vercel management-API token in this runtime
//  (only build-time VERCEL_GIT_* / OIDC vars are injected), so we cannot list a project's domain
//  mappings. We verify the stronger, more direct property the posture criterion actually cares
//  about — "the running production origin is OUR app, at OUR domain, and not the other product
//  sharing this Vercel team". That is checked against the live artifact, not the config:
//
//    • the expected origin (phishsimai.com) responds 2xx;
//    • its HTML carries a PhishSim brand marker;
//    • it carries NONE of ScrollFuel's markers — the specific cross-wiring CLAUDE.md exists to
//      prevent (two products, one Vercel team, one wrong alias away from serving each other).
//
//  match=true only when all three hold. A confident WRONG answer (2xx, but the content is not
//  ours / is the other product's) is match=false — a real, day-voiding mismatch. A TRANSIENT
//  failure (network error, 5xx, timeout) writes NO row: it is not evidence of a mismatch, it is
//  absence of evidence, and the honest posture fix already treats a day with no row as
//  `unmeasured`. Running hourly means one good check in the day is enough, while a full-day
//  outage correctly leaves the day unmeasured rather than falsely clean.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from './conn'
import { COMPANY_ID } from './version'

export const EXPECTED_DOMAIN = 'phishsimai.com'
export const EXPECTED_ORIGIN = `https://${EXPECTED_DOMAIN}`

// Present ⇒ this is our app. Kept broad and lowercased; the home + app shell both carry the brand.
const PHISHSIM_MARKERS = ['phishsim'] as const
// Absent ⇒ good. These are ScrollFuel / its OS-layer surface — if ANY appears at phishsimai.com,
// the alias is cross-wired to the wrong project. Names, not guesses: taken from the ScrollFuel
// schema and product surface documented in CLAUDE.md and the incident handoff.
const CROSS_PRODUCT_MARKERS = ['scrollfuel', 'fanvue', 'fanagentio'] as const

export type DeployEvidence = {
  reachable: boolean
  status: number | null
  brandPresent: boolean
  crossHits: string[]
  finalUrl: string | null
}

export type DeployVerdict =
  | { measured: false; reason: string; evidence: DeployEvidence }              // no row written
  | { measured: true; match: boolean; reason: string; evidence: DeployEvidence } // row written

/** Pure: given fetched HTML + status, decide the three properties. No I/O, so it is unit-testable. */
export function judgeDeployHtml(status: number, html: string, finalUrl: string | null): DeployEvidence {
  const body = (html || '').toLowerCase()
  const brandPresent = PHISHSIM_MARKERS.some(m => body.includes(m))
  const crossHits = CROSS_PRODUCT_MARKERS.filter(m => body.includes(m))
  return { reachable: true, status, brandPresent, crossHits, finalUrl }
}

/**
 * Fetch the live origin and produce a verdict. NEVER throws — a fetch failure becomes an
 * unmeasured verdict, not an exception, because this runs on a cron and must not 500 the slot.
 */
export async function probeDeployTarget(origin = EXPECTED_ORIGIN, timeoutMs = 15_000): Promise<DeployVerdict> {
  const emptyEvidence: DeployEvidence = { reachable: false, status: null, brandPresent: false, crossHits: [], finalUrl: null }
  let res: Response
  try {
    res = await fetch(origin, { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  } catch (e: any) {
    // Network error / timeout — the origin could not be read. Absence of evidence, not a mismatch.
    return { measured: false, reason: `unreachable: ${String(e?.message || e).slice(0, 100)}`, evidence: emptyEvidence }
  }
  if (res.status >= 500) {
    // A 5xx is prod being unwell, not prod being the wrong app. Do not write a mismatch for it.
    return { measured: false, reason: `origin ${res.status} — transient, not a mismatch`, evidence: { ...emptyEvidence, reachable: true, status: res.status, finalUrl: res.url } }
  }
  const html = await res.text().catch(() => '')
  const evidence = judgeDeployHtml(res.status, html, res.url)

  // A confident answer. 2xx/3xx-resolved AND readable content: now the content decides.
  const okStatus = res.status >= 200 && res.status < 400
  const match = okStatus && evidence.brandPresent && evidence.crossHits.length === 0
  const reason = !okStatus
    ? `origin returned ${res.status}`
    : evidence.crossHits.length
      ? `CROSS-WIRED: ${evidence.crossHits.join(', ')} present at ${EXPECTED_DOMAIN}`
      : !evidence.brandPresent
        ? `no PhishSim brand marker at ${EXPECTED_DOMAIN} — served the wrong app?`
        : `verified: ${EXPECTED_DOMAIN} serves PhishSim, no cross-product markers`
  return { measured: true, match, reason, evidence }
}

export type DeployVerifyResult = { written: boolean; match: boolean | null; reason: string; evidence: DeployEvidence }

/**
 * Verify the deploy target and, when the answer is confident, persist one row. Best-effort on the
 * write itself (a ledger outage must not take down the check), but the verdict is always returned.
 *
 * WHO writes / WHEN: the /api/os/deploy-verify cron, hourly. Hourly (not once/day) so a single
 * transient failure at a fixed time cannot leave a whole day unmeasured, and so that by the time
 * the 06:30 clean-day compute judges YESTERDAY, yesterday already holds ~24 confirmations.
 */
export async function verifyDeployTarget(sqlOverride?: any, origin = EXPECTED_ORIGIN): Promise<DeployVerifyResult> {
  const verdict = await probeDeployTarget(origin)
  if (!verdict.measured) {
    // Deliberately write nothing. The honest posture probe reads "no row for the day" as
    // unmeasured; a transient failure must land there, not as a fabricated match=false.
    console.warn(`[deploy-verify] UNMEASURED — ${verdict.reason} (no row written)`)
    return { written: false, match: null, reason: verdict.reason, evidence: verdict.evidence }
  }
  const sql = sqlOverride ?? getSql()
  const vercelProjectId = process.env.VERCEL_GIT_REPO_SLUG || process.env.VERCEL_PROJECT_ID || 'phishsimai'
  try {
    await sql`
      INSERT INTO deploy_verifications (product_id, vercel_project_id, expected_domain, actual_domains, match)
      VALUES (${COMPANY_ID}, ${vercelProjectId}, ${EXPECTED_DOMAIN},
              ${JSON.stringify({ finalUrl: verdict.evidence.finalUrl, status: verdict.evidence.status, brandPresent: verdict.evidence.brandPresent, crossHits: verdict.evidence.crossHits })}::jsonb,
              ${verdict.match})`
    console.log(`[deploy-verify] ${verdict.match ? 'MATCH' : 'MISMATCH'} — ${verdict.reason}`)
  } catch (e: any) {
    console.error(`[deploy-verify] row write failed: ${String(e?.message || e).slice(0, 120)}`)
    return { written: false, match: verdict.match, reason: `${verdict.reason} (row write FAILED)`, evidence: verdict.evidence }
  }
  return { written: true, match: verdict.match, reason: verdict.reason, evidence: verdict.evidence }
}
