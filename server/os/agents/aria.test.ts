// PS-ARIA-01 — tests for the agent that replaced the marketing ghost.
//
// Two things must hold or Aria is just a better-dressed ghost:
//   1. she CANNOT touch price, at any autonomy level, on any surface;
//   2. with 0 replies she says "unmeasured", never "0%" — because a rate implies a message was
//      judged, and nothing has been.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  screenCopyChange,
  currentBestOutreach,
  ratio,
  channelIncidents,
  experimentVerdict,
  buildAriaLine,
  auditExperiments,
  measureChannels,
  followupSequenceStatus,
  MIN_N,
  KILL_WINDOW_DAYS,
  CHANNEL_BOUNCE_ALARM,
  type ChannelRow,
} from './aria'

const chan = (over: Partial<ChannelRow>): ChannelRow => ({
  source: 's', leads: 100, contacted: 100, replied: 0, bounced: 0, trials: 0,
  currentContacted: 100, currentBounced: 0, historical: false,
  bounceLine: '', replyLine: '', ...over,
})

describe('THE HARD STOP — Aria may never touch price', () => {
  it('refuses an explicit price edit', () => {
    const v = screenCopyChange('touch1 body', 'Now only $249/mo for 500 users')
    expect(v.autoApply).toBe(false)
    expect(v.reason).toContain('PRICE-ADJACENT')
  })

  it('refuses a per-seat figure even without a dollar sign', () => {
    expect(screenCopyChange('subject', 'Just 45¢ per user').autoApply).toBe(false)
    expect(screenCopyChange('subject', 'lowest per-seat rate around').autoApply).toBe(false)
  })

  it('refuses discounts, promos and founding rates', () => {
    for (const c of ['20% discount for early MSPs', 'use coupon MSP20', 'founding rate for the first 10'])
      expect(screenCopyChange('body', c).autoApply, c).toBe(false)
  })

  it('refuses plan-name copy — plan names carry prices', () => {
    for (const c of ['Upgrade to Pro', 'Our Growth plan covers 500'])
      expect(screenCopyChange('body', c).autoApply, c).toBe(false)
  })

  it('ALLOWS a genuine non-price copy change — the stop is not blanket refusal', () => {
    const v = screenCopyChange('touch1 subject', 'Live in 10 minutes, no engineer needed')
    expect(v.autoApply).toBe(true)
  })

  it('screens the SURFACE as well as the copy', () => {
    // "pricing page" as a target is price-adjacent even if the new text looks innocent.
    expect(screenCopyChange('pricing page hero', 'Set up in ten minutes').autoApply).toBe(false)
  })
})

describe('the single source of truth for current best outreach', () => {
  it('reads the live subject lines rather than restating them', () => {
    // A second copy of the subject is a second thing to drift. Assert Aria's values are the ones
    // abTest.ts actually exports.
    const ab = fs.readFileSync('server/os/abTest.ts', 'utf8')
    const best = currentBestOutreach()
    expect(ab).toContain(best.touch1Subject)
    expect(ab).toContain(best.touch2Subject)
  })

  it('names the forbidden angle and cites the measurement behind it', () => {
    const b = currentBestOutreach()
    expect(b.forbiddenAngle).toMatch(/insurance|compliance/i)
    expect(b.evidence).toContain('908')
    expect(b.evidence).toContain('insurance-angle-failed')
  })
})

describe('no percentage below n=30 — for any metric, ever', () => {
  it('says N/A at n=0', () => {
    expect(ratio('reply', 0, 0)).toContain('N/A, n=0')
  })

  it('gives counts only below n=30', () => {
    expect(ratio('reply', 1, 20)).toContain('counts only')
    expect(ratio('reply', 1, 20)).not.toContain('%')
  })

  it('gives a rate at n>=30', () => {
    expect(ratio('bounce', 3, 100)).toContain('(3.0%)')
  })
})

