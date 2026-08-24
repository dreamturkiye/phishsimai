/**
 * Aria — active task: Cold Email Copy A/B Test Setup
 *
 * T1 value hierarchy is frozen here. Every variant, subject line, and body block
 * MUST lead in this order. Do not reorder, dilute, or bury T1 below social proof
 * or feature laundry lists.
 *
 *   1. Price        — lead with "$299 covers 500 users"
 *   2. Speed        — "Live in under 10 minutes"
 *   3. Set & Forget — zero ongoing lift after launch
 */

export const ARIA_ACTIVE_TASK = {
  id: "aria-cold-email-ab-t1",
  agentId: "aria" as const,
  title: "Cold Email Copy A/B Test Setup",
  status: "in_progress" as const,
  priority: "high" as const,
} as const;

/** Ordered T1 hierarchy — index 0 is always the open. */
export const T1_VALUE_HIERARCHY = [
  {
    rank: 1,
    pillar: "price",
    lead: "$299 covers 500 users",
    rule: "First value claim in subject (when price-led) and first body beat. Never open on features.",
  },
  {
    rank: 2,
    pillar: "speed",
    lead: "Live in under 10 minutes",
    rule: "Second beat only after price is stated. Quantify time-to-live; no vague 'fast setup'.",
  },
  {
    rank: 3,
    pillar: "set_and_forget",
    lead: "Set & Forget",
    rule: "Third beat. Emphasize no ongoing admin lift post-launch (auto campaigns, auto training).",
  },
] as const;

export type T1Pillar = (typeof T1_VALUE_HIERARCHY)[number]["pillar"];

export type ColdEmailVariant = {
  key: string;
  /** Which T1 pillar the subject stresses; body still follows full 1→2→3 order. */
  subjectStress: T1Pillar;
  subject: string;
  /** Body beats in mandatory hierarchy order. */
  bodyBeats: [price: string, speed: string, setAndForget: string];
  cta: string;
};

/**
 * A/B matrix: subjects may stress one pillar for lift measurement, but every
 * body MUST still deliver Price → Speed → Set & Forget in that sequence.
 */
export const COLD_EMAIL_AB_VARIANTS: ColdEmailVariant[] = [
  {
    key: "A_price_lead",
    subjectStress: "price",
    subject: "$299 covers 500 users — phishing sims your team actually finishes",
    bodyBeats: [
      "$299 covers 500 users — flat, predictable, no per-seat surprise.",
      "Live in under 10 minutes: connect your domain, pick a template, send.",
      "Set & Forget: scheduled campaigns and auto-enrolled training run without you.",
    ],
    cta: "Start free — first campaign live today",
  },
  {
    key: "B_speed_subject",
    subjectStress: "speed",
    subject: "Live in under 10 minutes: phishing awareness that doesn't need a project plan",
    bodyBeats: [
      "$299 covers 500 users — one price that scales with your roster, not your inbox.",
      "Live in under 10 minutes from signup to first simulated phish.",
      "Set & Forget after launch — reporting and follow-up training on autopilot.",
    ],
    cta: "Stand up your first campaign",
  },
  {
    key: "C_set_forget_subject",
    subjectStress: "set_and_forget",
    subject: "Set & Forget phishing sims — no babysitting, no spreadsheet chase",
    bodyBeats: [
      "$299 covers 500 users so finance and security share one clear number.",
      "Live in under 10 minutes; no professional-services engagement required.",
      "Set & Forget: launch once, let cadence + training close the loop.",
    ],
    cta: "See it running on your domain",
  },
];

/** Guard used by copy lint / Aria task runner — fails loud if hierarchy is violated. */
export function assertT1Hierarchy(bodyBeats: string[]): void {
  if (bodyBeats.length < 3) {
    throw new Error(
      `[Aria T1] Cold email body must carry 3 beats (Price → Speed → Set & Forget); got ${bodyBeats.length}`,
    );
  }
  const [price, speed, setAndForget] = bodyBeats;
  const priceOk = /\$299\s+covers\s+500\s+users/i.test(price);
  const speedOk = /live in under 10 minutes/i.test(speed);
  const setOk = /set\s*&\s*forget|set and forget/i.test(setAndForget);
  if (!priceOk || !speedOk || !setOk) {
    throw new Error(
      `[Aria T1] Hierarchy violated. ` +
        `Price lead ($299 covers 500 users)=${priceOk}; ` +
        `Speed (Live in under 10 minutes)=${speedOk}; ` +
        `Set & Forget=${setOk}`,
    );
  }
}

export function renderColdEmailBody(variant: ColdEmailVariant): string {
  assertT1Hierarchy(variant.bodyBeats);
  const [price, speed, setAndForget] = variant.bodyBeats;
  return [
    price,
    "",
    speed,
    "",
    setAndForget,
    "",
    variant.cta,
  ].join("\n");
}

export const ARIA_TASK_BRIEF = {
  ...ARIA_ACTIVE_TASK,
  objective:
    "Stand up a 3-variant cold email A/B test where every variant enforces the T1 value hierarchy.",
  t1Hierarchy: T1_VALUE_HIERARCHY,
  variants: COLD_EMAIL_AB_VARIANTS,
  acceptanceCriteria: [
    "All variants call assertT1Hierarchy successfully before send-queue.",
    "Body order is immutable: (1) $299 covers 500 users → (2) Live in under 10 minutes → (3) Set & Forget.",
    "Subjects may stress one pillar for A/B lift; body never reorders T1.",
    "No variant opens on features, compliance theater, or social proof ahead of price.",
  ],
  antiPatterns: [
    "Leading with 'AI-powered' or feature grids before price",
    "Burying $299 covers 500 users below paragraph 1",
    "Replacing 'Live in under 10 minutes' with vague 'quick setup'",
    "Omitting Set & Forget or folding it into a PS",
  ],
} as const;

// Self-check at module load — task is invalid if any seeded variant drifts.
for (const v of COLD_EMAIL_AB_VARIANTS) {
  assertT1Hierarchy(v.bodyBeats);
}