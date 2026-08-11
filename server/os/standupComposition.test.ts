// PS-ORG-COMPOSE-01 — the standup reads all eight agents, and no deleted ghost.
//
// WHY THIS EXISTS AS A TEST RATHER THAN A REVIEW NOTE
//   Every agent was verified in isolation and every one passed. The whole-branch review still found
//   three defects that no per-agent test could have caught, because each is a property of the
//   COMPOSITION rather than of any single agent:
//
//     1. Aria ran on her own cron and was called by the standup, but her line was never interpolated
//        into Janet's prompt. An agent that runs and reports to nobody is indistinguishable from one
//        that does not run — and it costs the same.
//     2. The weekly founder report called 5 of 8. It had inherited only the slots the deleted ghosts
//        occupied, so it carried no funnel-trust verdict, no deliverability and no sales operator.
//     3. A stray `score` token survived the cs.retentionScore edit and was being sent to the model.
//
//   The lesson generalises: replacing a ghost in-place fixes the CALL but does not fix the REPORT.
//   These assertions fail the build if a future agent is added to the fan-out and forgotten in the
//   prompt, or if a ghost name ever returns.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const DAILY = 'server/os/janet.ts'
const WEEKLY = 'server/os/janetReport.ts'

/** The eight, as (call, prompt-variable) pairs. */
const AGENTS: { name: string; call: string; varName: string }[] = [
  { name: 'Rex', call: 'runRexAgent', varName: 'rex' },
  { name: 'Dex', call: 'runDexAgent', varName: 'dex' },
  { name: 'Aria', call: 'runAriaAgent', varName: 'aria' },
  { name: 'Mason', call: 'runMasonAgent', varName: 'mason' },
  { name: 'Scout', call: 'runScoutAgent', varName: 'scout' },
  { name: 'Finn', call: 'runFinnAgent', varName: 'finn' },
  { name: 'Vera', call: 'runVeraAgent', varName: 'vera' },
  { name: 'Nova', call: 'runNovaAgent', varName: 'nova' },
]

const GHOST_MODULES = ['marketing', 'product', 'research', 'finance', 'customerSuccess']
const GHOST_CALLS = ['runMarketingAgent', 'runProductAgent', 'runResearchAgent', 'runFinanceAgent', 'runCSAgent']

const read = (f: string) => fs.readFileSync(f, 'utf8')

describe('every deleted ghost is gone from both standup paths', () => {
  for (const f of [DAILY, WEEKLY]) {
    it(`${f} imports no ghost module`, () => {
      for (const g of GHOST_MODULES) expect(read(f), `${f} imports agents/${g}`).not.toContain(`from './agents/${g}'`)
    })

    it(`${f} calls no ghost function`, () => {
      for (const c of GHOST_CALLS) expect(read(f), `${f} calls ${c}`).not.toContain(`${c}(`)
    })
  }

  it('the ghost source files do not exist', () => {
    for (const g of GHOST_MODULES) expect(fs.existsSync(`server/os/agents/${g}.ts`), g).toBe(false)
  })

  it('no stale ghost field is interpolated anywhere in either path', () => {
    // These were the actual constants being rendered to a human every morning.
    const stale = ['finance.mrr', 'finance.customers', 'finance.nextMilestone', 'cs.retentionScore', 'product.topFeature', 'research.icpNote']
    for (const f of [DAILY, WEEKLY]) {
      for (const s of stale) expect(read(f), `${f} still renders ${s}`).not.toContain(s)
    }
  })
})

describe('all eight agents are CALLED by both standup paths', () => {
  for (const a of AGENTS) {
    it(`${a.name} is called in the daily standup`, () => {
      expect(read(DAILY)).toContain(`${a.call}(`)
    })

    it(`${a.name} is called in the weekly report`, () => {
      // Defect 2: this file called 5 of 8 and nothing noticed.
      expect(read(WEEKLY)).toContain(`${a.call}(`)
    })
  }
})

describe('all eight agents REACH the prompt — running is not reporting', () => {
  /** Grab the template literal that is handed to the model. */
  function promptOf(file: string): string {
    const src = read(file)
    const start = src.indexOf('const prompt = `')
    expect(start, `${file} has no prompt template`).toBeGreaterThan(-1)
    // Everything from the prompt start to the closing backtick before the try block.
    const rest = src.slice(start)
    const end = rest.indexOf('`\n\n  let')
    return end > -1 ? rest.slice(0, end) : rest.slice(0, 4000)
  }

  for (const a of AGENTS) {
    it(`${a.name}'s line is interpolated into the daily prompt`, () => {
      const p = promptOf(DAILY)
      const src = read(DAILY)
      // Either interpolated directly, or via a named block that is itself interpolated (Rex).
      const direct = new RegExp(`\\$\\{[^}]*\\b${a.varName}\\b`).test(p)
      const viaBlock = new RegExp(`\\$\\{${a.varName}Block\\}`).test(p) && new RegExp(`const ${a.varName}Block`).test(src)
      expect(direct || viaBlock, `${a.name} runs but never reaches Janet's prompt`).toBe(true)
    })

    it(`${a.name}'s line is interpolated into the weekly prompt`, () => {
      const p = promptOf(WEEKLY)
      expect(new RegExp(`\\$\\{[^}]*\\b${a.varName}\\b`).test(p), `${a.name} runs but never reaches the weekly report`).toBe(true)
    })
  }
})

