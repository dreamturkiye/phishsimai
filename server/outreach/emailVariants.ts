/**
 * load_new_email_variants — email copy variants for outreach sequence testing.
 *
 * Touch ladder (1–4) with A/B bodies. Loader is idempotent on (touch, variant).
 * Used by sequence send path + local/staging test harness; does not send mail.
 */
import { getSql } from '../os/conn'

export type EmailVariant = {
  touch: 1 | 2 | 3 | 4
  variant: 'A' | 'B'
  subject: string
  bodyText: string
  bodyHtml: string
  /** Short label for dashboards / QA */
  label: string
  active: boolean
}

export const EMAIL_VARIANTS: EmailVariant[] = [
  // ── Touch 1 — cold open ──────────────────────────────────────────────────
  {
    touch: 1,
    variant: 'A',
    label: 't1a-msp-risk-hook',
    active: true,
    subject: 'Your clients’ phishing risk score (2-min read)',
    bodyText: [
      'Hi {{first_name}},',
      '',
      'Most MSPs we talk to still run annual phishing tests and call it done.',
      'Attackers don’t work on an annual calendar — and neither do the tickets',
      'that show up when a client clicks.',
      '',
      'PhishSim AI runs continuous, AI-written simulations for your client base',
      'and gives you a per-tenant risk score you can put in QBR decks.',
      '',
      'Worth a 15-minute look this week?',
      '',
      '— {{sender_name}}',
      'PhishSim AI',
    ].join('\n'),
    bodyHtml: [
      '<p>Hi {{first_name}},</p>',
      '<p>Most MSPs we talk to still run annual phishing tests and call it done.',
      'Attackers don’t work on an annual calendar — and neither do the tickets',
      'that show up when a client clicks.</p>',
      '<p>PhishSim AI runs continuous, AI-written simulations for your client base',
      'and gives you a <strong>per-tenant risk score</strong> you can put in QBR decks.</p>',
      '<p>Worth a 15-minute look this week?</p>',
      '<p>— {{sender_name}}<br/>PhishSim AI</p>',
    ].join('\n'),
  },
  {
    touch: 1,
    variant: 'B',
    label: 't1b-ticket-cost',
    active: true,
    subject: '{{company_name}} — one click, how many hours?',
    bodyText: [
      'Hi {{first_name}},',
      '',
      'When a client user fails a phish, the cost isn’t the simulation — it’s the',
      'remediation hours, the insurance questionnaire, and the trust hit on the QBR.',
      '',
      'We built PhishSim AI so MSPs can run realistic sims without burning engineer',
      'time writing lures or chasing reports.',
      '',
      'Open to a short demo if {{company_name}} is tightening cyber offerings this quarter?',
      '',
      '— {{sender_name}}',
    ].join('\n'),
    bodyHtml: [
      '<p>Hi {{first_name}},</p>',
      '<p>When a client user fails a phish, the cost isn’t the simulation — it’s the',
      'remediation hours, the insurance questionnaire, and the trust hit on the QBR.</p>',
      '<p>We built PhishSim AI so MSPs can run realistic sims without burning engineer',
      'time writing lures or chasing reports.</p>',
      '<p>Open to a short demo if {{company_name}} is tightening cyber offerings this quarter?</p>',
      '<p>— {{sender_name}}</p>',
    ].join('\n'),
  },

  // ── Touch 2 — value + proof ──────────────────────────────────────────────
  {
    touch: 2,
    variant: 'A',
    label: 't2a-insurance-angle',
    active: true,
    subject: 'Re: phishing risk score for {{company_name}}',
    bodyText: [
      'Hi {{first_name}},',
      '',
      'Quick follow-up. Carriers are asking MSPs for evidence of ongoing awareness',
      'training — not a once-a-year PDF.',
      '',
      'PhishSim AI produces exportable risk trends per tenant so you can answer',
      'those questionnaires with data instead of screenshots.',
      '',
      'Happy to show a sample report if useful.',
      '',
      '— {{sender_name}}',
    ].join('\n'),
    bodyHtml: [
      '<p>Hi {{first_name}},</p>',
      '<p>Quick follow-up. Carriers are asking MSPs for evidence of ongoing awareness',
      'training — not a once-a-year PDF.</p>',
      '<p>PhishSim AI produces <strong>exportable risk trends per tenant</strong> so you can answer',
      'those questionnaires with data instead of screenshots.</p>',
      '<p>Happy to show a sample report if useful.</p>',
      '<p>— {{sender_name}}</p>',
    ].join('\n'),
  },
  {
    touch: 2,
    variant: 'B',
    label: 't2b-peer-msp',
    active: true,
    subject: 'How peer MSPs are packaging awareness',
    bodyText: [
      'Hi {{first_name}},',
      '',
      'A pattern we’re seeing: MSPs add continuous phishing sim as a line item',
      'under vCIO / security stack, not as a free “extra.”',
      '',
      'PhishSim AI is built for multi-tenant MSP use — white-label reports,',
      'per-client campaigns, no shared-tenant leakage.',
      '',
      'If packaging security services is on your roadmap, I can walk through how',
      'others price it.',
      '',
      '— {{sender_name}}',
    ].join('\n'),
    bodyHtml: [
      '<p>Hi {{first_name}},</p>',
      '<p>A pattern we’re seeing: MSPs add continuous phishing sim as a line item',
      'under vCIO / security stack, not as a free “extra.”</p>',
      '<p>PhishSim AI is built for multi-tenant MSP use — white-label reports,',
      'per-client campaigns, no shared-tenant leakage.</p>',
      '<p>If packaging security services is on your roadmap, I can walk through how',
      'others price it.</p>',
      '<p>— {{sender_name}}</p>',
    ].join('\n'),
  },

  // ── Touch 3 — soft break / objection ─────────────────────────────────────
  {
    touch: 3,
    variant: 'A',
    label: 't3a-time-objection',
    active: true,
    subject: 'Still drowning in alert noise?',
    bodyText: [
      'Hi {{first_name}},',
      '',
      'Last note if timing is bad — I know MSP calendars are brutal mid-quarter.',
      '',
      'Setup is under 30 minutes per tenant; campaigns run on autopilot after that.',
      'No content writers required on your side.',
      '',
      'If “not now” is the answer, just reply NO and we’ll stay out of the inbox.',
      '',
      '— {{sender_name}}',
    ].join('\n'),
    bodyHtml: [
      '<p>Hi {{first_name}},</p>',
      '<p>Last note if timing is bad — I know MSP calendars are brutal mid-quarter.</p>',
      '<p>Setup is under 30 minutes per tenant; campaigns run on autopilot after that.',
      'No content writers required on your side.</p>',
      '<p>If “not now” is the answer, just reply <strong>NO</strong> and we’ll stay out of the inbox.</p>',
      '<p>— {{sender_name}}</p>',
    ].join('\n'),
  },
  {
    touch: 3,
    variant: 'B',
    label: 't3b-stack-fit',
    active: true,
    subject: 'Fits beside your PSA / RMM — not another silo',
    bodyText: [
      'Hi {{first_name}},',
      '',
      'One reason MSPs skip new security tools: another console nobody logs into.',
      '',
      'PhishSim AI is API-first and report-export friendly so results land in the',
      'QBRs and PSA tickets you already run — not a graveyard dashboard.',
      '',
      'Want the integration one-pager?',
      '',
      '— {{sender_name}}',
    ].join('\n'),
    bodyHtml: [
      '<p>Hi {{first_name}},</p>',
      '<p>One reason MSPs skip new security tools: another console nobody logs into.</p>',
      '<p>PhishSim AI is API-first and report-export friendly so results land in the',
      'QBRs and PSA tickets you already run — not a graveyard dashboard.</p>',
      '<p>Want the integration one-pager?</p>',
      '<p>— {{sender_name}}</p>',
    ].join('\n'),
  },

  // ── Touch 4 — breakup ────────────────────────────────────────────────────
  {
    touch: 4,
    variant: 'A',
    label: 't4a-breakup',
    active: true,
    subject: 'Closing the loop, {{first_name}}',
    bodyText: [
      'Hi {{first_name}},',
      '',
      'I’ll assume the timing isn’t right and close this thread so I’m not noise.',
      '',
      'If continuous phishing simulation + tenant risk scoring becomes relevant',
      'for {{company_name}} later, reply anytime — happy to restart from a clean slate.',
      '',
      '— {{sender_name}}',
      'PhishSim AI',
    ].join('\n'),
    bodyHtml: [
      '<p>Hi {{first_name}},</p>',
      '<p>I’ll assume the timing isn’t right and close this thread so I’m not noise.</p>',
      '<p>If continuous phishing simulation + tenant risk scoring becomes relevant',
      'for {{company_name}} later, reply anytime — happy to restart from a clean slate.</p>',
      '<p>— {{sender_name}}<br/>PhishSim AI</p>',
    ].join('\n'),
  },
  {
    touch: 4,
    variant: 'B',
    label: 't4b-breakup-resource',
    active: true,
    subject: 'Resource before I bow out',
    bodyText: [
      'Hi {{first_name}},',
      '',
      'Last touch from me. Whether or not we talk, this checklist is free:',
      '“5 questions carriers ask MSPs about awareness training.”',
      '',
      'Reply CHECKLIST and I’ll send it. Otherwise I’ll leave you in peace.',
      '',
      '— {{sender_name}}',
    ].join('\n'),
    bodyHtml: [
      '<p>Hi {{first_name}},</p>',
      '<p>Last touch from me. Whether or not we talk, this checklist is free:',
      '“5 questions carriers ask MSPs about awareness training.”</p>',
      '<p>Reply <strong>CHECKLIST</strong> and I’ll send it. Otherwise I’ll leave you in peace.</p>',
      '<p>— {{sender_name}}</p>',
    ].join('\n'),
  },
]

