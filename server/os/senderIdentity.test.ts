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

/**
 * PROSPECT-FACING senders — these use the sales mailbox and must all sign identically.
 * janetReport.ts is deliberately NOT here: it is internal reporting and was moved OFF
 * this mailbox by PS-INTERNAL-MAILBOX-01.
 */
const SENDER_FILES = [
  'server/os/sequences.ts',
  'server/os/replyParser.ts',
  'server/outreach/outreachSequence.ts',
]

/** Internal/founder-facing senders — must NOT use the sales mailbox. */
const INTERNAL_SENDER_FILES = ['server/os/janetReport.ts']

const APPROVED_DISPLAY_NAME = 'Sarah Mitchell'
const SALES_MAILBOX = 'sarah@phishsimai.com'

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

  it('internal reporting does NOT send from the sales mailbox', () => {
    // PS-INTERNAL-MAILBOX-01. sarah@ is the inbox scanned for prospect replies, and
    // since PS-REPLY-PROOF-01 every inbound there becomes evidence that the reply
    // channel works. A founder replying to his own weekly report used to write a real
    // inbound row into the table that decides whether prospects may be followed up.
    // Honest data, self-generated — and a system that cannot tell its own traffic from
    // a customer's is one inference away from claiming engagement it does not have.
    for (const rel of INTERNAL_SENDER_FILES) {
      const src = fs.readFileSync(path.resolve(ROOT, rel), 'utf8')
      const sends = [...src.matchAll(/from:\s*FROM\b/g)]
      expect(sends.length, `${rel} should send mail`).toBeGreaterThan(0)
      // The FROM constant itself must not point at the sales mailbox.
      const fromDecl = src.match(/const FROM\s*=\s*([^\n]+)/)
      expect(fromDecl, `${rel} should declare FROM`).toBeTruthy()
      expect(fromDecl![1]).not.toContain(SALES_MAILBOX)
      // Replies must reach a human rather than the sending address.
      expect(src, `${rel} must set reply_to`).toMatch(/reply_to:\s*REPORT_EMAIL/)
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
