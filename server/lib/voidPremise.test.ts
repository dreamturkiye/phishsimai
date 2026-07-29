// ─────────────────────────────────────────────────────────────────────────────
//  PS-CREDPHANTOM-01 — the void-premise guard.
//
//  What this stops: a task built on a premise already proven false. Credential
//  capture shipped 2026-07-24 (PS-CREDPAGE-01, pinned by server/credPage.test.ts);
//  "credentials submitted: 0" is a behavioural result over 2 clicks, not a fault.
//  The team re-manufactured that phantom under a NEW TITLE each day —
//    2026-07-24  "Investigate Credential Submission Funnel"          (cancelled)
//    2026-07-25  "Investigate Simulation Configuration and Reporting Gap"
//  — so title dedupe (PS-DEDUPE-01) saw two unrelated strings and passed both.
//  Both real titles are pinned below verbatim.
//
//  The other direction matters just as much: this guard must not become a ban on
//  the SUBJECT. Legitimate credential-page and conversion work has to keep flowing,
//  which is why a task must assert a DEFECT, not merely mention the area.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { voidPremiseFor, VOID_PREMISE_TASKS } from './kaan_os_v4'

describe('voidPremiseFor — refuses the credential phantom', () => {
  // VERBATIM from agent_tasks on prod. These are the two rows that must never be minted again.
  it('refuses the 2026-07-25 task', () => {
    const v = voidPremiseFor('Investigate Simulation Configuration and Reporting Gap')
    expect(v?.id).toBe('credential-capture-phantom')
  })

  it('refuses the 2026-07-24 task it was re-worded from', () => {
    expect(voidPremiseFor('Investigate Credential Submission Funnel')?.id).toBe('credential-capture-phantom')
  })

  it('refuses Marcus\'s 10/10-confidence framing, however it is phrased', () => {
    for (const title of [
      'Root cause analysis: the technical chain for the attack vector is broken',
      'Diagnose why credential capture is not working',
      'Audit the data capture layer — 0% submission rate',
      'Fake login page fails to record submissions — troubleshoot',
      'Why are credential submissions zero?',
    ]) {
      expect(voidPremiseFor(title), title).not.toBeNull()
    }
  })

  it('reads the description too — a bland title does not smuggle the premise through', () => {
    const v = voidPremiseFor(
      'Follow-up analysis',
      'Issued during daily standup: determine whether the credential capture layer is broken given 0 submissions',
    )
    expect(v?.id).toBe('credential-capture-phantom')
  })

  it('explains itself and points at the task that WOULD be legitimate', () => {
    const v = voidPremiseFor('Investigate Credential Submission Funnel')!
    expect(v.reason).toMatch(/2026-07-24/)          // when the premise was voided
    expect(v.reason).toMatch(/credPage\.test\.ts/)  // the evidence, not an assertion
    expect(v.reason).toMatch(/conversion/i)         // the re-issue path
  })
})

describe('voidPremiseFor — does NOT ban the subject area', () => {
  it('lets real credential-page work through', () => {
    for (const title of [
      'Draft 3 fake login page variants for the MSP template set',
      'Write the post-submit training page copy',
      'Add a second credential capture template themed on Google Workspace',
    ]) {
      expect(voidPremiseFor(title), title).toBeNull()
    }
  })

  // POLICY CHANGE, 2026-07-29 (PS-SIMFRICTION-01). This case previously asserted the
  // opposite: "Improve click→submit conversion on the credential harvest simulation"
  // was the sanctioned re-issue of the refused investigation, on the reasoning that a
  // conversion question is legitimate where a fault question is not.
  //
  // The founder's directive voided that escape hatch, and the data is why: all 5
  // simulations ever sent went to org 8, "PhishSim Internal". There is no visitor
  // whose conversion could be improved — the click→submit rate is us, on us. So the
  // conversion framing is not a better version of the task, it is the same empty task
  // with the fault word removed, and it was the exact route Marcus took on 07-29.
  //
  // BUILDING the page is still legitimate (cases above); STUDYING its conversion on a
  // sample of ourselves is not. Revisit when real external recipients exist at volume.
  it('no longer accepts the conversion reframing as an escape hatch', () => {
    const v = voidPremiseFor('Improve click→submit conversion on the credential harvest simulation')
    expect(v).not.toBeNull()
    expect(v!.id).toBe('sim-landing-page-friction')
  })

  it('lets unrelated defect work through — this is not a general investigation ban', () => {
    for (const title of [
      'Investigate why the trial funnel drops at step 2',
      'Root cause the Resend bounce rate spike',
      'Audit CRM pipeline hygiene for stale deals',
    ]) {
      expect(voidPremiseFor(title), title).toBeNull()
    }
  })
})

