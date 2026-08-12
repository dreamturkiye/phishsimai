/**
 * PS-OPEN-TRACK-01 — pixel-based open tracking for cold outreach emails (server/os/sequences.ts).
 *
 * Mirrors server/os/unsubscribe.ts on every load-bearing point: same base64url(email) token
 * (decodeUnsubToken), same query-param convention (?e=), same NO-AUTH / fail-open design — a
 * recipient's mail client fetches this with no session and must always get back a valid image,
 * whether the token is garbage, decodes to an address not on the list, or the DB write fails.
 */

import type { Request, Response } from 'express'
import { getSql } from './conn'
import { decodeUnsubToken } from './unsubscribe'

const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

export async function trackOpenPixel(req: Request, res: Response): Promise<void> {
  res.setHeader('Content-Type', 'image/gif')
  res.setHeader('Cache-Control', 'no-store')
  const token = String((req.query?.e as string) ?? '')
  const email = token ? decodeUnsubToken(token) : null
  if (email) {
    try {
      const sql = getSql()
      const ts = new Date().toISOString()
      await sql`
        UPDATE ps_outreach_leads
        SET first_opened_at = COALESCE(first_opened_at, ${ts}),
            last_opened_at = ${ts},
            open_count = open_count + 1
        WHERE LOWER(email) = LOWER(${email})`
    } catch (e) {
      // A failed write must never surface to the recipient — same doctrine as
      // server/email/tracker.ts's trackFailed: log loud, respond with the pixel regardless.
      console.error('[trackOpen] write FAILED for', email, e)
    }
  }
  res.status(200).send(PIXEL_GIF)
}
