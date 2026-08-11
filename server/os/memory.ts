import { neon } from '@neondatabase/serverless'
import { getSql } from './conn'

export type MemoryType = 'company' | 'customer' | 'campaign' | 'strategic' | 'operating'
export interface MemoryEntry {
  company_id: string; type: MemoryType; key: string; value: string; confidence: number; source: string
}

export async function ensureMemoryTable() {
  const sql = getSql()
  await sql`CREATE TABLE IF NOT EXISTS janet_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL DEFAULT 'phishsimai',
    type TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    confidence FLOAT NOT NULL DEFAULT 1.0,
    source TEXT NOT NULL DEFAULT 'janet',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, type, key)
  )`
}

export async function rememberFact(e: MemoryEntry) {
  const sql = getSql()
  await ensureMemoryTable()
  await sql`INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
    VALUES (${e.company_id}, ${e.type}, ${e.key}, ${e.value}, ${e.confidence}, ${e.source})
    ON CONFLICT (company_id, type, key) DO UPDATE SET
      value = EXCLUDED.value,
      confidence = EXCLUDED.confidence,
      source = EXCLUDED.source,
      updated_at = NOW()`
}

/**
 * PS-RATCHET-01: `source` filters in SQL, and that is the whole point of it existing.
 *
 * Callers that want one agent's rows used to do `recallMemory(c, undefined, 20).filter(r => r.source === id)`
 * — a filter AFTER the LIMIT. The 20 newest rows company-wide are dominated by whoever writes most
 * (measured 2026-07-26: janet 11, founder_hq 6, architect 1, founder 1, marcus_watcher 1), so the
 * filter matched NOTHING and every non-Janet agent's "Knowledge base" section was silently empty.
 * Nobody noticed because an empty knowledge base is indistinguishable from a new agent.
 *
 * That also meant the UNVERIFIED-SELF-REPORT labelling written by the standup loop was never read
 * by the agent it was written for — the safety rail existed and was unreachable. Filtering in SQL
 * makes the limit mean "20 of THIS agent's rows", which is what every call site already assumed.
 */
export async function recallMemory(companyId: string, type?: MemoryType, limit = 20, source?: string): Promise<any[]> {
  const sql = getSql()
  await ensureMemoryTable()
  if (type && source) {
    return await sql`SELECT * FROM janet_memory WHERE company_id=${companyId} AND type=${type} AND source=${source} ORDER BY updated_at DESC LIMIT ${limit}` as any
  }
  if (source) {
    return await sql`SELECT * FROM janet_memory WHERE company_id=${companyId} AND source=${source} ORDER BY updated_at DESC LIMIT ${limit}` as any
  }
  if (type) {
    return await sql`SELECT * FROM janet_memory WHERE company_id=${companyId} AND type=${type} ORDER BY updated_at DESC LIMIT ${limit}` as any
  }
  return await sql`SELECT * FROM janet_memory WHERE company_id=${companyId} ORDER BY updated_at DESC LIMIT ${limit}` as any
}

export async function recallContext(companyId: string, limit = 40): Promise<string> {
  const mems = await recallMemory(companyId, undefined, limit)
  if (!mems.length) return 'No memory yet.'
  const grouped: Record<string, string[]> = {}
  for (const m of mems) {
    if (!grouped[m.type]) grouped[m.type] = []
    grouped[m.type].push(`${m.key}: ${m.value}`)
  }
  return Object.entries(grouped).map(([t, items]) => `[${t.toUpperCase()}]\n${items.join('\n')}`).join('\n\n')
}

export async function learnFromOutcome(companyId: string, action: string, outcome: string, lesson: string) {
  await rememberFact({ company_id: companyId, type: 'strategic', key: `lesson_${Date.now()}`,
    value: `Action:${action}|Outcome:${outcome}|Lesson:${lesson}`, confidence: 0.9, source: 'reflection' })
}


