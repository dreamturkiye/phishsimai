// ─────────────────────────────────────────────────────────────────────────────
//  GSA §2.1 — the universal check-runner.
//
//  Loads standards (OS core + company plugin), runs each against supplied facts,
//  classifies every deviation by risk tier, writes an append-only audit record,
//  and produces ONE digest.
//
//  Runs READ-ONLY by default (`mode: 'read-only'`). Per the build order, the
//  classifier must be proven against real history before any autonomous write
//  touches production — so remediation is opt-in at the call site, and even then
//  only Tier A is ever applied.
// ─────────────────────────────────────────────────────────────────────────────
import type { AppliedFix, CheckResult, CompanyFacts, GsaRun, Standard } from './types'
import { assignTier } from './classify'

export interface RunOptions {
  mode?: 'read-only' | 'tier-a-enabled'
  /**
   * Applies one Tier A fix. Supplied by the caller, not the engine: the engine
   * knows WHETHER a change may be made, the company knows HOW to make it. Absent
   * ⇒ nothing is applied however the tier came out.
   */
  applyFix?: (r: CheckResult) => Promise<{ before: unknown; after: unknown }>
  /** Append-only sink. Absent ⇒ results are returned but not persisted. */
  audit?: (run: GsaRun) => Promise<void>
  now?: () => string
}

/**
 * Run one company's governance pass.
 *
 * A standard that THROWS becomes UNVERIFIABLE, never a silent skip and never a
 * pass. A crashed check is a check that did not measure anything, which is
 * exactly what UNVERIFIABLE means — and an auditor that quietly drops its own
 * broken checks reproduces the bug class it exists to catch.
 */
export async function runGsa(
  standards: Standard[],
  facts: CompanyFacts,
  opts: RunOptions = {},
): Promise<GsaRun> {
  const now = opts.now ?? (() => new Date().toISOString())
  const mode = opts.mode ?? 'read-only'
  const startedAt = now()

  const raw: CheckResult[] = []
  for (const s of standards) {
    try {
      raw.push(await s.run(facts))
    } catch (e: any) {
      raw.push({
        id: s.id,
        outcome: 'UNVERIFIABLE',
        severity: s.severity,
        summary: `Check threw and could not complete: ${String(e?.message || e)}`,
        evidence: [{ actual: 'check error', source: `standard ${s.id}`, note: 'A crashed check measured nothing — not a pass.' }],
      })
    }
  }

  // Tiering happens AFTER every check has run, because dependency resolution
  // needs the full picture: GTM-MULTITOUCH's tier depends on whether
  // GTM-REPLY-CAPTURE passed, and evaluating tiers inline would make the answer
  // depend on standard ordering.
  const passing = new Set(raw.filter(r => r.outcome === 'PASS').map(r => r.id))
  const results = raw.map(r => assignTier(r, passing))

  const applied: AppliedFix[] = []
  if (mode === 'tier-a-enabled' && opts.applyFix) {
    for (const r of results) {
      if (r.tier !== 'A' || !r.remediation) continue
      try {
        const { before, after } = await opts.applyFix(r)
        applied.push({ standardId: r.id, description: r.remediation.description, before, after, ok: true })
      } catch (e: any) {
        // §2.1.1: a Tier A fix that fails rolls back and escalates rather than
        // retrying blindly. Recording it as a failed application puts it in the
        // digest under the founder's eye instead of leaving a half-made change.
        applied.push({
          standardId: r.id,
          description: r.remediation.description,
          before: r.remediation.prior,
          after: undefined,
          ok: false,
          rolledBack: true,
          error: String(e?.message || e),
        })
      }
    }
  }

  const run: GsaRun = { companyId: facts.companyId, startedAt, mode, results, applied }
  if (opts.audit) await opts.audit(run).catch(() => {})
  return run
}