describe('channel economics', () => {
  it('flags a LIVE source bouncing far above the alarm', () => {
    const [i] = channelIncidents([chan({ source: 'bad_live', contacted: 43, bounced: 20, currentContacted: 43, currentBounced: 20 })])
    expect(i).toBeTruthy()
    expect(i.severity).toBe('critical') // >= 30%
    expect(i.summary).toContain('LIST QUALITY problem, not a sending problem')
    expect(i.summary).toContain('CURRENT-pipeline')
    expect(i.evidence).toMatchObject({ currentContacted: 43, currentBounced: 20, cohort: 'current' })
  })

  // PS-COHORT-01 — the founder-supplied fact: lead_researcher fed the REPLACED pipeline and has sent
  // nothing since 2026-07-13. Alarming on it every run would demand action on a dead system, which
  // trains a human to ignore the channel alarm — and that is how the real one gets missed.
  it('NEVER alarms on a historical source, however bad its rate was', () => {
    const dead = chan({
      source: 'lead_researcher', contacted: 43, bounced: 20,
      currentContacted: 0, currentBounced: 0, historical: true,
    })
    expect(channelIncidents([dead])).toEqual([])
  })

  it('judges a live source on its CURRENT-pipeline sends, not its legacy history', () => {
    // google_maps: 20 unsanitized legacy sends plus 618 current ones. The legacy tail must not
    // drag the live verdict, and the live verdict must not hide behind the blend.
    const mixed = chan({ source: 'google_maps', contacted: 638, bounced: 8, currentContacted: 618, currentBounced: 8 })
    expect(channelIncidents([mixed])).toEqual([])
  })

  it('does not judge a channel below n=30 of CURRENT sends', () => {
    expect(channelIncidents([chan({ contacted: 500, bounced: 400, currentContacted: 10, currentBounced: 9 })])).toEqual([])
  })

  it('rates a bad-but-not-catastrophic live channel high rather than critical', () => {
    const [i] = channelIncidents([chan({ contacted: 100, bounced: 20, currentContacted: 100, currentBounced: 20 })])
    expect(i.severity).toBe('high')
  })

  it('the alarm sits well above the overall sending breaker — different problem, different owner', () => {
    expect(CHANNEL_BOUNCE_ALARM).toBeGreaterThan(0.08)
  })
})

// A fake DB: supports sql`...` (used by auditExperiments) and sql.query() (used by measureChannels).
function fakeSql(rows: any[] = [], queryRows: any[] = []) {
  const fn: any = () => Promise.resolve(rows)
  fn.query = async () => queryRows
  return fn
}

describe('experiment integrity — the defects the ghost hid', () => {
  it('catches impressions labelled with a variant that was never sent', async () => {
    // The real defect: 413 rows say variant='test' but touch1_subject has no test arm, so
    // sequences.ts sent CONTROL to every one of them.
    const { incidents } = await auditExperiments(
      fakeSql([
        { experiment_key: 'touch1_subject', variant: 'control', event: 'sent', n: 360 },
        { experiment_key: 'touch1_subject', variant: 'test', event: 'sent', n: 413 },
      ]),
    )
    const mis = incidents.find((i) => i.signature.includes('experiment_mislabelled'))
    expect(mis).toBeTruthy()
    expect(mis!.severity).toBe('critical')
    expect(mis!.summary).toContain('413')
    expect(mis!.summary).toContain('compares control against control')
    expect(mis!.evidence).toMatchObject({ mislabelledSent: 413, hasTestArm: false })
  })

  it('catches an experiment with impressions but zero outcome events', async () => {
    const { incidents } = await auditExperiments(
      fakeSql([{ experiment_key: 'touch1_subject', variant: 'control', event: 'sent', n: 360 }]),
    )
    const blind = incidents.find((i) => i.signature.includes('experiment_no_outcomes'))
    expect(blind).toBeTruthy()
    expect(blind!.summary).toContain('is a counter, not an experiment')
  })

  it('does NOT flag an experiment that records outcomes', async () => {
    const { incidents } = await auditExperiments(
      fakeSql([
        { experiment_key: 'touch1_subject', variant: 'control', event: 'sent', n: 360 },
        { experiment_key: 'touch1_subject', variant: 'control', event: 'replied', n: 4 },
      ]),
    )
    expect(incidents.find((i) => i.signature.includes('experiment_no_outcomes'))).toBeFalsy()
  })

  it('reports an unreadable experiment table as NOT CHECKED, not as clean', async () => {
    const throwing: any = () => Promise.reject(new Error('no table'))
    const r = await auditExperiments(throwing)
    expect(r.checked).toBe(false)
    expect(r.incidents).toEqual([])
  })
})

