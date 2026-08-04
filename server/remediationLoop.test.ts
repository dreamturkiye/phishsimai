// ─────────────────────────────────────────────────────────────────────────────
//  PS-REMEDIATION-01 — the auto-remediation loop: fail -> enroll -> complete -> recorded.
//
//  Completion RECORDING already existed but was self-serve; a failed simulation enrolled no one.
//  This build adds the enroll step and links completion back to it. These tests pin the loop and
//  the anti-fabrication rule: an open assignment reads "not completed", never a fabricated done.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { ATTACK_TYPE_TO_CATEGORY, FALLBACK_CATEGORY } from './db'

describe('the attack-type -> module-category map is complete and deterministic', () => {
  it('covers EVERY attackType the schema enum defines — no failure type unmapped', () => {
    const schema = fs.readFileSync('drizzle/schema.ts', 'utf8')
    const enumLine = schema.match(/pgEnum\("attack_type",\s*\[([^\]]+)\]/s)?.[1] ?? ''
    const types = [...enumLine.matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
    expect(types.length).toBeGreaterThan(0)
    for (const t of types) {
      expect(ATTACK_TYPE_TO_CATEGORY[t], `attackType '${t}' has no mapped training category`).toBeTruthy()
    }
  })

  it('maps to categories that actually exist in the seeded modules', () => {
    const mods = JSON.parse(fs.readFileSync('server/seed_modules.json', 'utf8')) as Array<{ category: string }>
    const cats = new Set(mods.map((m) => m.category))
    for (const c of new Set(Object.values(ATTACK_TYPE_TO_CATEGORY))) {
      expect(cats.has(c), `mapped category '${c}' exists in no module`).toBe(true)
    }
    expect(cats.has(FALLBACK_CATEGORY), 'fallback category must exist as a seeded module').toBe(true)
  })
})

describe('the enroll step is wired to BOTH failure events', () => {
  const tracker = fs.readFileSync('server/email/tracker.ts', 'utf8')
  it('a click enrolls (sim_click)', () => {
    expect(tracker).toContain('assignTrainingForToken(req.params.token, "sim_click")')
  })
  it('a credential submit enrolls (sim_submit)', () => {
    expect(tracker).toContain('assignTrainingForToken(req.params.token, "sim_submit")')
  })
  it('enrollment is best-effort — it never blocks the recipient response', () => {
    // .catch(() => {}) not awaited into the response path.
    expect(tracker).toMatch(/assignTrainingForToken\([^)]*"sim_click"\)\.catch\(\(\) => \{\}\)/)
  })
})

describe('anti-fabrication: no completion is ever invented', () => {
  const db = fs.readFileSync('server/db.ts', 'utf8')
  const sql = fs.readFileSync('drizzle/pg/0023_training_assignments.sql', 'utf8')

  it('completedAt is nullable and defaults to nothing (enrolled != completed)', () => {
    expect(sql).toMatch(/"completedAt"\s+TIMESTAMPTZ\s*;?\s*$/m)
    expect(sql).not.toMatch(/"completedAt"[^\n]*DEFAULT/i)
  })

  it('assignTrainingForToken returns null rather than writing a phantom when no module exists', () => {
    const fn = db.slice(db.indexOf('export async function assignTrainingForToken'), db.indexOf('export async function assignTrainingForToken') + 1400)
    expect(fn).toContain('if (!mod) return null')
    expect(fn).toContain('if (!res) return null')
  })

  it('completion links to an OPEN assignment only — it never creates one', () => {
    const fn = db.slice(db.indexOf('recordTrainingCompletion'), db.indexOf('recordTrainingCompletion') + 900)
    expect(fn).toContain('isNull(trainingAssignments.completedAt)')
    expect(fn).toContain('.set({ completedAt: new Date() })')
    // It UPDATEs an existing assignment; it does not INSERT one on completion.
    expect(fn).not.toMatch(/insert\(trainingAssignments\)/)
  })

  it('enrollment is idempotent — a repeat failure does not pile up open assignments', () => {
    expect(db).toContain('.onConflictDoNothing()')
    expect(sql).toContain('training_assignments_open_uniq')
    expect(sql).toMatch(/WHERE "completedAt" IS NULL/)
  })
})