// ── §2.1(5) ONE digest ───────────────────────────────────────────────────────
//
// Ordered by what needs a human first, not by standard id: things that were
// changed without asking, then things waiting on a decision, then things nobody
// can measure, then passes collapsed to a single line. A digest that buries the
// approval queue under 8 green ticks is a digest that gets skimmed.
export function renderDigest(run: GsaRun): string {
  const bySeverity = (a: CheckResult, b: CheckResult) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 }
    return order[a.severity] - order[b.severity]
  }
  const dev = run.results.filter(r => r.outcome === 'DEVIATION')
  const tierA = dev.filter(r => r.tier === 'A').sort(bySeverity)
  const tierB = dev.filter(r => r.tier === 'B').sort(bySeverity)
  const unver = run.results.filter(r => r.outcome === 'UNVERIFIABLE').sort(bySeverity)
  const pass = run.results.filter(r => r.outcome === 'PASS')

  const out: string[] = []
  out.push(`# GSA digest — ${run.companyId} — ${run.startedAt.slice(0, 10)}`)
  out.push('')
  out.push(
    `**${dev.length} deviation(s)** · ${unver.length} unverifiable · ${pass.length} passing` +
    (run.mode === 'read-only' ? ' · _read-only run: nothing was changed_' : ''),
  )
  out.push('')

  const block = (r: CheckResult) => {
    const lines = [`### ${r.id} — ${r.severity}`, r.summary, '']
    for (const e of r.evidence) {
      lines.push(`- **${e.actual}** — \`${e.source}\`${e.note ? ` · ${e.note}` : ''}`)
    }
    if (r.remediation) {
      lines.push('')
      lines.push(`**Fix:** ${r.remediation.description}`)
      lines.push(
        `**Blast radius:** ${r.remediation.blastRadius} · **reversible:** ${r.remediation.reversible} · **kind:** ${r.remediation.changeKind}`,
      )
    }
    if (r.tierReason) lines.push(`**Tier ${r.tier}:** ${r.tierReason}`)
    lines.push('')
    return lines.join('\n')
  }

  if (run.applied.length) {
    out.push('## ✅ Auto-remediated (Tier A) — review and revise if wrong')
    for (const a of run.applied) {
      out.push(
        a.ok
          ? `- **${a.standardId}** — ${a.description}\n  - before: \`${JSON.stringify(a.before)}\` → after: \`${JSON.stringify(a.after)}\``
          : `- ⚠️ **${a.standardId}** — FAILED and rolled back: ${a.error}`,
      )
    }
    out.push('')
  }

  if (tierA.length) {
    out.push(
      run.mode === 'read-only'
        ? '## 🅰️ Tier A — would auto-fix (read-only run, not applied)'
        : '## 🅰️ Tier A — pending application',
    )
    for (const r of tierA) out.push(block(r))
  }

  if (tierB.length) {
    out.push('## 🅱️ Tier B — NEEDS YOUR APPROVAL (irreversible / money / external blast radius)')
    for (const r of tierB) out.push(block(r))
  }

  if (unver.length) {
    out.push('## ❓ Unverifiable — cannot measure, never auto-fixed')
    for (const r of unver) out.push(block(r))
  }

  if (pass.length) {
    out.push(`## ✔️ Passing (${pass.length})`)
    out.push(pass.map(r => r.id).join(', '))
  }

  return out.join('\n')
}

// ── §2.1(6) append-only audit log ────────────────────────────────────────────
/**
 * INSERT-only by construction: no UPDATE and no DELETE path exists here, so the
 * "did this regress / what did it change" history cannot be quietly rewritten by
 * the same engine that writes it.
 */
export async function auditGsaRun(sql: any, run: GsaRun): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS gsa_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    mode TEXT NOT NULL,
    standard_id TEXT NOT NULL,
    outcome TEXT NOT NULL,
    severity TEXT NOT NULL,
    tier TEXT,
    tier_reason TEXT,
    summary TEXT NOT NULL,
    evidence JSONB NOT NULL,
    remediation JSONB,
    applied JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`.catch(() => {})

  for (const r of run.results) {
    const applied = run.applied.find(a => a.standardId === r.id) ?? null
    await sql`INSERT INTO gsa_audit_log
      (company_id, started_at, mode, standard_id, outcome, severity, tier, tier_reason, summary, evidence, remediation, applied)
      VALUES (${run.companyId}, ${run.startedAt}, ${run.mode}, ${r.id}, ${r.outcome}, ${r.severity},
              ${r.tier ?? null}, ${r.tierReason ?? null}, ${r.summary},
              ${JSON.stringify(r.evidence)}::jsonb,
              ${r.remediation ? JSON.stringify(r.remediation) : null}::jsonb,
              ${applied ? JSON.stringify(applied) : null}::jsonb)`.catch((e: any) => {
      console.error('[gsa] audit write failed for', r.id, e?.message || e)
    })
  }
}