describe('the prompts carry no orphaned tokens', () => {
  it('no dangling word survives a replaced interpolation', () => {
    // Defect 3: `CS: ${cs.retentionScore}% retention score` was edited to drop the variable and left
    // a bare "score" trailing the new line, which was being sent to the model.
    for (const f of [DAILY, WEEKLY]) {
      const src = read(f)
      // The shape is specifically: a ternary FALLBACK STRING closing (…'}) followed by a bare word.
      // Matching any `}` + word is too broad and false-positives on legitimate label text such as
      // `${sales.customers} customers`, where the trailing word is the unit, not debris. The first
      // version of this test did exactly that — a check that cries wolf gets deleted, not heeded.
      const orphans = [...src.matchAll(/'\}\s+([a-z]+)\s*$/gm)].map((m) => m[0].trim())
      expect(orphans, `${f} has an orphaned token after an interpolation`).toEqual([])
    }
  })
})

describe('the cron chain covers every agent exactly once', () => {
  const vercel = JSON.parse(read('vercel.json'))
  const paths: string[] = vercel.crons.map((c: any) => c.path)

  for (const a of AGENTS) {
    it(`${a.name} has exactly one cron entry`, () => {
      const p = `/api/os/${a.varName}`
      expect(paths.filter((x) => x === p), `${p} should appear exactly once`).toHaveLength(1)
    })
  }

  it('all eight land before Janet reads them at 08:00', () => {
    const minute = (s: string) => {
      const [m, h] = s.split(/\s+/)
      return Number(h) * 60 + Number(m)
    }
    const at = (p: string) => minute(vercel.crons.find((c: any) => c.path === p).schedule)
    const janet = at('/api/os/janet')
    for (const a of AGENTS) {
      expect(at(`/api/os/${a.varName}`), `${a.name} must run before the standup reads it`).toBeLessThan(janet)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  PS-JANET-DEPTH-01 — the team block must be GROUNDED and BEHAVIOURAL.
//
//  Gap 3 arrived as "deepen the 8 agents' prompts". Checked first: the eight agents call
//  llmComplete ZERO times — they are deterministic analysts, and there is no prompt to deepen.
//  Janet is the only agent that reasons from a prompt, so she is the only place where depth can
//  change an output at all.
//
//  The bar these tests hold: every element must trace to something REAL in this business (an
//  agent's actual ownership, an actual deferral rule, an actual report shape) and must change what
//  Janet DOES — not read richer. Generic domain expertise in a prompt is persona-as-theater.
// ─────────────────────────────────────────────────────────────────────────────
describe('PS-JANET-DEPTH-01 — grounded ownership, not generic role names', () => {
  const SYSTEM = read(DAILY)
  it('names all eight specialists by name, not by generic department', () => {
    for (const n of ['Rex', 'Dex', 'Aria', 'Mason', 'Finn', 'Vera', 'Nova', 'Scout']) {
      expect(SYSTEM, `${n} missing from the team block`).toContain(n)
    }
  })

  it('states the ownership rule that changes what Janet may quote', () => {
    expect(SYSTEM).toContain('quote a number ONLY from the agent that owns it')
  })

  it('encodes foundation-first fail-closed as CORRECT behaviour, not breakage', () => {
    // Without this Janet reports a stood-down dependent as a failure and escalates the wrong thing.
    expect(SYSTEM).toContain('FOUNDATION FIRST')
    expect(SYSTEM).toContain('FAIL CLOSED')
  })

  it('distinguishes a deferral from silence — mason.ts:23-24 made this real', () => {
    expect(SYSTEM).toContain('DEFERRAL IS A REPORT, NOT SILENCE')
    expect(SYSTEM).toContain('Escalate the')
  })

  it('forbids filling a NOT CHECKED gap with a prior figure or an inference', () => {
    expect(SYSTEM).toContain('NOT CHECKED IS NOT ZERO AND NOT CLEAN')
    expect(SYSTEM).toMatch(/may not fill that gap/i)
  })

  it("carries Rex's veto — a suspect metric may not be quoted however confident another agent is", () => {
    expect(SYSTEM).toMatch(/if rex says a metric is suspect/i)
  })

  it('does NOT recite generic domain expertise (the eloquent-hollow failure)', () => {
    // Named frameworks the agents do not actually implement would be recited authority, not reasoning.
    for (const generic of ['MEDDIC', 'BANT', 'SPIN selling', 'AIDA', 'best practice']) {
      expect(SYSTEM.toLowerCase(), `generic expertise leaked in: ${generic}`).not.toContain(generic.toLowerCase())
    }
  })

  it('drops the stale generic list that named departments the roster does not have', () => {
    expect(SYSTEM).not.toContain('Sales, Marketing, Product, Research, Finance, CS, EA')
  })
})
