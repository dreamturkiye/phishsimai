// ─────────────────────────────────────────────────────────────────────────────
//  GSA §2.1(1) — the scheduled entry point for PhishSim.
//
//  READ-ONLY BY DEFAULT and hard-wired that way for now: per the build order,
//  the classifier must be proven against real history before any autonomous
//  write touches production. `applyFix` is deliberately NOT supplied here, so
//  even a caller that passed `mode: 'tier-a-enabled'` would apply nothing —
//  enabling Tier A is a separate, deliberate edit rather than a flag someone can
//  flip by accident.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from '../conn'
import { sendTelegram } from '../telegram'
import { runGsa, renderDigest, auditGsaRun } from './engine'
import { UNIVERSAL_STANDARDS } from './standards/core'
import { PHISHSIM_STANDARDS } from './standards/phishsim'
import { gatherPhishSimFacts } from './adapters/phishsim'
import type { GsaRun } from './types'

export const GSA_VERSION = 'kaan-os-7.4 · gsa-engine-1.0 · phishsim-gsa-1.0'

export async function runPhishSimGsa(opts: { baseUrl?: string; probeHttp?: boolean } = {}): Promise<GsaRun> {
  const facts = await gatherPhishSimFacts(opts)
  const sql = getSql()
  return await runGsa([...UNIVERSAL_STANDARDS, ...PHISHSIM_STANDARDS], facts, {
    mode: 'read-only',
    audit: (run) => auditGsaRun(sql, run),
  })
}

/** Cron handler. One digest per run (§2.1(5)). */
export async function cronGsa(req: any, res: any) {
  try {
    const run = await runPhishSimGsa({ baseUrl: process.env.PUBLIC_BASE_URL || 'https://phishsimai.com' })
    const md = renderDigest(run)

    const dev = run.results.filter(r => r.outcome === 'DEVIATION').length
    const unv = run.results.filter(r => r.outcome === 'UNVERIFIABLE').length
    const tierB = run.results.filter(r => r.tier === 'B').length

    // Telegram gets the headline and the approval queue; the full digest with all
    // evidence lives in gsa_audit_log. A digest nobody reads is not a digest.
    await sendTelegram(
      `🛡️ <b>GSA — PhishSim</b> (${GSA_VERSION})\n` +
      `${dev} deviation(s) · ${unv} unverifiable · ${run.results.filter(r => r.outcome === 'PASS').length} passing\n` +
      (tierB ? `⚠️ ${tierB} awaiting your approval (Tier B)\n` : '') +
      run.results
        .filter(r => r.outcome !== 'PASS')
        .slice(0, 6)
        .map(r => `• [${r.outcome === 'UNVERIFIABLE' ? '?' : `T${r.tier}`}] ${r.id}: ${r.summary.slice(0, 110)}`)
        .join('\n'),
    ).catch(() => {})

    return res.json({ ok: true, version: GSA_VERSION, mode: run.mode, deviations: dev, unverifiable: unv, digest: md })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
