// ─────────────────────────────────────────────────────────────────────────────
//  PS-MARKETPLACE-GATE-01 — a shared template no longer publishes with zero review.
//
//  Before: isShared=true surfaced a template in the community pool instantly. Now a shared template
//  reaches the community pool ONLY when moderationStatus='approved'; a new share lands 'pending'.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const ROUTERS = fs.readFileSync('server/routers.ts', 'utf8')
const DB = fs.readFileSync('server/db.ts', 'utf8')
const SQL = fs.readFileSync('drizzle/pg/0026_template_moderation.sql', 'utf8')

describe('the community pool is gated on approval', () => {
  it('the community query filters moderationStatus="approved"', () => {
    // the community getTemplates call must carry the approval filter
    expect(ROUTERS).toContain('await getTemplates({ isShared: true, moderationStatus: "approved"')
  })

  it('getTemplates supports the moderationStatus filter', () => {
    expect(DB).toContain('opts.moderationStatus !== undefined')
    expect(DB).toContain('eq(templates.moderationStatus, opts.moderationStatus)')
  })
})

describe('sharing SUBMITS for review — it does not instant-publish', () => {
  it('setting isShared on update forces moderationStatus to pending', () => {
    expect(ROUTERS).toContain("data.isShared !== undefined ? { moderationStatus: 'pending' }")
  })
})

describe('an admin review action exists and is gated', () => {
  it('the moderate mutation is admin-only', () => {
    const mod = ROUTERS.slice(ROUTERS.indexOf('moderate: protectedProcedure'), ROUTERS.indexOf('moderate: protectedProcedure') + 400)
    expect(mod).toContain('ctx.user.role !== "admin"')
    expect(mod).toContain('moderateTemplate')
  })
  it('there is a pending-review queue', () => {
    expect(ROUTERS).toContain('pendingCommunity')
    expect(DB).toContain('getPendingCommunityTemplates')
  })
})

describe('the migration is additive and comment-safe', () => {
  it('grandfathers built-ins and existing shares to approved (nothing disappears)', () => {
    expect(SQL).toMatch(/UPDATE templates SET "moderationStatus" = 'approved'/)
    expect(SQL).toMatch(/isBuiltIn" = true OR "isShared" = true/)
  })
  it('has NO semicolon inside a COMMENT literal (the house-rule trap this migration hit and fixed)', () => {
    for (const m of SQL.matchAll(/IS\s+'([^']*)'/g)) {
      expect(m[1], 'semicolon inside COMMENT literal').not.toContain(';')
    }
  })
})
