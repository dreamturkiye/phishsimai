// ─────────────────────────────────────────────────────────────────────────────
//  PS-FOLLOWUP-01 — touches 2-5. DRAFT, PENDING FOUNDER APPROVAL.
//
//  Nothing in this file sends. sequences.ts gates every follow-up behind
//  FOLLOWUPS_ARMED (a code constant, false) AND a runtime proof that inbound
//  reply capture actually works. Both must be true. See sequences.ts.
//
//  WHY THE OLD TOUCHES 2-5 WERE DELETED (PS-COPY-REWRITE-01) — do not rebuild them:
//  an invented case study ("43% → 4%"), invented scarcity ("2 slots left"), an
//  unsourced stat ("attacks up 48%"), and a dead calendly link. 245 delivered,
//  0 replies. Every claim below is either verifiable, attributed, or stated as
//  our own opinion. There are no invented customers, no invented percentages and
//  no manufactured deadlines anywhere in this file. If a claim cannot survive an
//  MSP forwarding it to their compliance officer, it does not ship.
//
//  ⚠️ TWO VERSIONS PER TOUCH — `safe` and `bold`. They are NOT an A/B test. The
//  founder picks one per touch and deletes the other, the same way touch 1 holds
//  one approved body in both A/B slots (abTest.ts) so no unapproved copy can
//  survive in the file and get sent by a later edit.
//
//  ⚠️ FOUNDER: two things to check before approving.
//    1. TOUCH 1 IS ALREADY THE INSURANCE EMAIL — subject "Your Clients' Insurers
//       Now Want Phishing-Sim Proof". The brief asked for insurance at touch 2,
//       so touch 2 below does NOT re-pitch it; it advances to the specific thing
//       touch 1 only alluded to (what the renewal questionnaire asks, and what
//       happens at claim time). Re-pitching the same angle three days later into
//       the same thread is the fastest way to get marked as spam.
//    2. The HIPAA citation in touch 3 is 45 CFR §164.308(a)(5)(i) — the Security
//       Rule's Security Awareness and Training standard. That citation is real
//       and the safeguard is genuinely required. What the rule does NOT do is
//       name "phishing simulation" as the required method — the copy is written
//       to respect that distinction. Please verify it reads correctly to you
//       before it goes to anyone with healthcare clients.
// ─────────────────────────────────────────────────────────────────────────────
import { CANSPAM_HTML, CANSPAM_TEXT } from './abTest'

export interface FollowUpVariant {
  id: string
  subject: (co: string) => string
  html: (name: string, co: string) => string
  text: (name: string, co: string) => string
}
export interface FollowUpTouch {
  touch: number
  delayDays: number
  /** Sent as a reply on the touch-1 thread — the subject is "Re: <touch-1 subject>". */
  threaded: boolean
  safe: FollowUpVariant
  bold: FollowUpVariant
}

// Shared shell. Identical to touch 1's so the thread looks like one person writing,
// not a marketing system: same font stack, same width, same signature, same logo.
const wrap = (body: string) =>
  `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:580px;font-size:15px;line-height:1.6;color:#111">
${body}
<p style="margin-top:24px;margin-bottom:0">Sarah Mitchell</p>
<p style="margin:0;color:#555">Head of Compliance, Partnerships</p>
<img src="https://www.phishsimai.com/brand/phishsim-logo-email.png" alt="PhishSim AI" width="150" style="display:block;border:0;outline:0;margin:8px 0 0 0;padding:0;height:auto">
${CANSPAM_HTML}
</div>`

const cta = (label: string) =>
  `<p style="margin:22px 0"><a href="https://phishsimai.com/register" style="display:inline-block;background:#e53e3e;color:#fff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:6px">${label}</a></p>
<p style="margin:0;font-size:13px;color:#666">Or paste this in: https://phishsimai.com/register</p>`

const sign = (body: string) => `${body}

Sarah Mitchell
Head of Compliance, Partnerships

${CANSPAM_TEXT}`

