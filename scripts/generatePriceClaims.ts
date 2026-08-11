// ─────────────────────────────────────────────────────────────────────────────
//  PS-PRICE-SNAPSHOT-01 — extract plan-price claims at BUILD time.
//
//  THE PROBLEM THIS SOLVES
//    Finn's pricing guard compares two things that change on DIFFERENT CLOCKS:
//      · the COPY changes at commit time      -> CI can see it
//      · the STRIPE PRICE changes in the dashboard, outside the repo, at any time
//                                             -> only a RUNNING PROD CHECK can see it
//    A CI-only guard misses the second case entirely: someone edits Growth to $349 in the Stripe
//    dashboard and every published price silently becomes wrong, with no commit to trigger CI.
//    But prod cannot read .ts sources — serverless bundles do not ship them — which is exactly how
//    the guard came to report "GREEN" over zero claims.
//
//  THE FIX
//    Extract the claims once, at build, into a tiny JSON artifact that IS bundled. Prod then has
//    real units to compare against live Stripe every day, without shipping sources.
//
//  WHY THE ARTIFACT IS COMMITTED RATHER THAN BUILD-ONLY
//    A generated file that exists only during the build cannot be typechecked, cannot be imported
//    statically with confidence, and is invisible in review. Committing it makes the claims
//    reviewable in a diff — you can SEE a price claim change in a PR — and CI enforces freshness by
//    regenerating and failing on any difference. Stale snapshot is impossible; a changed price
//    claim is visible to a human before it ships.
//
//  IT IS A SNAPSHOT OF WHAT WE CLAIM, NOT OF WHAT WE CHARGE.
//    No Stripe value is ever written here. The comparison against live Stripe happens at runtime, in
//    Finn. Baking a Stripe price into a committed file would recreate the frozen-constant problem
//    this whole agent exists to remove.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'
import { extractPriceClaims, PRICE_CLAIM_SURFACES } from '../server/os/agents/finn'

const OUT = path.resolve(process.cwd(), 'server/os/agents/priceClaims.generated.json')

export type Snapshot = {
  /** Provenance so a reader knows what produced this and from where. */
  generatedBy: string
  surfaces: string[]
  /** Surfaces that could not be read when the snapshot was taken. */
  unreadable: string[]
  claims: { file: string; plan: string; amountUsd: number; context: string }[]
}

function build(): Snapshot {
  const claims: Snapshot['claims'] = []
  const unreadable: string[] = []

  for (const rel of PRICE_CLAIM_SURFACES) {
    let text: string | null = null
    try {
      text = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8')
    } catch {
      unreadable.push(rel)
      continue
    }
    for (const c of extractPriceClaims(rel, text)) {
      claims.push({ file: c.file, plan: c.plan, amountUsd: c.amountUsd, context: c.context })
    }
  }

  // Deterministic ordering — a snapshot whose ordering wanders produces a spurious diff on every
  // build and trains reviewers to ignore it.
  claims.sort((a, b) => a.file.localeCompare(b.file) || a.plan.localeCompare(b.plan) || a.amountUsd - b.amountUsd)

  return {
    generatedBy: 'scripts/generatePriceClaims.ts — regenerate with `pnpm run claims:generate`',
    surfaces: [...PRICE_CLAIM_SURFACES],
    unreadable,
    claims,
  }
}

const snapshot = build()
const json = JSON.stringify(snapshot, null, 2) + '\n'

const check = process.argv.includes('--check')
if (check) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''
  if (current !== json) {
    console.error('\n❌ price-claim snapshot is STALE.')
    console.error('   server/os/agents/priceClaims.generated.json does not match the current copy.')
    console.error('   A published price claim changed without the snapshot being regenerated, which')
    console.error('   would leave prod comparing yesterday\'s claims against live Stripe.')
    console.error('\n   Fix: pnpm run claims:generate && git add server/os/agents/priceClaims.generated.json\n')
    process.exit(1)
  }
  console.log(`✅ price-claim snapshot fresh — ${snapshot.claims.length} claim(s) across ${snapshot.surfaces.length} surface(s)`)
} else {
  fs.writeFileSync(OUT, json)
  console.log(`wrote ${OUT} — ${snapshot.claims.length} claim(s) across ${snapshot.surfaces.length} surface(s)`)
  if (snapshot.unreadable.length) console.log(`  unreadable at generation time: ${snapshot.unreadable.join(', ')}`)
}
