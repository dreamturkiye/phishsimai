// ─────────────────────────────────────────────────────────────────────────────
//  PS-ROSTER-GUARANTEE-01 — every name on the org chart must have an executor.
//
//  WHY THIS EXISTS
//    Five ghost agents were deleted from the runtime tonight. The ORG CHART kept its own copy:
//    `L5_HIERARCHY` in the pinned core still lists Max (Chief of Staff) with two sub-agents, Blake
//    and River — none of which has a `run*Agent` — while Dex, who is built and on cron, appears
//    nowhere. The chart describes the organisation as it was this morning.
//
//  WHAT IS AND IS NOT AT RISK
//    Measured, not assumed: nothing iterates this array today. `janet.ts` and `janetReport.ts`
//    reference it zero times, `hierarchyPromptBlock()` is never called, and its only caller
//    `getDirectReports()` is used solely by `supervisorGraph.ts`, which no product file imports.
//    So the live blast radius right now is ZERO. This test is not fixing an outage.
//
//    It exists because the chart is the first thing the next seat reads to learn who exists, and
//    because the moment anything DOES iterate it — a prompt block, a supervisor graph that gets
//    wired — three names with no executor become three ghosts in a founder brief. The cheapest
//    moment to pin an invariant is before it has a consumer.
//
//  THIS IS A TRACKER, NOT A DELETER (founder decision, 2026-08-04)
//    An earlier instruction called Max, Blake and River "ghost names" to delete. Checked against
//    the specs first, and the instruction was wrong in BOTH directions:
//      · Max IS specified — KAAN_AI_OS_V7.3_ORIGINAL.md:97 lists him as Chief of Staff with a real
//        remit. Deleting him would have removed a roadmap role from the chart.
//      · Blake and River are specified NOWHERE — 0 hits across 7.4, both v7.3 files and V6. They
//        exist only in hierarchy.ts:140,151.
//    So the three are not one category, and neither is "ghost". This file therefore REPORTS the
//    gap and refuses to widen it. Building them is a future decision; deleting them is not this
//    test's business.
//
//  WHY AN ALLOWLIST AND NOT A BARE ASSERTION
//    The bare invariant fails today: `max` has no executor and `dex` has no node. Landing it as-is
//    reds the build and blocks unrelated work, and the fix is an UPSTREAM change to a core shared
//    with ScrollFuel and VellaChat that cannot be made from this repo tonight.
//
//    So the three known-stale entries are recorded HERE, with reasons, and the test asserts:
//      (a) no ghost EXISTS OUTSIDE that list — a NEW ghost fails immediately, which is the
//          regression this actually guards;
//      (b) every entry on the list is still genuinely stale — so when the upstream removal lands,
//          the stale entry fails and FORCES its own deletion. The list can only shrink.
//
//    An allowlist that silently outlives its cause is just a suppressed test. (b) is what stops
//    that, and it is the half people leave out.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { L5_HIERARCHY } from './kaan-os-core/hierarchy'

/** Every `export async function run<X>Agent` the product actually ships, read from source. */
function realExecutors(): Set<string> {
  const out = new Set<string>()
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) { if (e.name !== 'kaan-os-core' && e.name !== '__fixtures__') walk(p); continue }
      if (!e.name.endsWith('.ts') || e.name.endsWith('.test.ts')) continue
      for (const m of fs.readFileSync(p, 'utf8').matchAll(/export async function run([A-Za-z]+)Agent/g)) {
        out.add(m[1].toLowerCase())
      }
    }
  }
  walk('server/os')
  return out
}

/**
 * Node id → the executor name that satisfies it. Marcus ships as `runArchitectAgent` — the seat is
 * Marcus, the function is named for the role. Everything else is an identity match.
 */
const EXECUTOR_ALIAS: Record<string, string> = { marcus: 'architect' }

/** Janet is the CEO. She orchestrates the others rather than being one, and runs from janet.ts. */
const ORCHESTRATOR = 'janet'

/**
 * KNOWN STALE — must SHRINK to empty when the upstream hierarchy change lands.
 * Not a permanent exemption. Each entry is a live defect with a reason and an owner.
 */
const KNOWN_STALE_NODES: Record<string, string> = {
  max: 'SPECIFIED, UNBUILT. KAAN_AI_OS_V7.3_ORIGINAL.md:97 — "| Max | Chief of staff | Task routing, calendar/ops, cleanup jobs, health probes (deduped) |" (also V6:25). A real role on the roadmap. NOT a ghost, NOT to be deleted.',
  'max-briefs': 'Blake — IN CODE, IN NO SPEC. 0 hits across 7.4, both v7.3 documents and V6. Origin unknown; tracked, not deleted, pending a founder call.',
  'max-coordination': 'River — IN CODE, IN NO SPEC. Same as Blake: 0 spec hits anywhere on this machine.',
}
/** Executors that ship but have no node yet. Same contract: shrink to empty. */
const KNOWN_MISSING_NODES: Record<string, string> = {
  dex: 'Deliverability & Infrastructure — built, on cron, in both standup paths, absent from the chart.',
}