describe('voidPremiseFor — refuses capture-by-default (PS-CREDCAPTURE-DEFAULT-01)', () => {
  // The phantom's twin: not "why is capture 0" (fault-framed, caught above) but "BUILD capture by
  // default / expose safe_mode". Carries no fault word, so the phantom rule lets it through — this
  // rule must catch it because the thing it asks to build (warehousing real passwords) is a liability.
  it('refuses the founder-flagged framings', () => {
    for (const title of [
      'expose safe_mode so campaigns capture credentials by default',
      'Expose safe_mode to capture credential submissions',
      'Capture credentials by default for the 4 free orgs',
      'Store the typed password for submitted sims',
      'persist submitted credentials to the results table',
    ]) {
      expect(voidPremiseFor(title), title).not.toBeNull()
    }
  })

  // The click→submit conversion case moved out of this list on 2026-07-29 — see the
  // POLICY CHANGE note above. What remains is BUILD work and the benign lead path,
  // neither of which PS-SIMFRICTION-01 touches.
  it('still lets legitimate credential-page product work through', () => {
    for (const title of [
      'Add a second credential capture template themed on Google Workspace',
      'Collect signup contact emails for egroth trial follow-up',
    ]) {
      expect(voidPremiseFor(title), title).toBeNull()
    }
  })

  it('explains safe_mode does not exist and points at the benign lead path', () => {
    const v = voidPremiseFor('expose safe_mode to capture credentials by default')!
    expect(v.id).toBe('credential-capture-by-default')
    expect(v.reason).toMatch(/safe_mode/)
    expect(v.reason).toMatch(/never the password|no name attribute/i)
    expect(v.reason).toMatch(/trialNudges|contact follow-up/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  PS-SIMFRICTION-01 — the phantom's third costume.
//
//  Both rules above were keyed to words Marcus stopped using. On 2026-07-29 he asked
//  to "review the conversion drop-off between the 40% click rate and 0% credential
//  submission … determine if this is a UX friction issue on the landing page", Janet
//  issued it as "Analyze Landing Page Conversion Drop-off", and that title cleared
//  every existing rule — verified against the real title before the rule was written.
//
//  The premise is void because all 5 simulations ever sent went to org 8, "PhishSim
//  Internal". There is no visitor whose friction could be studied.
// ─────────────────────────────────────────────────────────────────────────────
describe('voidPremiseFor — refuses sim landing-page friction (PS-SIMFRICTION-01)', () => {
  it('refuses the exact title Janet issued on 2026-07-29', () => {
    const v = voidPremiseFor('Analyze Landing Page Conversion Drop-off')
    expect(v).not.toBeNull()
    expect(v!.id).toBe('sim-landing-page-friction')
  })

  it('refuses the thread however it is worded', () => {
    for (const title of [
      'Review conversion drop-off between the 40% click rate and 0% credential submission',
      'Investigate UX friction on the phishing landing page',
      'Analyze why users hesitate on the fake login page',
      'Propose a fix to increase data capture on the landing page',
      'Optimize the click-to-submit step',
    ]) {
      expect(voidPremiseFor(title), title).not.toBeNull()
    }
  })

  it('says WHY: the sample is us, and names top-of-funnel as the real gap', () => {
    const v = voidPremiseFor('Analyze Landing Page Conversion Drop-off')!
    expect(v.reason).toMatch(/own internal\/test org/i)
    expect(v.reason).toMatch(/TOP OF FUNNEL/i)
    // The escape hatch has to be discoverable, or the rule just blocks real work silently.
    expect(v.reason).toMatch(/marketing site|signup page/i)
  })

  it('does NOT block marketing-site conversion work or top-of-funnel work', () => {
    // These are the tasks we WANT the team proposing instead. A guard that eats them
    // would trade one stalled thread for a worse one.
    for (const title of [
      'Improve the marketing site signup page conversion',
      'Redesign the phishsimai.com signup page above the fold',
      'Increase Sarah cold outreach volume to 100/day',
      'Write follow-up copy for touch 2 of the outreach sequence',
      'Verify the inbound reply capture relay is firing',
      'Improve ICP targeting for the MSP lead list',
    ]) {
      expect(voidPremiseFor(title), title).toBeNull()
    }
  })
})

describe('VOID_PREMISE_TASKS — shape', () => {
  it('every rule carries an id and a reason that says WHY the premise is void', () => {
    expect(VOID_PREMISE_TASKS.length).toBeGreaterThan(0)
    for (const v of VOID_PREMISE_TASKS) {
      expect(v.id).toBeTruthy()
      // A refusal with no evidence is just a different unexplained silence.
      expect(v.reason.length).toBeGreaterThan(80)
    }
  })
})