type Sql = ReturnType<typeof getSql>

export async function ensureEmailVariantsTable(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS ps_outreach_email_variants (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      touch        SMALLINT NOT NULL CHECK (touch BETWEEN 1 AND 4),
      variant      CHAR(1) NOT NULL CHECK (variant IN ('A', 'B')),
      label        TEXT NOT NULL,
      subject      TEXT NOT NULL,
      body_text    TEXT NOT NULL,
      body_html    TEXT NOT NULL,
      active       BOOLEAN NOT NULL DEFAULT TRUE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (touch, variant)
    )
  `.catch(() => {})
}

/** Idempotent upsert of all catalog variants. Safe to re-run in CI / staging. */
export async function loadNewEmailVariants(
  sql: Sql = getSql(),
): Promise<{ upserted: number; labels: string[] }> {
  await ensureEmailVariantsTable(sql)

  const labels: string[] = []
  for (const v of EMAIL_VARIANTS) {
    await sql`
      INSERT INTO ps_outreach_email_variants
        (touch, variant, label, subject, body_text, body_html, active, updated_at)
      VALUES (
        ${v.touch},
        ${v.variant},
        ${v.label},
        ${v.subject},
        ${v.bodyText},
        ${v.bodyHtml},
        ${v.active},
        NOW()
      )
      ON CONFLICT (touch, variant) DO UPDATE SET
        label      = EXCLUDED.label,
        subject    = EXCLUDED.subject,
        body_text  = EXCLUDED.body_text,
        body_html  = EXCLUDED.body_html,
        active     = EXCLUDED.active,
        updated_at = NOW()
    `
    labels.push(v.label)
  }

  return { upserted: labels.length, labels }
}

/** Pick active variant for a touch (A/B by lead id hash, stable). */
export function pickVariantForLead(
  touch: 1 | 2 | 3 | 4,
  leadKey: string,
  catalog: EmailVariant[] = EMAIL_VARIANTS,
): EmailVariant {
  const pool = catalog.filter((v) => v.touch === touch && v.active)
  if (pool.length === 0) {
    throw new Error(`No active email variants for touch ${touch}`)
  }
  let h = 0
  for (let i = 0; i < leadKey.length; i++) h = (h * 31 + leadKey.charCodeAt(i)) >>> 0
  return pool[h % pool.length]!
}

export async function getActiveVariantsFromDb(
  sql: Sql = getSql(),
  touch?: 1 | 2 | 3 | 4,
): Promise<EmailVariant[]> {
  await ensureEmailVariantsTable(sql)
  const rows = touch
    ? await sql`
        SELECT touch, variant, label, subject, body_text, body_html, active
        FROM ps_outreach_email_variants
        WHERE active = TRUE AND touch = ${touch}
        ORDER BY touch, variant
      `
    : await sql`
        SELECT touch, variant, label, subject, body_text, body_html, active
        FROM ps_outreach_email_variants
        WHERE active = TRUE
        ORDER BY touch, variant
      `

  return (rows as any[]).map((r) => ({
    touch: Number(r.touch) as 1 | 2 | 3 | 4,
    variant: String(r.variant).toUpperCase() as 'A' | 'B',
    label: r.label,
    subject: r.subject,
    bodyText: r.body_text,
    bodyHtml: r.body_html,
    active: Boolean(r.active),
  }))
}

/** CLI / cron entry: node -e or route handler calls this. */
export async function runLoadNewEmailVariants(): Promise<{
  ok: true
  upserted: number
  labels: string[]
}> {
  const result = await loadNewEmailVariants()
  return { ok: true, ...result }
}