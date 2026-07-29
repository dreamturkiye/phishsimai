// ─────────────────────────────────────────────────────────────────────────────
//  PS-RATCHET-01 — recallMemory filters `source` in SQL, not after the LIMIT.
//
//  The bug: getAgentMemory did
//      recallMemory(c, undefined, 20).then(m => m.filter(x => x.source === agentId))
//  a filter applied AFTER a company-wide LIMIT 20. Measured on prod 2026-07-26 the
//  20 newest rows were janet 11 / founder_hq 6 / architect 1 / founder 1 /
//  marcus_watcher 1 — so Aria's own rows: ZERO. Every non-Janet agent's "Knowledge
//  base" was silently empty, and the UNVERIFIED-SELF-REPORT labelling written by the
//  standup loop was never read by the agent it was written for.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest'

const queries: string[] = []
const params: any[][] = []
vi.mock('./conn', () => ({
  getSql: () => {
    const fn = async (strings: TemplateStringsArray, ...vals: any[]) => {
      queries.push(strings.join(' ? ').replace(/\s+/g, ' '))
      params.push(vals)
      return []
    }
    return fn as any
  },
}))

const { recallMemory } = await import('./memory')

beforeEach(() => { queries.length = 0; params.length = 0 })

describe('recallMemory — source is a SQL predicate', () => {
  it('pushes the source filter into the query so LIMIT counts THAT agent\'s rows', async () => {
    await recallMemory('phishsimai', undefined, 20, 'aria')
    const q = queries.find(s => /FROM janet_memory/.test(s))!
    expect(q).toMatch(/source\s*=/)
    expect(q).toMatch(/company_id\s*=/)
    expect(params.at(-1)).toContain('aria')
  })

  it('still scopes by company_id when source is given — never one instead of the other', async () => {
    await recallMemory('phishsimai', 'operating', 20, 'aria')
    const q = queries.find(s => /FROM janet_memory/.test(s))!
    expect(q).toMatch(/company_id\s*=/)
    expect(q).toMatch(/type\s*=/)
    expect(q).toMatch(/source\s*=/)
  })

  it('omitting source keeps the old company-wide behaviour for callers that want it', async () => {
    await recallMemory('phishsimai', undefined, 20)
    const q = queries.find(s => /FROM janet_memory/.test(s))!
    expect(q).toMatch(/company_id\s*=/)
    expect(q).not.toMatch(/source\s*=/)
  })
})