// ── TOUCH 2 (day 3) — INSURANCE, advanced ────────────────────────────────────
// Touch 1 said "underwriters now ask for proof". Touch 2 answers the question that
// creates: proof of WHAT, exactly. It teaches something useful even if they never buy,
// which is the only follow-up that earns a second reply.
const TOUCH2: FollowUpTouch = {
  touch: 2, delayDays: 3, threaded: true,
  safe: {
    id: 't2_safe_questionnaire',
    subject: () => `What the renewal questionnaire actually asks`,
    html: (name, co) => wrap(`<p>Hi ${name},</p>
<p>Following up on my note with something more concrete than a pitch.</p>
<p>When your client's cyber policy comes up for renewal, the security-awareness section of the questionnaire generally wants four things:</p>
<ul style="padding-left:20px;margin:14px 0">
  <li style="margin-bottom:6px">How often simulations run (quarterly is the common floor; annual training on its own is increasingly rejected)</li>
  <li style="margin-bottom:6px">The click-rate trend across the last 12 months — not a single snapshot</li>
  <li style="margin-bottom:6px">What happened to the people who failed, and whether they were retrained</li>
  <li style="margin-bottom:6px">Who attests to it, and on what date</li>
</ul>
<p>Most MSPs I speak to can answer the first question and not the other three, because the evidence lives in a mailbox and a spreadsheet rather than in a report anyone can hand to a broker.</p>
<p>PhishSim produces that as a per-client, per-campaign certificate — under your brand, not ours. If you'd rather just see one, start a trial and run a simulation against your own team; the certificate it generates is the same artifact your client's underwriter is asking for.</p>
${cta('See a sample certificate →')}
<p>If this isn't your problem to solve, tell me and I'll close the file.</p>`),
    text: (name, co) => sign(`Hi ${name},

Following up on my note with something more concrete than a pitch.

When your client's cyber policy comes up for renewal, the security-awareness section of the questionnaire generally wants four things:

- How often simulations run (quarterly is the common floor; annual training on its own is increasingly rejected)
- The click-rate trend across the last 12 months, not a single snapshot
- What happened to the people who failed, and whether they were retrained
- Who attests to it, and on what date

Most MSPs I speak to can answer the first and not the other three, because the evidence lives in a mailbox and a spreadsheet rather than in a report anyone can hand to a broker.

PhishSim produces that as a per-client, per-campaign certificate, under your brand. If you'd rather just see one, start a trial and run a simulation against your own team.

Start your 30-day trial: https://phishsimai.com/register

If this isn't your problem to solve, tell me and I'll close the file.`),
  },
  bold: {
    id: 't2_bold_claimtime',
    subject: () => `The part nobody reads until the claim is denied`,
    html: (name, co) => wrap(`<p>Hi ${name},</p>
<p>One thing worth knowing, whether or not you ever talk to me.</p>
<p>A cyber policy is underwritten on the controls your client <em>attested</em> to. If a claim follows a phishing incident, the carrier's investigators work backwards from that attestation — and the question is not "did you have security training?" but "show us it was running on the date this happened, and show us what you did about the people who failed."</p>
<p>An attestation your client can't evidence is worse than no attestation. That is the exposure, and it lands on whoever manages their security stack. Which is you.</p>
<p>PhishSim exists to make that evidence a by-product of running the simulations, instead of a scramble after the fact — white-label, per-client certificates, dated and attributable.</p>
<p>I'm not going to tell you a deadline is coming, because I don't know your clients' renewal dates. I'd just rather you had the proof before you needed it.</p>
${cta('Start a 30-day trial — no card →')}
<p>Not a fit? Say so and I'll stop.</p>`),
    text: (name, co) => sign(`Hi ${name},

One thing worth knowing, whether or not you ever talk to me.

A cyber policy is underwritten on the controls your client attested to. If a claim follows a phishing incident, the carrier's investigators work backwards from that attestation — and the question is not "did you have security training?" but "show us it was running on the date this happened, and show us what you did about the people who failed."

An attestation your client can't evidence is worse than no attestation. That exposure lands on whoever manages their security stack. Which is you.

PhishSim makes that evidence a by-product of running the simulations instead of a scramble after the fact — white-label, per-client certificates, dated and attributable.

I'm not going to tell you a deadline is coming, because I don't know your clients' renewal dates. I'd just rather you had the proof before you needed it.

Start a 30-day trial, no card: https://phishsimai.com/register

Not a fit? Say so and I'll stop.`),
  },
}