/**
 * PS-JANET-DOCTRINE-01 — lessons that must OUTLIVE any prompt edit.
 *
 * A system prompt is one thin-memory turn from being rewritten, summarised or truncated, and the
 * two facts below were each learned expensively. They are written to os_agent_lessons, which
 * getAgentLessonsForPrompt() reads into every agent's context regardless of what the prompt
 * currently says — so reverting the prompt cannot revert the lesson.
 *
 * DELIBERATELY NOT IN kaan-os-core. The first version of this lived in
 * kaan-os-core/outcomeLearning.ts and CI rejected it: that directory is a pinned vendored copy of
 * dreamturkiye/kaan-os-core and editing it in place forks the shared core silently. These lessons
 * are PhishSim doctrine, not core behaviour, so they belong here in product-owned code. The table
 * is shared; the content is ours.
 *
 * Both recorded as success=false: they are failures we paid for, and the negative confidence_delta
 * is the point. Idempotent by signature.
 */
export const PERMANENT_LESSONS: { signature: string; lesson: string }[] = [
  {
    signature: 'phishsim:insurance-angle-failed',
    lesson:
      'INSURANCE/COMPLIANCE-URGENCY OPENER FAILED, MEASURED: 908 cold sends (2026-07-04..08-02) ' +
      'produced 1 human reply and it was hostile ("stop emailing me"). Do NOT lead outreach, ' +
      'landing copy, or a pitch with insurance, underwriting, audits, or breach-fear framing. ' +
      'Lead with price ($299/500 users = 60c), 10-minute setup, no-card 30-day trial, and MSP ' +
      'margin. Compliance is a SECOND-position supporting point for larger MSPs, never the opener.',
  },
  {
    signature: 'phishsim:competitor-pricing-study-2026',
    lesson:
      'THE "ONE OF THE LOWEST PER-SEAT PRICES IN THE INDUSTRY" CLAIM HAS A BASIS. Founder market ' +
      'pricing study, conducted pre-2026-08. It is attributed research, NOT a machine-verified ' +
      'fetch — do not cite it as if a system measured it, and do not re-flag it as unverified ' +
      'fabrication either. Approved for outbound copy (touch-2, 2026-08-03). CROSS-CHECK when ' +
      'os_competitor_intel populates: if a fetched competitor price contradicts it, the fetched ' +
      'row wins and the copy changes. Never state a specific competitor price from memory.',
  },
  {
    signature: 'phishsim:pricing-frozen-live-stripe',
    lesson:
      'PRICING IS FROZEN AND LIVE-STRIPE-SOURCED: Starter $149 (100 users), Growth $299 (500), ' +
      'Pro $749 (2,500), Enterprise $1,499 (10,000); annual = 10x monthly; trial 30 days no card. ' +
      'A prompt once carried $99/$249/$499/$999 — all four wrong, and ea.ts/finance.ts proposed a ' +
      '$49/mo founding rate that exists in NO Stripe account. NEVER quote a price not read from ' +
      'server/stripe/prices.ts, never discount or invent one, never propose a pricing change.',
  },
]

/** Write the permanent doctrine lessons once. Safe to call on every boot. */
export async function seedPermanentLessons(): Promise<void> {
  const sql = getSql()
  for (const l of PERMANENT_LESSONS) {
    const existing = (await sql`SELECT 1 FROM os_agent_lessons
      WHERE company_id='phishsimai' AND signature=${l.signature} LIMIT 1`.catch(() => [])) as any[]
    if (existing.length) continue
    await sql`INSERT INTO os_agent_lessons
      (company_id, agent_id, source, signature, lesson, success, score, confidence_delta)
      VALUES ('phishsimai', 'janet', 'experiment', ${l.signature}, ${l.lesson}, false, 0, -0.08)`
      .catch(() => {})
  }
}

