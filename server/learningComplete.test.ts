// ─────────────────────────────────────────────────────────────────────────────
//  PS-LEARNING-COMPLETE-01 — the on-click micro-lesson counts toward compliance ONLY on a
//  deliberate acknowledgement, never on a page-view.
//
//  "Complete" here = the target clicks "I have reviewed this training", a POST-only action that
//  stamps their open training_assignment. Viewing the page (a GET, prefetchable by mail scanners)
//  is NOT completion — stamping complete on a view is the exact fabrication the report route already
//  guards against, applied to training.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const TRACKER = fs.readFileSync('server/email/tracker.ts', 'utf8')
const DB = fs.readFileSync('server/db.ts', 'utf8')

describe('viewed != completed', () => {
  it('the GET landing route does NOT complete training — it only renders', () => {
    // Isolate the /landing/:token GET handler and assert it never calls the completion path.
    const g = TRACKER.slice(TRACKER.indexOf('app.get("/landing/:token"'), TRACKER.indexOf('app.get("/landing/:token"') + 300)
    expect(g).not.toContain('completeTrainingForToken')
    expect(g).toContain('landingHtml')
  })

  it('completion is a POST-only action (a GET would be scanner-prefetched)', () => {
    expect(TRACKER).toContain('app.post("/api/training-complete/:token"')
    // No GET variant of the completion route exists.
    expect(TRACKER).not.toContain('app.get("/api/training-complete/:token"')
  })

  it('the landing page offers a deliberate acknowledgement FORM POST', () => {
    expect(TRACKER).toContain('action="/api/training-complete/${token}"')
    expect(TRACKER).toMatch(/I have reviewed this training/i)
  })
})

describe('completion records only what genuinely happened', () => {
  it('stamps the OPEN assignment; records nothing when none is owed', () => {
    const fn = DB.slice(DB.indexOf('export async function completeTrainingForToken'), DB.indexOf('export async function completeTrainingForToken') + 1200)
    expect(fn).toContain('isNull(trainingAssignments.completedAt)')
    expect(fn).toContain('if (!open) return false') // no open assignment -> no phantom completion
    expect(fn).toContain('recordTrainingCompletion')
  })

  it('the endpoint reports completed:true ONLY when a real assignment was stamped', () => {
    const h = TRACKER.slice(TRACKER.indexOf('app.post("/api/training-complete/:token"'), TRACKER.indexOf('app.post("/api/training-complete/:token"') + 1400)
    // `done` is the return of completeTrainingForToken; the response is derived from it, not assumed.
    expect(h).toContain('done = await completeTrainingForToken(req.params.token)')
    expect(h).toContain('completed: done')
    expect(h).toMatch(/no open training assignment to complete/i)
  })

  it('a write failure never reports a false completion', () => {
    const h = TRACKER.slice(TRACKER.indexOf('app.post("/api/training-complete/:token"'), TRACKER.indexOf('app.post("/api/training-complete/:token"') + 1400)
    expect(h).toContain('trackFailed("training_complete"')
  })
})