// ── TOUCH 3 (day 7) — HIPAA / COMPLIANCE ─────────────────────────────────────
// Only lands for MSPs with healthcare clients. Written so it reads as useful and
// self-disqualifying rather than mistargeted if they have none.
const TOUCH3: FollowUpTouch = {
  touch: 3, delayDays: 7, threaded: true,
  safe: {
    id: 't3_safe_hipaa',
    subject: () => `If any of your clients touch PHI`,
    html: (name, co) => wrap(`<p>Hi ${name},</p>
<p>Last angle from me, then I'll leave the thread alone for a while — and it only matters if you have healthcare clients. If you don't, ignore this one.</p>
<p>The HIPAA Security Rule requires a security awareness and training program for every workforce member (45 CFR §164.308(a)(5)(i)). The rule does not prescribe simulated phishing specifically — but when OCR investigates a breach that began with a phishing email, the covered entity has to demonstrate the program existed and was operating, and "we sent a slide deck last year" is a thin answer.</p>
<p>For an MSP, that is a service you can charge for rather than a cost you absorb: quarterly simulations per client, documented, with the training record attached to each person who clicked.</p>
<p>PhishSim maps each campaign to the framework it evidences and issues the certificate per client. You resell it under your own brand; we stay invisible.</p>
${cta('Run one against your own team →')}
<p>No healthcare clients? Reply "no PHI" and I'll drop that angle entirely.</p>`),
    text: (name, co) => sign(`Hi ${name},

Last angle from me, then I'll leave the thread alone for a while — and it only matters if you have healthcare clients. If you don't, ignore this one.

The HIPAA Security Rule requires a security awareness and training program for every workforce member (45 CFR §164.308(a)(5)(i)). The rule does not prescribe simulated phishing specifically — but when OCR investigates a breach that began with a phishing email, the covered entity has to demonstrate the program existed and was operating, and "we sent a slide deck last year" is a thin answer.

For an MSP that is a service you can charge for rather than a cost you absorb: quarterly simulations per client, documented, with the training record attached to each person who clicked.

PhishSim maps each campaign to the framework it evidences and issues the certificate per client. You resell it under your own brand; we stay invisible.

Run one against your own team: https://phishsimai.com/register

No healthcare clients? Reply "no PHI" and I'll drop that angle entirely.`),
  },
  bold: {
    id: 't3_bold_billable',
    subject: () => `Compliance work you're probably giving away`,
    html: (name, co) => wrap(`<p>Hi ${name},</p>
<p>A question rather than a pitch: when a client asks you to prove their staff are trained — for HIPAA, for an insurer, for a customer's vendor review — do you bill for that, or does it come out of your margin?</p>
<p>Most MSPs I talk to absorb it. The security awareness and training safeguard (45 CFR §164.308(a)(5)(i) for anyone touching PHI) is genuinely mandatory, the evidence for it is genuinely tedious to produce, and it quietly becomes unpaid work because there's no clean artifact to invoice against.</p>
<p>The artifact is the product. A per-client compliance certificate, in your branding, is something you can put on a line item — and it's a stronger renewal conversation than another bundled "included" service.</p>
<p>Our own price is public: $149/month for the starter tier. Whatever you charge your clients for the managed service on top is yours, and we never appear in it.</p>
${cta('Start the 30-day trial →')}
<p>If you already bill for this and have it handled, genuinely well done — say so and I'll close the file.</p>`),
    text: (name, co) => sign(`Hi ${name},

A question rather than a pitch: when a client asks you to prove their staff are trained — for HIPAA, for an insurer, for a customer's vendor review — do you bill for that, or does it come out of your margin?

Most MSPs I talk to absorb it. The security awareness and training safeguard (45 CFR §164.308(a)(5)(i) for anyone touching PHI) is genuinely mandatory, the evidence is genuinely tedious to produce, and it quietly becomes unpaid work because there's no clean artifact to invoice against.

The artifact is the product. A per-client compliance certificate in your branding is something you can put on a line item — and it's a stronger renewal conversation than another bundled "included" service.

Our own price is public: $149/month for the starter tier. Whatever you charge your clients on top is yours, and we never appear in it.

Start the 30-day trial: https://phishsimai.com/register

If you already bill for this and have it handled, genuinely well done — say so and I'll close the file.`),
  },
}