describe('the kill rule is stated honestly', () => {
  it('calls a control-only experiment NOT RUNNING rather than a winner', () => {
    const v = experimentVerdict({ active: false, hasTestArm: false, variants: [{ variant: 'control', sent: 360, outcomes: 0 }], totalOutcomes: 0 })
    expect(v).toContain('NOT RUNNING')
    expect(v).toContain('all received control copy')
  })

  it('calls an outcome-less experiment UNJUDGEABLE', () => {
    const v = experimentVerdict({ active: true, hasTestArm: true, variants: [{ variant: 'test', sent: 100, outcomes: 0 }], totalOutcomes: 0 })
    expect(v).toContain('UNJUDGEABLE')
  })

  it('refuses to judge below n=30', () => {
    const v = experimentVerdict({ active: true, hasTestArm: true, variants: [{ variant: 'test', sent: 10, outcomes: 2 }], totalOutcomes: 2 })
    expect(v).toContain('TOO EARLY')
  })

  it('applies the 7-day / n>=30 rule only when both hold', () => {
    const v = experimentVerdict({ active: true, hasTestArm: true, variants: [{ variant: 'test', sent: 100, outcomes: 12 }], totalOutcomes: 12 })
    expect(v).toContain('JUDGEABLE')
    expect(v).toContain(`${KILL_WINDOW_DAYS}-day`)
    expect(v).toContain(`n>=${MIN_N}`)
  })
})

describe('anti-fabrication: zero replies is not a reply rate', () => {
  const base = {
    status: 'ACTIVE' as const,
    incidents: [],
    bySeverity: { critical: 0, high: 0, medium: 0 },
    channels: [chan({ source: 'google_maps', contacted: 638, bounced: 8, currentContacted: 618, currentBounced: 8, bounceLine: 'bounce 8/618 (1.3%)' })],
    notChecked: [],
  }

  it('never renders "0%" when there are no replies', () => {
    const line = buildAriaLine({
      ...base,
      totals: { contacted: 933, replied: 0, bounced: 38, trials: 0 },
      messagePerformance:
        'Message performance: UNMEASURED — 0/933 external replies. With zero replies there is no signal ' +
        'to attribute to any message, so no copy is "winning" and none is "losing". The constraint is ' +
        'not yet known to be the copy.',
    })
    expect(line).toContain('UNMEASURED')
    expect(line).toContain('0/933')
    expect(line).not.toMatch(/reply rate[^.]*0\.0%/i)
  })

  it('always states that pricing is a hard stop', () => {
    const line = buildAriaLine({ ...base, totals: { contacted: 933, replied: 0, bounced: 38, trials: 0 }, messagePerformance: 'x' })
    expect(line).toContain('HARD STOP')
    expect(line).toContain('proposes, never edits')
  })

  it('claims nothing when both tables were unreadable', () => {
    const line = buildAriaLine({ ...base, status: 'INSUFFICIENT_DATA', totals: { contacted: 0, replied: 0, bounced: 0, trials: 0 }, messagePerformance: '' })
    expect(line).toContain('insufficient data')
    expect(line).toContain('No performance claim is possible')
  })

  it('reports an unreadable channel table as NOT CHECKED', async () => {
    const throwing: any = { query: async () => { throw new Error('boom') } }
    const r = await measureChannels(throwing)
    expect(r.checked).toBe(false)
    expect(r.rows).toEqual([])
  })
})

describe('the ghost is actually gone', () => {
  it('marketing.ts no longer exists', () => {
    expect(fs.existsSync('server/os/agents/marketing.ts')).toBe(false)
  })

  it('neither standup path imports the deleted ghost', () => {
    for (const f of ['server/os/janet.ts', 'server/os/janetReport.ts']) {
      const src = fs.readFileSync(f, 'utf8')
      expect(src, `${f} must not import the ghost`).not.toContain("from './agents/marketing'")
      expect(src, `${f} must not call runMarketingAgent`).not.toContain('runMarketingAgent(')
    }
  })

  it('both standup paths call Aria instead', () => {
    for (const f of ['server/os/janet.ts', 'server/os/janetReport.ts']) {
      expect(fs.readFileSync(f, 'utf8'), f).toContain('runAriaAgent(')
    }
  })
})


