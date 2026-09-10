// Canonical roster is AGENT_REGISTRY from @kaan/os-core. The vendored
// server/os/kaan-os-core/hierarchy.ts snapshot still lists Max and is classified
// legacy-product-diverged-pre-v7 — it is not the runtime org.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { AGENT_IDS, WORKER_AGENT_IDS } from '@kaan/os-core'
import { AGENTS } from '../lib/kaan_os_v4'

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

const EXECUTOR_ALIAS: Record<string, string> = { marcus: 'architect' }

describe('PS-ROSTER-GUARANTEE-01 — runtime roster is Janet + nine workers', () => {
  it('core and product AGENTS match and exclude Max', () => {
    expect(Object.keys(AGENTS).sort()).toEqual([...AGENT_IDS].sort())
    expect(WORKER_AGENT_IDS).toContain('dex')
    expect(WORKER_AGENT_IDS).not.toContain('max')
    expect((AGENTS as Record<string, unknown>).max).toBeUndefined()
    expect(AGENTS.dex.id).toBe('dex')
  })

  it('every worker seat except Marcus has a run*Agent, and Marcus ships as architect', () => {
    const exec = realExecutors()
    for (const id of WORKER_AGENT_IDS) {
      const executor = EXECUTOR_ALIAS[id] ?? id
      expect(exec.has(executor), `${id} has no run*Agent (${executor})`).toBe(true)
    }
    expect(exec.has('dex')).toBe(true)
    expect(exec.has('max')).toBe(false)
  })
})