// ── TOUCH 4 (day 12) — PRICE ─────────────────────────────────────────────────
// NOTE: no competitor price is quoted anywhere. KnowBe4 and Proofpoint do not publish
// per-seat pricing, so any number we printed would be invented — the exact failure that
// killed the last sequence. What IS true and checkable: we publish, they quote. Say that.
const TOUCH4: FollowUpTouch = {
  touch: 4, delayDays: 12, threaded: true,
  safe: {
    id: 't4_safe_published',
    subject: () => `Our pricing, plainly`,
    html: (name, co) => wrap(`<p>Hi ${name},</p>
<p>I've sent a few notes about insurance and compliance evidence. Here's the commercial part, stated plainly so you can rule us in or out in about a minute.</p>
<ul style="padding-left:20px;margin:14px 0">
  <li style="margin-bottom:6px">$149/month starter, published on the site. No "contact sales" wall.</li>
  <li style="margin-bottom:6px">White-label — your brand on the simulations and the certificates.</li>
  <li style="margin-bottom:6px">Roughly 10 minutes to set up. No agents to deploy, no onboarding project, no call with me required.</li>
  <li style="margin-bottom:6px">30-day trial, no credit card.</li>
</ul>
<p>The larger platforms in this category quote per seat after a discovery call. That model is a reasonable fit for a 2,000-seat enterprise. It is a poor fit for an MSP who wants to switch a service on for an 11-person client this week.</p>
<p>I'll be straight, as I was in my first note: we're new and I have no customer logos to show you. The trial is the honest way to evaluate us — it costs you ten minutes and no card.</p>
${cta('Start the 30-day trial →')}`),
    text: (name, co) => sign(`Hi ${name},

I've sent a few notes about insurance and compliance evidence. Here's the commercial part, stated plainly so you can rule us in or out in about a minute.

- $149/month starter, published on the site. No "contact sales" wall.
- White-label: your brand on the simulations and the certificates.
- Roughly 10 minutes to set up. No agents to deploy, no onboarding project, no call with me required.
- 30-day trial, no credit card.

The larger platforms in this category quote per seat after a discovery call. That's a reasonable fit for a 2,000-seat enterprise. It's a poor fit for an MSP who wants to switch a service on for an 11-person client this week.

I'll be straight, as I was in my first note: we're new and I have no customer logos to show you. The trial is the honest way to evaluate us — ten minutes and no card.

Start the 30-day trial: https://phishsimai.com/register`),
  },
  bold: {
    id: 't4_bold_nocall',
    subject: () => `No demo, no sales call, no seat quote`,
    html: (name, co) => wrap(`<p>Hi ${name},</p>
<p>Everyone else in this category will make you sit through a discovery call before they'll tell you a number. I'd rather just tell you: <strong>$149/month</strong> to start, on the website, no negotiation theatre.</p>
<p>What you get for it is the whole reseller motion — white-label simulations, per-client compliance certificates, your brand throughout. What you don't get is an implementation project, a seat-count negotiation, or a quarterly business review you didn't ask for.</p>
<p>My honest pitch is that the evaluation should cost you almost nothing: sign up, run a simulation against your own team, look at the certificate it produces, and decide. Ten minutes. If the artifact isn't something you'd hand a client's underwriter, you've learned that for free and I'll stop emailing.</p>
${cta('Ten minutes, no card →')}
<p>And if the honest answer is "we already use KnowBe4 and it's fine" — tell me that. It's a perfectly good answer and I'll close your file today.</p>`),
    text: (name, co) => sign(`Hi ${name},

Everyone else in this category will make you sit through a discovery call before they'll tell you a number. I'd rather just tell you: $149/month to start, on the website, no negotiation theatre.

What you get is the whole reseller motion — white-label simulations, per-client compliance certificates, your brand throughout. What you don't get is an implementation project, a seat-count negotiation, or a quarterly business review you didn't ask for.

My honest pitch is that the evaluation should cost you almost nothing: sign up, run a simulation against your own team, look at the certificate, decide. Ten minutes. If the artifact isn't something you'd hand a client's underwriter, you've learned that for free and I'll stop emailing.

Ten minutes, no card: https://phishsimai.com/register

And if the honest answer is "we already use KnowBe4 and it's fine" — tell me that. It's a perfectly good answer and I'll close your file today.`),
  },
}