describe('PS-ARIA-AB-01 — the impression generator records what was SENT', () => {
  const SEQ = fs.readFileSync('server/os/sequences.ts', 'utf8')

  it('records sentVariant, never the raw hash bucket', () => {
    expect(SEQ).toContain("recordImpression(String(lead.id), 'touch1_subject', sentVariant)")
    expect(SEQ).not.toContain("recordImpression(String(lead.id), 'touch1_subject', variant)")
  })

  it('derives sentVariant from the copy actually chosen', () => {
    // The bug was that `variant` (hash) and `v` (copy sent) disagree whenever there is no test arm.
    expect(SEQ).toContain("const sentVariant: 'control' | 'test' = v === exp.test ? 'test' : 'control'")
  })
})

// A fake DB that answers the two sequential tagged-template queries touch2Headroom makes:
// first touch2SentInBatch's count, then isTouch2ScaleApproved's flag read.
function fakeSeqSql(responses: any[][]) {
  let i = 0
  const fn: any = () => Promise.resolve(responses[i++] ?? [])
  return fn
}

describe('follow-up sequence status — the touch-2 batch gate, surfaced rather than hidden in a cron log', () => {
  it('reports batch progress while headroom remains', async () => {
    const r = await followupSequenceStatus(fakeSeqSql([[{ n: 42 }], []]))
    expect(r).toMatchObject({ touch: 2, sentInBatch: 42, batchLimit: 150, headroom: 108, holding: false })
    expect(r!.line).toContain('42/150 sent this batch')
  })

  it('reports BATCH 1 COMPLETE and holding once headroom hits zero', async () => {
    const r = await followupSequenceStatus(fakeSeqSql([[{ n: 150 }], []]))
    expect(r).toMatchObject({ sentInBatch: 150, headroom: 0, holding: true })
    expect(r!.line).toContain('BATCH 1 COMPLETE (150/150)')
    expect(r!.line).toContain('holding for founder scale-approval')
  })

  it('never reports holding once the founder has approved scaling', async () => {
    const r = await followupSequenceStatus(fakeSeqSql([[{ n: 300 }], [{ value: '1' }]]))
    expect(r!.holding).toBe(false)
    expect(r!.headroom).toBeGreaterThan(300)
  })

  it('reports unreadable state as null when the query throws before it can even attach a .catch', async () => {
    // touch2SentInBatch/isTouch2ScaleApproved each do `await sql\`...\`.catch(() => [])` — a sql
    // that rejects is swallowed there and reads as a genuine zero. Only a sql that throws
    // SYNCHRONOUSLY (the tagged-template call itself failing, before `.catch` can attach) escapes
    // that inner catch and reaches followupSequenceStatus's own try/catch as null.
    const throwing: any = () => { throw new Error('no table') }
    expect(await followupSequenceStatus(throwing)).toBeNull()
  })

  it('buildAriaLine includes the follow-up status when present, and omits it when not', () => {
    const base = {
      status: 'ACTIVE' as const,
      totals: { contacted: 100, replied: 2, bounced: 0, trials: 0 },
      incidents: [],
      bySeverity: { critical: 0, high: 0, medium: 0 },
      channels: [chan({ currentContacted: 100 })],
      messagePerformance: 'Reply 2/100 (2.0%)',
      notChecked: [],
    }
    const withFollowup = buildAriaLine({
      ...base,
      followup: { touch: 2, sentInBatch: 42, batchLimit: 150, headroom: 108, holding: false, line: 'touch-2 follow-up: 42/150 sent this batch' },
    })
    expect(withFollowup).toContain('touch-2 follow-up: 42/150 sent this batch')
    expect(buildAriaLine({ ...base, followup: null })).not.toContain('touch-2 follow-up')
  })
})
