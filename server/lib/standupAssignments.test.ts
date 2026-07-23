// ─────────────────────────────────────────────────────────────────────────────
//  PS-PHANTOM-01 — Janet's standup assignment parser.
//
//  Regression guard for a failure that ran silently in production for days: the
//  original regex demanded a literal double-quoted title after "assign", so every
//  real (markdown) Janet response parsed to ZERO assignments and the standup
//  footer reported "0 tasks issued" — indistinguishable from "nothing was needed".
//  These tests pin BOTH directions: real assignments must parse, and Janet's prose
//  about an agent must NOT become an assigned task.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { parseStandupAssignments } from './kaan_os_v4'

describe('parseStandupAssignments — tier 1 (canonical)', () => {
  it('parses the mandated "ASSIGN <Name>: <title>" lines', () => {
    const out = parseStandupAssignments(
      `2. NEW TASK ASSIGNMENTS\n` +
      `ASSIGN Marcus: Audit the trial funnel instrumentation end to end (high)\n` +
      `ASSIGN Aria: Draft 3 MSP-channel landing page variants — Priority: MEDIUM\n` +
      `ASSIGN Finn: Model runway at current burn`,
    )
    expect(out).toEqual([
      { agentId: 'marcus', title: 'Audit the trial funnel instrumentation end to end' },
      { agentId: 'aria', title: 'Draft 3 MSP-channel landing page variants' },
      { agentId: 'finn', title: 'Model runway at current burn' },
    ])
  })

  it('IGNORES prose about an agent — narrating a concern is not assigning work', () => {
    // This is the exact shape that caused the 2026-07-23 escalation to be *about* Aria.
    const out = parseStandupAssignments(
      `1. IMMEDIATE ATTENTION\n` +
      `- Aria reported bypassing the dev queue. Text-only agent — a reporting problem, not an incident.\n\n` +
      `2. ASSIGNMENTS\n` +
      `ASSIGN Vera: Draft the first-value activation sequence for the 3 free orgs\n\n` +
      `3. PERFORMANCE CONCERN\n` +
      `Aria: reporting discipline. Report recommendations, not actions.`,
    )
    expect(out).toEqual([
      { agentId: 'vera', title: 'Draft the first-value activation sequence for the 3 free orgs' },
    ])
  })
})

describe('parseStandupAssignments — tier 2 (markdown table)', () => {
  // VERBATIM from the 2026-07-23 production standup (agent_meetings.decisions). The original
  // parser read ZERO assignments out of this and the brief said "0 tasks issued" — while Janet
  // had in fact assigned four. This is the exact text that must never fail to parse again.
  const REAL_2026_07_23 = `### 2. NEW TASK ASSIGNMENTS

| Assigned To | Task | Why | Priority |
|---|---|---|---|
| **Vera** | Build a direct outreach plan for the 3 existing free orgs. Call them. Email them. Find out *why* they haven't upgraded. | We have 3 warm users and zero conversions. This is the fastest path to revenue. | P0 — Critical |
| **Finn** | Deliver the complete unit economics model with a recommended *affordable* CAC by channel. | If we can't afford paid acquisition, we need a realistic organic plan *now*. | P0 — Critical |
| **Marcus** | Correlate the 60% report rate to conversion: does simulation engagement predict willingness to pay? | The 60% report rate is worthless if it doesn't drive revenue. | P1 |`

  it('parses Janet\'s habitual who/what/why/priority table', () => {
    const out = parseStandupAssignments(REAL_2026_07_23)
    expect(out.map(o => o.agentId)).toEqual(['vera', 'finn', 'marcus'])
    expect(out[0].title).toMatch(/^Build a direct outreach plan for the 3 existing free orgs/)
  })

  it('skips the header and separator rows', () => {
    // "Assigned To" and "---" resolve to no agent, so they must never become tasks.
    expect(parseStandupAssignments(REAL_2026_07_23)).toHaveLength(3)
  })

  it('truncates a long task cell instead of discarding it', () => {
    const long = `| **Vera** | ${'Do the thing. '.repeat(40)} | why | P0 |`
    const out = parseStandupAssignments(long)
    expect(out).toHaveLength(1)
    expect(out[0].title.length).toBeLessThanOrEqual(300)
  })
})

describe('parseStandupAssignments — tier 3 (markdown list fallback)', () => {
  it('parses a markdown list when Janet ignores the mandated format', () => {
    const out = parseStandupAssignments(
      `2. Task assignments:\n` +
      `- **Marcus** — Fix the signup redirect (high)\n` +
      `- **Aria** — Write the pricing page copy\n` +
      `* Finn: Update the LTV/CAC model`,
    )
    expect(out).toEqual([
      { agentId: 'marcus', title: 'Fix the signup redirect' },
      { agentId: 'aria', title: 'Write the pricing page copy' },
      { agentId: 'finn', title: 'Update the LTV/CAC model' },
    ])
  })

  it('does not run at all when tier 1 matched — canonical wins', () => {
    const out = parseStandupAssignments(
      `- Aria: your standup claimed repo access you do not have. Fix the reporting.\n` +
      `ASSIGN Vera: Draft the activation sequence for the free orgs`,
    )
    expect(out).toHaveLength(1)
    expect(out[0].agentId).toBe('vera')
  })

  it('caps the looser tier at the 1-3 the prompt asks for', () => {
    const many = ['Marcus', 'Aria', 'Finn', 'Vera', 'Rex']
      .map(n => `- ${n}: Do the thing that is theirs to do`).join('\n')
    expect(parseStandupAssignments(many)).toHaveLength(3)
  })
})

describe('parseStandupAssignments — rejections', () => {
  it('returns nothing when Janet issues no assignments', () => {
    expect(parseStandupAssignments(
      'No new assignments today — everything in flight. Focus: convert the 3 free orgs.',
    )).toEqual([])
  })

  it('never assigns to Janet herself, and ignores unknown names', () => {
    expect(parseStandupAssignments(
      'ASSIGN Janet: Run the weekly review\nASSIGN Gandalf: Take the ring to Mordor',
    )).toEqual([])
  })

  it('rejects a title too short to be a task', () => {
    expect(parseStandupAssignments('ASSIGN Marcus: ok')).toEqual([])
  })

  it('dedupes an assignment Janet repeats in one response', () => {
    expect(parseStandupAssignments(
      'ASSIGN Finn: Model runway at current burn\nASSIGN Finn: model runway at current burn',
    )).toHaveLength(1)
  })
})