// ── TOUCH 5 (day 18) — BREAKUP ───────────────────────────────────────────────
// The breakup only works if it is TRUE. This is the last touch in touchDefs and the
// lead is marked dead after it, so "I'll stop" is a fact about the system, not a tactic.
const TOUCH5: FollowUpTouch = {
  touch: 5, delayDays: 18, threaded: true,
  safe: {
    id: 't5_safe_closing',
    subject: () => `Closing your file`,
    html: (name, co) => wrap(`<p>Hi ${name},</p>
<p>I've written a few times about phishing simulation for your clients and haven't heard back, which I'll take as "not now" rather than anything worse.</p>
<p>I'm closing your file — this is my last email, and you won't hear from me again unless you reply.</p>
<p>If it becomes relevant later — a client's insurer starts asking for evidence, or a healthcare account needs a documented training program — the trial will still be there, still 30 days, still no card. Nothing to unwind if you try it and walk away.</p>
<p style="margin:22px 0"><a href="https://phishsimai.com/register" style="color:#e53e3e;font-weight:700;text-decoration:none">phishsimai.com/register</a></p>
<p>Thanks for your time either way, and good luck with the rest of the year.</p>`),
    text: (name, co) => sign(`Hi ${name},

I've written a few times about phishing simulation for your clients and haven't heard back, which I'll take as "not now" rather than anything worse.

I'm closing your file — this is my last email, and you won't hear from me again unless you reply.

If it becomes relevant later — a client's insurer starts asking for evidence, or a healthcare account needs a documented training program — the trial will still be there, still 30 days, still no card. Nothing to unwind if you try it and walk away.

phishsimai.com/register

Thanks for your time either way, and good luck with the rest of the year.`),
  },
  bold: {
    id: 't5_bold_onequestion',
    subject: () => `Last one — and a question`,
    html: (name, co) => wrap(`<p>Hi ${name},</p>
<p>This is my last email; I'm closing your file either way, so there's nothing you need to do to make me stop.</p>
<p>Before I do — if you have ten seconds, I'd genuinely value knowing which of these it was:</p>
<ul style="padding-left:20px;margin:14px 0">
  <li style="margin-bottom:6px">Already covered (KnowBe4, Huntress, something else)</li>
  <li style="margin-bottom:6px">Your clients aren't asking for it yet</li>
  <li style="margin-bottom:6px">Not worth the margin</li>
  <li style="margin-bottom:6px">Wrong person — someone else owns this</li>
</ul>
<p>One word back is plenty. We're early enough that what you tell me actually changes what we build, and a "no" with a reason is worth more to me than another unanswered email.</p>
<p>If it's the last one, pointing me at the right name is the kindest possible reply.</p>
<p style="margin:22px 0"><a href="https://phishsimai.com/register" style="color:#e53e3e;font-weight:700;text-decoration:none">phishsimai.com/register</a> — still there if it ever becomes useful.</p>
<p>Either way, thanks for reading this far.</p>`),
    text: (name, co) => sign(`Hi ${name},

This is my last email; I'm closing your file either way, so there's nothing you need to do to make me stop.

Before I do — if you have ten seconds, I'd genuinely value knowing which of these it was:

- Already covered (KnowBe4, Huntress, something else)
- Your clients aren't asking for it yet
- Not worth the margin
- Wrong person, someone else owns this

One word back is plenty. We're early enough that what you tell me actually changes what we build, and a "no" with a reason is worth more to me than another unanswered email.

If it's the last one, pointing me at the right name is the kindest possible reply.

phishsimai.com/register — still there if it ever becomes useful.

Either way, thanks for reading this far.`),
  },
}

export const FOLLOWUP_TOUCHES: FollowUpTouch[] = [TOUCH2, TOUCH3, TOUCH4, TOUCH5]

/**
 * Which variant of each touch is APPROVED to send. Empty = nothing approved yet, which
 * is the current state and the reason sequences.ts will not send a follow-up.
 *
 * The founder sets e.g. { 2: 'safe', 3: 'bold', 4: 'safe', 5: 'safe' } after editing the
 * copy. A touch with no entry here is SKIPPED, not defaulted — an unapproved body must
 * never be reachable by accident, which is the lesson from the invented copy that shipped
 * under PS-COPY-REWRITE-01.
 */
export const APPROVED_VARIANT: Record<number, 'safe' | 'bold'> = {}

export function approvedBody(touch: FollowUpTouch): FollowUpVariant | null {
  const choice = APPROVED_VARIANT[touch.touch]
  return choice ? touch[choice] : null
}