const topTier = L5_HIERARCHY.filter((n: any) => n.reportsTo === ORCHESTRATOR && n.id !== ORCHESTRATOR)
const ids = new Set(L5_HIERARCHY.map((n: any) => n.id))

describe('PS-ROSTER-GUARANTEE-01 — the org chart matches the runtime', () => {
  it('every direct report of Janet has a real run*Agent, except the recorded stale ones', () => {
    const exec = realExecutors()
    const ghosts = topTier
      .filter((n: any) => !exec.has(EXECUTOR_ALIAS[n.id] ?? n.id))
      .map((n: any) => n.id)
    // THE REGRESSION THIS GUARDS: a NEW name on the chart with nothing behind it.
    const unexpected = ghosts.filter((g) => !(g in KNOWN_STALE_NODES))
    expect(unexpected, `org-chart node(s) with no run*Agent: ${unexpected.join(', ')}`).toEqual([])
  })

  it('every shipped run*Agent appears on the chart, except the recorded missing ones', () => {
    const charted = new Set([...ids].map((i) => EXECUTOR_ALIAS[i] ?? i))
    // Only the eight domain agents + Marcus are org-chart seats. ea/sales/salesReply are internal
    // helpers, not departments, and are deliberately not asserted onto the chart.
    const SEATS = ['aria', 'dex', 'finn', 'mason', 'nova', 'rex', 'scout', 'vera', 'architect']
    const exec = realExecutors()
    const missing = SEATS.filter((s) => exec.has(s) && !charted.has(s))
    const unexpected = missing.filter((m) => !(m in KNOWN_MISSING_NODES))
    expect(unexpected, `shipped agent(s) absent from the chart: ${unexpected.join(', ')}`).toEqual([])
  })

  it('no node is orphaned — every reportsTo resolves to a node that exists', () => {
    // Once `max` is removed upstream, Blake and River become orphans and this catches them even if
    // someone forgets they were listed as stale.
    const orphans = L5_HIERARCHY
      .filter((n: any) => n.id !== ORCHESTRATOR && n.reportsTo && !ids.has(n.reportsTo))
      .map((n: any) => `${n.id} -> ${n.reportsTo}`)
    expect(orphans).toEqual([])
  })

  it('the stale list can only SHRINK — a fixed entry must be deleted, not left behind', () => {
    // Without this, the allowlist outlives its cause and the test quietly stops meaning anything.
    const exec = realExecutors()
    for (const id of Object.keys(KNOWN_STALE_NODES)) {
      const node = L5_HIERARCHY.find((n: any) => n.id === id)
      expect(
        node && !exec.has(EXECUTOR_ALIAS[id] ?? id),
        `'${id}' is listed as stale but is no longer stale — delete it from KNOWN_STALE_NODES`,
      ).toBe(true)
    }
    for (const id of Object.keys(KNOWN_MISSING_NODES)) {
      expect(
        !ids.has(id),
        `'${id}' is listed as missing from the chart but is now on it — delete it from KNOWN_MISSING_NODES`,
      ).toBe(true)
    }
  })

  it('records exactly what is stale today, so the count cannot drift unnoticed', () => {
    expect(Object.keys(KNOWN_STALE_NODES).sort()).toEqual(['max', 'max-briefs', 'max-coordination'])
    expect(Object.keys(KNOWN_MISSING_NODES)).toEqual(['dex'])
  })
})

describe('THE TRACKER — report the gap in numbers, so it stays visible', () => {
  it('reports built vs unbuilt across the whole chart', () => {
    const exec = realExecutors()
    const built = L5_HIERARCHY.filter((n: any) => n.id !== ORCHESTRATOR && exec.has(EXECUTOR_ALIAS[n.id] ?? n.id))
    const unbuilt = L5_HIERARCHY.filter((n: any) => n.id !== ORCHESTRATOR && !exec.has(EXECUTOR_ALIAS[n.id] ?? n.id))
    // Measured, not asserted from an instruction. If these numbers move, the change was deliberate.
    // eslint-disable-next-line no-console
    console.log(
      `[roster] ${built.length} built / ${unbuilt.length} unbuilt of ${L5_HIERARCHY.length - 1} charted roles` +
      ` · unbuilt: ${unbuilt.map((n: any) => n.id).join(', ')}` +
      ` · shipped-but-uncharted: ${[...realExecutors()].filter((e) => ['dex'].includes(e)).join(', ') || 'none'}`,
    )
    expect(built.length).toBeGreaterThan(0)
    expect(built.length + unbuilt.length).toBe(L5_HIERARCHY.length - 1)
  })

  it('Max, Blake and River remain ON the chart — this test must never delete a role', () => {
    for (const id of ['max', 'max-briefs', 'max-coordination']) {
      expect(ids.has(id), `${id} was removed from the chart; the tracker does not authorise that`).toBe(true)
    }
  })
})
