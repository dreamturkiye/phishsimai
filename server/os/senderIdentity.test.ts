// ─────────────────────────────────────────────────────────────────────────────
//  PS-ONE-IDENTITY-01 — one mailbox, one name.
//
//  History: the original outreach signed three different identities from a single
//  mailbox (245 delivered, 0 replies). That was cleaned up, but janetReport.ts kept
//  sending as "Janet CGO <sarah@phishsimai.com>" while every other path sent as
//  "Sarah Mitchell". It reached only the founder's inbox, so no prospect ever saw
//  it — but a second display name on a shared mailbox is a trap waiting for someone
//  to add a recipient.
//
//  This test reads the SOURCE rather than importing the modules, because the sender
//  strings are module-private constants and importing would pull in DB and LLM
//  clients. Grepping source is the only way to assert a property that spans files
//  none of which export it — and the property is exactly "no file disagrees".
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()

/** Every file that sends mail through Resend from the shared mailbox. */
const SENDER_FILES = [
  'server/os/sequences.ts',
  'server/os/replyParser.ts',
  'server/os/janetReport.ts',
  'server/outreach/outreachSequence.ts',
]

const APPROVED_DISPLAY_NAME = 'Sarah Mitchell'

describe('outbound sender identity', () => {
  it('every sender from sarah@phishsimai.com signs as Sarah Mitchell', () => {
    for (const rel of SENDER_FILES) {
      const src = fs.readFileSync(path.resolve(ROOT, rel), 'utf8')
      // Match display names attached to the shared mailbox, in either the literal
      // form or the interpolated form used by outreachSequence.ts.
      const matches = [
        ...src.matchAll(/'([^']*?)\s*<sarah@phishsimai\.com>'/g),
        ...src.matchAll(/`([^`]*?)\s*<\$\{FROM_EMAIL\}>`/g),
      ]
      expect(matches.length, `${rel} should declare a sender`).toBeGreaterThan(0)
      for (const m of matches) {
        expect(m[1].trim(), `${rel} sends as "${m[1].trim()}"`).toBe(APPROVED_DISPLAY_NAME)
      }
    }
  })

  it('no file reintroduces a second identity on that mailbox', () => {
    // Scans the whole server tree, not just the known senders, so a NEW file
    // cannot quietly add a third name the way janetReport did.
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) { walk(p); continue }
        if (!e.name.endsWith('.ts') || e.name.endsWith('.test.ts')) continue
        const src = fs.readFileSync(p, 'utf8')
        for (const m of src.matchAll(/'([^']*?)\s*<sarah@phishsimai\.com>'/g)) {
          if (m[1].trim() !== APPROVED_DISPLAY_NAME) {
            offenders.push(`${path.relative(ROOT, p)}: "${m[1].trim()}"`)
          }
        }
      }
    }
    walk(path.resolve(ROOT, 'server'))
    expect(offenders, `unapproved sender identities: ${offenders.join(', ')}`).toEqual([])
  })
})