export async function seedPhishSimMemory() {
  const entries: MemoryEntry[] = [
    { company_id:'phishsimai', type:'company', key:'product', value:'AI-powered phishing simulation + security awareness training for MSPs and IT teams. Automated campaigns, real-time reporting, staff training post-click.', confidence:1, source:'founder' },
    // PS-PRICE-01: this seed carried Starter $99/Growth $249/Pro $499/Unlimited $999 with
    // 100/500/2000 seats at confidence:1, source:'founder' -- numbers that never existed in
    // Stripe. Janet quoted them to prospects and to Super Janet for weeks, and Finn built a
    // 30-day revenue forecast on a FOURTH set ($149/$399/$799/$1499). A seeded belief marked
    // 'founder' at confidence 1 is indistinguishable from fact to every agent downstream, so
    // it is never checked. Pricing is a §5 founder hard stop: if Stripe changes, THIS LINE
    // changes in the same commit, or the OS starts selling a product that does not exist.
    { company_id:'phishsimai', type:'company', key:'pricing', value:'Starter $149/mo or $1490/yr (1 client org, 25 users, 5 templates/mo). Growth $299/mo or $2990/yr (5 client orgs, 100 users, 15 templates/mo) - Most Popular. Pro $749/mo or $7490/yr (20 client orgs, 500 users, unlimited templates). Enterprise $1499/mo or $14990/yr (unlimited client orgs, unlimited users). Annual billing saves 17%. No free tier is sold; \"free\" is only the post-cancellation state. SOURCE OF TRUTH: Stripe, mirrored in client/src/pages/OrgSettings.tsx (live price_1Tner... IDs). Never quote other numbers.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'company', key:'icp', value:'MSP owners and IT Directors at SMBs 50-500 employees. Compliance-driven buyers: SOC2, HIPAA, PCI, ISO27001.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'company', key:'differentiator', value:'AI-generated phishing templates that evolve weekly. 10-minute setup. White-label for MSPs. Automated training post-click.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'company', key:'domain', value:'phishsimai.com — Resend verified, sarah@phishsimai.com outbound sender', confidence:1, source:'system' },
    { company_id:'phishsimai', type:'company', key:'persona', value:'Sarah Mitchell - Head of Compliance Partnerships. Professional, compliance-focused outreach.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'company', key:'mia_cs', value:'Mia — in-app customer success agent on PhishSim dashboard. Helps trial users activate (targets → campaign → launch), answers product questions, collects feedback to product_feedback + Telegram. Distinct from Janet (HQ CGO) and Sarah (outbound).', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'company', key:'founder_workflow', value:'Kaan operates as Founder/GM/PM/Software Architect ONLY. NEVER writes application code in Cursor. Specs in docs/architect/SPEC-*.md. Implementation: local Ollama codegeex4:9b. Architect verifies build/test/probe then deploys. Saved 2026-06-30.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'company', key:'os_version', value:'4.5.1', confidence:1, source:'architect' },
    { company_id:'phishsimai', type:'operating', key:'self_heal_probe_20260630', value:'Probe SELF_HEAL_PROBE: Telegram 1+2 OK. Marcus diagnosis FAILED (confidence 0%, Diagnosis failed). Spec SPEC-self-heal-v4.5.1 written. Frontend telemetry + await Marcus + diagnosis fix required.', confidence:1, source:'architect' },
    { company_id:'phishsimai', type:'company', key:'linkedin_sarah', value:'Sarah Mitchell | Head of Compliance Partnerships @ PhishSimAI | LinkedIn voice: professional, warm, compliance-first (not salesy). Posts about MSP compliance (HIPAA, SOC2, NY DFS, CMMC), breach stats (67% start with phishing, $4.45M avg cost), phishing simulation ROI, audit readiness. MANDATORY: every LinkedIn post includes a designed marketing hero image (1080×1080) like the first post — split-screen laptop (phishing email vs compliance dashboard), PhishSimAI logo, bold headline ON image ("Phishing Simulation. One-Click Compliance." style), feature row. Preview links show WYSIWYG LinkedIn feed mock (text + image + engagement bar) for founder approval. Connection request tone: peer MSP/compliance professional. Sign-off: Sarah Mitchell, Head of Compliance Partnerships, PhishSimAI. CTA: free phishing simulation or compliance audit.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'campaign', key:'linkedin_sarah_first_post', value:'First Sarah LinkedIn post template: marketing image = split laptop (left: phishing "Urgent Reset Password" + hook; right: Simulation Complete dashboard with SOC2/HIPAA/PCI badges). Headline on image: "Phishing Simulation. One-Click Compliance." Sub: "Built for MSPs who manage 50–500 seats." Copy: audit evidence gap for MSPs, one-click compliance, white-label. Reference asset: /brand/sarah-linkedin-reference-v2.png', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'company', key:'reddit_sarah', value:'Sarah Mitchell Reddit persona — dedicated account (not founder login). Target subs: r/msp, r/MSSP, r/sysadmin, r/cybersecurity, r/compliance. Voice: helpful peer MSP/compliance practitioner, 90% value / 10% soft product mention. Janet auto-posts via SARAH_REDDIT_USERNAME + SARAH_REDDIT_PASSWORD in Vercel env (never in chat). Cron /api/os/sarah-social 10:00+16:00 UTC. Limits: 3 comments/day, 1 post/day. PostForMe = LinkedIn only, not Reddit.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'operating', key:'linkedin_sarah_ops', value:'Sarah LinkedIn autopost NOT LIVE until POSTFORME_API_KEY in Vercel. Janet answers from janetOpsSnapshot — must state blocker, never say "waiting on marketing". Reddit cron 10+16 UTC separate. Target: 2-3 LinkedIn posts/week when PostForMe wired.', confidence:1, source:'system' },
    { company_id:'phishsimai', type:'campaign', key:'touch1_best_subject', value:'Phishing simulation for {company} — free compliance audit', confidence:0.7, source:'initial' },
    // PS-JANET-DOCTRINE-01: touches 2-5 were DELETED in PS-COPY-REWRITE-01 (their bodies carried an
    // invented case study and a dead link). The sequence is touch-1 only until replacement copy is
    // approved, and the cap is the ramp value, not 20.
    { company_id:'phishsimai', type:'campaign', key:'current_sequence', value:'TOUCH-1 ONLY. Touches 2-5 were deleted 2026-07-2x (invented case study, dead link) and are not scheduled; SEQUENCE in sequences.ts is intentionally empty. Cap is the warm-up ramp (currently 50/day, RAMP_MAX). Bounce breaker PAUSE_ON_BOUNCE_RATE=0.08 over a 7-day window.', confidence:1, source:'system' },
    { company_id:'phishsimai', type:'campaign', key:'outreach_batch_1', value:'0 MSP leads seeded yet. Target: MSP owners + IT Directors 50-500 employees. Compliance-driven.', confidence:1, source:'system' },
    // PS-JANET-DOCTRINE-01: said 'Use in every touch'. Breach-fear stats ARE the demoted angle, and a
    // standing instruction to inject them into every message is what produced the failed pitch.
    // Kept as background context with its source, explicitly NOT a copy directive.
    { company_id:'phishsimai', type:'campaign', key:'key_stat', value:'BACKGROUND ONLY, NOT A COPY DIRECTIVE: industry reporting (IBM Cost of a Data Breach) attributes a large share of breaches to phishing. Do NOT open outreach or landing copy with breach statistics — that angle was measured at 908 sends / 1 hostile reply. Cite a statistic only if a prospect asks, and only with its source named.', confidence:0.6, source:'research' },
    // PS-JANET-DOCTRINE-01: this was a hand-written snapshot that drifted from the real gate. The
    // level is EARNED and auto-advances; a seeded string can only ever be stale. Point at the source.
    { company_id:'phishsimai', type:'operating', key:'autonomy_level', value:'DO NOT READ A LEVEL FROM THIS STRING. Enforcement level is os_autonomy_state.level, earned and auto-advanced by the 06:40 cron; the gate map is autonomyGate.ts ACTION_MIN_LEVEL (send_simulation l4, crm_write l4, deploy l5). Posture (os_posture_state) is a SEPARATE axis declared by a human and is never permission.', confidence:1, source:'system' },
    // PS-JANET-DOCTRINE-01: the "founding rate $49/mo" was a ROGUE PRICE — it exists in no Stripe
    // account, was seeded by an agent at confidence 0.9, and any agent reading it would have quoted
    // it to a prospect as an approved offer. Pricing is a founder hard stop; an agent may not invent
    // a discount. Removed. The priority itself is real and stays.
    { company_id:'phishsimai', type:'strategic', key:'week1_priority', value:'Close the first paying MSP. One MSP = many end customers, so MSP LTV dwarfs a direct SMB. NO discount, founding rate or custom price may be offered — pricing is frozen at the live Stripe values and only Kaan changes it.', confidence:0.9, source:'founder' },
    // PS-JANET-DOCTRINE-01: was 'compliance-urgency, reference breach stats'. That framing was
    // MEASURED over 908 cold sends and produced 1 reply, hostile. Replaced with the price-led
    // doctrine; compliance drops to a second-position supporting point.
    { company_id:'phishsimai', type:'operating', key:'tone', value:'Direct, specific, numeric. LEAD WITH: price ($299 covers 500 users = 60c each, 30c on Pro), 10-minute setup, no-card 30-day trial, and MSP margin (flat per-MSP pricing means adding a client grows margin). Compliance/insurance is a DEMOTED supporting point for larger MSPs — never the opener, never urgency framing. No breach-fear, no scarcity, no unsourced statistics.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'operating', key:'os_version', value:'Kaan AI OS v4.5.4 — PhishSimAI Edition (Neon Postgres + first-party site analytics)', confidence:1, source:'system' },
    { company_id:'phishsimai', type:'operating', key:'site_analytics', value:'Kaan OS Analytics v4.5.4 — free first-party pageview tracking in os_site_analytics (Neon). HQ Analytics tab. No Google/Umami account. Hashed visitors, UTM capture, top pages/referrers. Janet uses for growth decisions.', confidence:1, source:'system' },
    // PS-CREDPHANTOM-01. A capability the team cannot see is one they will re-diagnose as
    // missing. Between 2026-07-24 and 07-26 Marcus opened the same investigation three times
    // under three titles ("the technical chain for the attack vector is broken", 10/10
    // confidence), Vera and Finn echoed it, and Janet kept assigning it — all from the single
    // number "credentials submitted: 0", which at the time sat over TWO clicks. Nothing in the
    // OS said the capture existed. Seeding the build as a fact, with its evidence, is what
    // closes the premise; getCompanyContext states the same thing every cycle.
    { company_id:'phishsimai', type:'company', key:'credential_capture', value:'BUILT AND LIVE since 2026-07-24 (PS-CREDPAGE-01, pinned by server/credPage.test.ts). A credential_harvest simulation serves a real fake login page at /c/:token; submitting it POSTs to /submit/:token, which sets credentialSubmittedAt on that recipient\'s campaign_results row. BY DESIGN the password input has NO name attribute and the handler reads ONLY the token — PhishSim records THAT a credential was submitted, never WHAT was submitted. This is the defensible design, not an unfinished one. Therefore "credentials submitted: 0" is a BEHAVIOURAL result (nobody who clicked has filled the form in yet), NOT a broken capture layer, template misconfiguration or reporting gap. That premise was investigated and CLOSED on 2026-07-24 — do not reopen it. Nor should it be reopened as a CONVERSION question (PS-SIMFRICTION-01, 2026-07-29): every simulation ever sent went to our own internal org, so there is no visitor behaviour to study and no page change that could move the number. Building capture-by-default or storing the typed password is REFUSED outright — a liability, not a feature.', confidence:1, source:'architect' },
    // PS-INTERNAL-SIM-01 (2026-07-29, founder directive). Vera read a 40% click rate off 5
    // internal sends and compared it to a 10-15% industry benchmark; Rex read the same rates
    // as "high engagement, conversion friction". The rates are real — what was invented is
    // that they say anything about the market. Seed the provenance as a durable fact so the
    // interpretation cannot be re-derived from the bare number tomorrow.
    { company_id:'phishsimai', type:'company', key:'sim_metrics_provenance', value:'PhishSim simulation metrics (sent/open/click/submit/report rates) are NOT market data and must never be used as one. Measured 2026-07-29: all 5 simulations ever sent belong to org 8 "PhishSim Internal" — the founder\'s own org. Zero went to a real external customer\'s employees. So "100% open rate" and "40% click rate" describe US testing OURSELVES on a sample of 5. Do NOT compare them to industry benchmarks, do NOT describe them as engagement, vulnerability, urgency or demand, and do NOT build outreach narratives, pricing arguments or campaign strategy on them. They prove the product works end-to-end, which is real and useful, and that is ALL they prove. These become market data only when real external recipients exist at volume.', confidence:1, source:'founder' },
    // PS-FAKEPIPELINE-01 (2026-07-29, founder directive — resurfacing for the second time).
    // The "4 free orgs" read as a conversion pipeline and produced a pricing campaign aimed
    // mostly at ourselves. getCompanyContext now subtracts the internal/test orgs every cycle;
    // this states the same fact durably, because the illusion has come back once already.
    { company_id:'phishsimai', type:'company', key:'real_pipeline', value:'There is exactly ONE real external prospect, and any plan premised on more is aimed at ourselves. The 4 free orgs are NOT 4 leads: org 8 "PhishSim Internal" is the founder\'s own (kaanari@mac.com); orgs 6 "ai worker" and 7 "sending" are ONE person\'s duplicated throwaway test signups (asadbek.munasar@forliion.com). Only org 9 "egroth" (info@belldesign.net, trial to 2026-08-08) is a genuine outside trial. Do NOT propose a "convert the 4 free orgs" pricing campaign, follow-up cadence or CRM stage mapping — the denominator is 1. With a pipeline this small, conversion work cannot move revenue; the binding constraint is TOP OF FUNNEL — getting new real MSPs in. Propose top-of-funnel work instead.', confidence:1, source:'founder' },
    // PS-CREDPHANTOM-01. PhishSim's outreach runs through Sarah Mitchell. "Kaan's LinkedIn" is
    // not a PhishSim channel, and an assignment aimed at one is misrouted work, not a plan.
    { company_id:'phishsimai', type:'company', key:'gtm_channels', value:'PhishSim GTM runs through ONE outbound identity: Sarah Mitchell, Head of Compliance Partnerships — sarah@phishsimai.com email, Sarah\'s LinkedIn, Sarah\'s Reddit. Audience: MSP owners and IT Directors, compliance-led. Kaan\'s personal/CEO LinkedIn is NOT a PhishSim marketing channel and no agent should plan content for it; founder-personal posting is out of scope. Marketing work belongs to Sarah\'s channels or it is misrouted. PhishSim is also a SEPARATE product from any other in the portfolio: never carry another product\'s audience, personas, offers or content strategy into PhishSim work, and never plan for a channel not listed here.', confidence:1, source:'founder' },
  ]
  for (const e of entries) await rememberFact(e)
  // PS-JANET-DOCTRINE-01: seed the two lessons that must survive a prompt rewrite. They live in
  // os_agent_lessons (read into every agent's context by getAgentLessonsForPrompt) rather than the
  // system prompt, so truncating or rewriting JANET_SYSTEM cannot revert the pricing values or
  // resurrect the insurance-urgency pitch. Idempotent by signature; never fails the seed.
  await seedPermanentLessons().catch(() => {})
  return entries.length
}
