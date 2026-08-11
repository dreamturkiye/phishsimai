// ─────────────────────────────────────────────────────────────────────────────
//  PS-LEARNING-CONTENT-01 — the on-click micro-lesson, tied to the specific lure.
//
//  The completion loop already works (click -> enrol -> lesson -> acknowledge -> recorded). What was
//  missing is CONTENT: the landing page showed five generic tips for every email. This replaces that
//  with a 30-60s lesson keyed to the attack type of the simulation the person actually fell for, and
//  the landing page shows the real sender + subject they received, so "why THIS email was suspicious"
//  is concrete rather than boilerplate.
//
//  All copy here is original security-awareness writing. Each attack type gets: a one-line frame,
//  and the specific red flags that give THAT lure away — the tells a real version of it would carry.
// ─────────────────────────────────────────────────────────────────────────────

export type AttackType = 'credential_harvest' | 'link_click' | 'attachment' | 'vishing' | 'smishing' | 'pretexting'

export type LearningMoment = {
  /** One-line frame for what this lure was trying to do. */
  frame: string
  /** The specific tells for THIS attack type — what would have given a real one away. */
  redFlags: string[]
  /** The single habit that would have stopped it. */
  habit: string
}

export const LEARNING_MOMENTS: Record<AttackType, LearningMoment> = {
  credential_harvest: {
    frame: 'This email tried to send you to a fake sign-in page to capture your password.',
    redFlags: [
      'The link went to a look-alike domain, not the real service — the address bar is the proof, not the logo.',
      'It created urgency ("verify now", "account suspended") so you would act before checking.',
      'A real provider never asks you to confirm your password by following an email link.',
    ],
    habit: 'Never enter a password from an email link. Open the site yourself in a new tab and sign in there.',
  },
  link_click: {
    frame: 'This email wanted you to click a link that a real attacker would use to run code or track you.',
    redFlags: [
      'The visible text and the real destination did not match — hovering the link shows the true URL.',
      'The sender address was slightly off from the brand it imitated (extra letters, wrong domain).',
      'It leaned on curiosity or fear ("your delivery is held", "unusual activity") to earn the click.',
    ],
    habit: 'Hover every link before clicking and read the real domain. If it is not exactly right, do not click.',
  },
  attachment: {
    frame: 'This email carried an attachment that, in a real attack, would install malware when opened.',
    redFlags: [
      'An unexpected attachment — invoices, receipts, "documents to review" you did not ask for.',
      'The file wanted you to enable macros or "enable content" to view it — that is the payload.',
      'The message pressured you to open it quickly and quietly.',
    ],
    habit: 'Do not open unexpected attachments. Confirm with the sender through a channel you already trust.',
  },
  vishing: {
    frame: 'This was a voice-phishing setup — getting you to call a number or trust a caller who is not who they claim.',
    redFlags: [
      'A phone number in an email or text, urging you to call about a problem you did not know you had.',
      'The "support" line asked for a code, password, or remote access to your machine.',
      'Pressure to stay on the line and act immediately, discouraging you from hanging up to verify.',
    ],
    habit: 'Never call the number in the message. Look up the official number yourself and call that.',
  },
  smishing: {
    frame: 'This was SMS phishing — a text designed to look like a delivery, bank, or account alert.',
    redFlags: [
      'A link in a text message from a number or shortcode you do not recognise.',
      'A claim about a package, payment, or login you were not expecting.',
      'A shortened or odd-looking URL that hides the real destination.',
    ],
    habit: 'Do not tap links in unexpected texts. Open the company’s app or website directly instead.',
  },
  pretexting: {
    frame: 'This used a believable story — a colleague, vendor, or executive — to get you to act without checking.',
    redFlags: [
      'A request that skips normal process ("urgent, keep this between us", "I’m in a meeting").',
      'A change to payment details, a gift-card ask, or a request for sensitive information.',
      'The sender name looked right but the actual address or channel was subtly wrong.',
    ],
    habit: 'Verify any unusual or financial request out-of-band — a quick call to the real person settles it.',
  },
}

/** A safe default for any token whose attack type cannot be resolved — still specific and useful. */
export const DEFAULT_MOMENT: LearningMoment = {
  frame: 'This was a simulated phishing email designed to look legitimate and get you to act quickly.',
  redFlags: [
    'Check the sender’s real email address, not just the display name.',
    'Hover a link before clicking to see where it actually goes.',
    'Be suspicious of urgency, unexpected requests, and anything asking for credentials or payment.',
  ],
  habit: 'When in doubt, stop and verify through a channel you already trust before acting.',
}

export function momentFor(attackType: string | null | undefined): LearningMoment {
  if (attackType && attackType in LEARNING_MOMENTS) return LEARNING_MOMENTS[attackType as AttackType]
  return DEFAULT_MOMENT
}

/** Render the red-flag list + habit as the landing page's lesson block. Pure — takes the resolved
 *  moment and the real email details, returns HTML fragment. */
export function lessonHtml(moment: LearningMoment, ctx: { senderName?: string | null; subject?: string | null }): string {
  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const from = ctx.senderName ? `<div class="lm-meta">From: <strong>${esc(ctx.senderName)}</strong></div>` : ''
  const subj = ctx.subject ? `<div class="lm-meta">Subject: <strong>${esc(ctx.subject)}</strong></div>` : ''
  const flags = moment.redFlags.map((f) => `<li>${esc(f)}</li>`).join('')
  return (
    `<div class="lm-frame">${esc(moment.frame)}</div>` +
    (from || subj ? `<div class="lm-email">${from}${subj}</div>` : '') +
    `<div class="tips"><h3>Why this one was suspicious</h3><ul>${flags}</ul></div>` +
    `<div class="lm-habit"><strong>The habit that stops it:</strong> ${esc(moment.habit)}</div>`
  )
}
