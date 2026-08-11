// ─────────────────────────────────────────────────────────────────────────────
//  PS-SEND-HEALTH-02 — the send-health monitor must itself be monitored.
//
//  Sends are the lifeline (≈1 signup / 20 emails). The layered coverage:
//    · 08:30 /api/os/outreach-funnel — FAST: "🚨 SEND CRON DID NOT RUN" the same
//      morning, off agent_health 'aria' (stamped by the 07:00 send cron).
//    · 06:00 /api/os/sequence in the truth report — BACKSTOP: RED when the newest
//      send is >26h old, independent of the funnel.
//    · 06:00 /api/os/outreach-funnel in the truth report — WATCHES THE WATCHER:
//      the funnel is the only writer of credit_readings, so a stale read_at means
//      the fast tripwire went dark. Without this, the monitor's own death reads as
//      silence — the exact "no news = fine" failure this guards against.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { CRON_OUTPUT } from './truthReport'

const byCron = (needle: string) => CRON_OUTPUT.find(c => c.cron.includes(needle))

describe('truth-report cron liveness registry', () => {
  it('watches the SEND itself by the timestamp it produces (not a proxy that moves on edits)', () => {
    const seq = byCron('/api/os/sequence')
    expect(seq, 'the 07:00 send must be liveness-monitored').toBeTruthy()
    expect(seq!.table).toBe('ps_outreach_leads')
    // The signal is EMAIL SENT — the touch columns — never stage_updated_at (moves on any edit).
    expect(seq!.col).toMatch(/touch1_sent_at/)
    expect(seq!.col).not.toMatch(/stage_updated_at/)
  })

  it('watches the send-health MONITOR — its absence must not read as silence', () => {
    const funnel = byCron('/api/os/outreach-funnel')
    expect(funnel, 'the 08:30 send-health monitor must itself be monitored').toBeTruthy()
    // credit_readings is written ONLY by the funnel, so its freshness == the monitor ran.
    expect(funnel!.table).toBe('credit_readings')
    expect(funnel!.col).toBe('read_at')
    expect(funnel!.schedule).toBe('30 8 * * *')
  })

  it('every registry entry names a table and a non-empty output column', () => {
    for (const c of CRON_OUTPUT) {
      expect(c.table, `${c.cron} needs a table`).toBeTruthy()
      expect(c.col?.length, `${c.cron} needs an output column`).toBeGreaterThan(0)
    }
  })
})
