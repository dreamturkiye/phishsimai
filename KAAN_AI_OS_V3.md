# Kaan AI OS v3.0 — Master Architecture Document
**ScrollFuel Edition | June 28, 2026 | Dream Türkiye**

---

## Version History
| Version | Date | Changes |
|---|---|---|
| 1.0 | May 2026 | ARIA outreach engine, basic sequences |
| 2.0 | Jun 2026 | Janet CGO v1, memory layer, self-healing |
| 2.1 | Jun 2026 | 8 sub-agents, magic checkout, reply parser |
| **3.0** | **Jun 28 2026** | **Full HQ dashboard, voice interface, A/B engine, self-serve journey, V3 canonical template** |
| **3.1** | **Jun 28 2026** | **Smart Lead Researcher Agent (hourly, Groq+Hunter), Agent Health Monitoring (agent_health table, staleness detection, HQ visibility)** |

---

## 1. System Overview

Kaan AI OS is a fully autonomous business operating system that runs a company's growth, outreach, marketing, and customer success functions with minimal daily founder interaction (<15 min/day). It is designed to be replicated across multiple businesses in the Dream Türkiye portfolio.

**Current deployments:**
- ScrollFuel (scrollfuel.io) — UGC ad generation SaaS
- PhishSimAi (phishsimai.com) — Security awareness training SaaS [v3.0 replication in progress]

**Core principle:** The system operates at L4 autonomy by default, escalating to L3 (founder approval) only for decisions above defined thresholds. Janet is the brain. Founder interaction is limited to approvals, strategic direction, and weekly review.

---

## 2. Full Architecture

```mermaid
graph TD
    A[Founder / Kaan] -->|Approvals, Directives| B[HQ Dashboard\nscrollfuel.io/hq]
    B -->|2-way voice + chat| C[JANET CGO v3.0\nGroq LLaMA 3.3 70b]
    C -->|Orchestrates| D[Sales Agent\nARIA 5-touch sequences]
    C -->|Orchestrates| E[Marketing Agent\nA/B tests, content, channels]
    C -->|Orchestrates| F[Product Growth Agent\nFeatures, architect tasks]
    C -->|Orchestrates| G[Research Agent\nCompetitors, ICP, leads]
    C -->|Orchestrates| H[Finance Analyst\nMRR, forecasts, pricing]
    C -->|Orchestrates| I[Customer Success Agent\nRetention, upsell, churn]
    C -->|Orchestrates| J[Executive Assistant Agent\nBriefs, decisions, quick wins]
    C -->|Queues tasks| K[Software Architect Agent\nQwen 2.5-coder:14b local]
    D -->|Sends via| L[Resend Email API]
    D -->|Tracks in| M[(Neon PostgreSQL)]
    C -->|Reads/writes| M
    C -->|Memory| N[janet_memory table]
    C -->|Alerts| O[Telegram Bot]
    L -->|Replies inbound| P[Reply Parser\nGroq intent classification]
    P -->|interested| Q[Magic Checkout\nHMAC-signed link]
    Q -->|Payment| R[Stripe Checkout]
    R -->|Webhook| S[Customer record\npipeline_stage=customer]
    S -->|Portal link| T[Client Portal\n/portal/leadId]
    C -->|Weekly report| U[kaanari@mac.com]
    V[Cron Schedule\nVercel] -->|07:00 UTC| D
    V -->|08:00 UTC| C
    V -->|09:00 Mon| C
    V -->|Every 2h| W[OS Heartbeat]
    V -->|Every 3h| X[OS Watchdog\nSelf-healing]
```

---

## 3. Janet CGO — Full System Prompt

```
You are Janet, a world-class Chief Growth Officer with 15+ years of proven 
experience scaling early-stage SaaS and DTC companies from zero to 
multi-million dollar exits.

Your background:
- You have served as CGO or Head of Growth at multiple high-growth SaaS startups
- You have successfully taken companies from $0 to $5M–$20M+ ARR
- You have been part of teams that sold or raised significant funding
- You are known for relentless execution, data-driven decision making, creative 
  experimentation, and building scalable growth engines

You are now the autonomous CGO of [COMPANY]. You treat this company as your own. 
Your north star is daily/weekly revenue growth, customer acquisition, retention, 
and long-term company value.

Your CGO Team (agents you orchestrate):
- Sales Agent: outbound sequences, pipeline movement, reply handling
- Marketing Agent: content, campaigns, A/B tests, channel strategy
- Product Growth Agent: feature suggestions, onboarding improvements
- Research Agent: competitor intel, lead discovery, market trends
- Finance Analyst Agent: revenue tracking, forecasting, pricing experiments
- Customer Success Agent: onboarding, retention, upsell detection
- Executive Assistant Agent: daily briefs, founder decision queue

Control Levels:
- L1 Think only: research, analyze, recommend
- L2 Draft only: emails, lists, reports, scripts
- L3 Execute with approval: campaigns >20/day, pricing changes, public content
- L4 Limited autonomy: tag leads, create tasks, update pipeline, daily outreach <20/day

Core Operating Style:
- Extremely proactive. Every day: review all metrics, identify highest-leverage 
  action, take or delegate it.
- Run structured reflection after every cycle: what worked, what didn't, why, 
  how to improve.
- Directly task the Software Architect when code changes are needed.
- Use memory to get smarter about this specific business over time.
- Self-learning: after every campaign or product change, deeply reflect and 
  update playbooks.
- Communication: clear, confident, data-backed, action-oriented. Always include 
  recommended actions and expected impact.
- Be decisive. Be specific. Reference memory context. Think like a top 5% operator.
```

---

## 4. Sub-Agent Team

### 4.1 Sales Agent (ARIA)
**File:** `lib/sf/agents/sales.ts`
**Function:** Pipeline metrics, reply rate analysis, sequence health, top prospect identification
**Autonomy:** L4 — runs sequences, tags prospects, updates pipeline stages
**Key outputs:** SalesReport with touched/replied/engaged/customers/replyRate/topProspects/recommendation

### 4.2 Marketing Agent
**File:** `lib/sf/agents/marketing.ts`
**Function:** A/B experiment proposals, content calendar, channel priority, copy recommendations
**Autonomy:** L2 — drafts experiments, L3 — executes with approval
**Active experiment:** touch1_subject — control vs test subject lines, 50/50 deterministic split by lead ID

### 4.3 Product Growth Agent
**File:** `lib/sf/agents/productGrowth.ts`
**Function:** Feature backlog, onboarding gaps, architect task generation
**Autonomy:** L2 — proposes features, L3 — queues architect tasks after approval
**Priority features logged:** sample gallery, self-serve form, client portal, Stripe billing

### 4.4 Research Agent
**File:** `lib/sf/agents/research.ts`
**Function:** Competitor intel, ICP refinement, lead discovery opportunities
**Autonomy:** L1 — analyze only, surfaces recommendations
**Competitors tracked:** Billo, Trend.io, Minisocial, Soona (ScrollFuel)

### 4.5 Finance Analyst Agent
**File:** `lib/sf/agents/finance.ts`
**Function:** MRR/ARR tracking, revenue milestone projection, pricing recommendations
**Autonomy:** L1 — analysis only
**Milestones:** $1K → $5K → $10K → $50K MRR

### 4.6 Customer Success Agent
**File:** `lib/sf/agents/customerSuccess.ts`
**Function:** Retention scoring, upsell detection, churn risk flagging, check-ins due
**Autonomy:** L4 — auto-flags at-risk accounts, L3 — sends check-in emails with approval

### 4.7 Executive Assistant Agent
**File:** `lib/sf/agents/executiveAssistant.ts`
**Function:** Daily founder brief, decision queue, quick wins, blockers, system health summary
**Autonomy:** L4 — compiles brief autonomously, surfaces 3 decisions/day max

### 4.8 Software Architect Agent
**Integration:** Qwen 2.5-coder:14b via local Ollama (localhost:11434)
**Prompts written to:** `/Users/kaan/HQ/qwen_*.txt`
**Outputs to:** `/Users/kaan/grok_files/`
**Task queue:** `architect_tasks` DB table — Janet queues → Kaan approves → Qwen builds → Kaan deploys

---

## 5. Memory Architecture

### 5.1 Schema
```sql
CREATE TABLE janet_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL DEFAULT 'scrollfuel',
  type TEXT NOT NULL,           -- see types below
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence FLOAT NOT NULL DEFAULT 1.0,
  source TEXT NOT NULL DEFAULT 'janet',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, type, key)
);
```

### 5.2 Memory Types
| Type | Purpose | Examples |
|---|---|---|
| `company` | Products, pricing, ICP, differentiators, domain | pricing tiers, founder identity |
| `customer` | Accounts, history, pain points, pipeline stage | customer profiles, objections |
| `campaign` | Sent sequences, results, best subject lines | A/B test results, open rates |
| `strategic` | Decisions made, outcomes, lessons learned | what worked, competitor responses |
| `operating` | Tone, autonomy level, industries, style | Kyle Ari persona, directness level |

### 5.3 Key Functions
- `rememberFact(entry)` — upsert a memory entry
- `recallMemory(companyId, type?, limit?)` — retrieve entries
- `recallContext(companyId)` — full formatted context string for Groq prompts
- `learnFromOutcome(companyId, action, outcome, lesson)` — post-cycle reflection
- `seedScrollFuelMemory()` — idempotent baseline seed (11 entries)

---

## 6. Control / Permission Levels

| Level | Name | Description | Examples |
|---|---|---|---|
| L1 | Think only | Research, analyze, recommend — no action | Competitor analysis, ICP refinement |
| L2 | Draft only | Creates content but doesn't send/publish | Email drafts, content calendars |
| L3 | Execute with approval | Runs after Kaan approves in HQ | Sends >20/day, pricing changes, public posts |
| L4 | Limited autonomy | Executes autonomously within set thresholds | Tag leads, update pipeline, send <20/day, alerts |

**Hard limits requiring L3:**
- Daily email volume > 20
- Bounce rate approaching 8% pause threshold
- Any pricing change
- Public content publication
- Apollo credit usage

---

## 7. Self-Serve Customer Journey

```
Cold email (ARIA, A/B tested subject)
    ↓ [automatic]
Reply parser (Groq LLaMA classifies intent)
    ↓ intent = 'interested'
Magic checkout email (HMAC-SHA256 signed link, no login)
    ↓ [founder clicks, goes to Stripe]
Stripe Checkout (subscription, customer_email pre-filled)
    ↓ checkout.session.completed webhook
lead.pipeline_stage = 'customer' + Telegram alert
    ↓ [automatic]
Client portal (/portal/leadId) — delivery, feedback
    ↓
Janet CS Agent monitors for upsell/churn
```

**Zero founder involvement between reply and payment.**

---

## 8. A/B Test Engine

**File:** `lib/sf/abTest.ts`

```typescript
// Deterministic 50/50 split — same lead always gets same variant
export function getVariant(leadId: string, experimentKey: string): 'control' | 'test' {
  const hash = leadId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return hash % 2 === 0 ? 'control' : 'test'
}
```

**Active experiment:** `touch1_subject`
- Control: "UGC ads for {co} — 3 free samples"
- Test: "quick question about {co}"
- Winner declared at 5+ replies per variant
- Impressions tracked in `ab_impressions` table

---

## 9. Self-Monitoring & Self-Healing

### 9.1 OS Heartbeat (every 2h)
**File:** `lib/os/heartbeat.ts`
- DB connection check (lead count)
- Sequence engine check (stalled leads >5 days)
- Returns health JSON with issues array

### 9.2 OS Watchdog (every 3h)
**File:** `lib/os/watchdog.ts`
- Bounce rate check: `bounced/sent` WHERE `source='apollo' AND touch1_sent_at IS NOT NULL`
- Pause alert if bounce rate >8%
- Stall alert if >20 leads unsent >2 days
- Auto-suppresses bounced leads before next send cycle

### 9.3 Evolution Cycle
Runs weekly (Monday 09:00 UTC) via `runJanetV2()`:
1. All 8 agents run in parallel
2. Groq synthesizes executive report
3. Architect tasks auto-queued for high-priority gaps
4. Memory updated with outcomes and lessons
5. Founder brief emailed + Telegram summary

---

## 10. Organic Evolution Loop

```
Weekly trigger (09:00 UTC Monday)
    ↓
All 8 agents run in parallel (Promise.all)
    ↓
Janet synthesizes → Groq executive analysis
    ↓
ARCHITECT_TASK: extracted → queued in DB → Telegram alert
    ↓
Kaan approves in HQ dashboard (Approvals tab)
    ↓
Qwen builds → Kaan deploys → Janet learns outcome
    ↓
learnFromOutcome() → janet_memory updated
    ↓
Next cycle starts smarter
```

---

## 11. Cron Schedule

| Time (UTC) | Job | Description |
|---|---|---|
| 06:00 daily | Lead discovery | Scan for new qualified leads |
| 07:00 daily | ARIA sequence | 5-touch with A/B, daily cap 20, bounce guard |
| 08:00 daily | Janet CGO brief | All 8 agents, memory seed, daily brief |
| 09:00 Mon | Janet V2 weekly | Full evolution cycle, report → kaanari@mac.com |
| 10:00 daily | Sequence engine | T2–T5 follow-ups |
| 11:00 daily | Voice brief | Daily Telegram summary |
| Every 2h | OS Heartbeat | DB + sequence health check |
| Every 3h | OS Watchdog | Bounce alert + self-healing |

---

## 12. HQ Dashboard

**URL:** `[domain]/hq?` (no auth — URL is the key, use secret param internally)
**File:** `app/hq/page.tsx`

### Tabs:
| Tab | Contents |
|---|---|
| Overview | Live MRR, pipeline funnel, A/B test results, self-serve journey status |
| Janet CGO | 2-way voice + text chat, full context, quick prompts, directive memory storage |
| Pipeline | Full lead table — name/company/stage/touch status/replied/bounced |
| Approvals | Architect task queue (approve→Qwen/reject/done), system controls |
| Memory | All 5 memory types, all entries, readable |
| Health | Bounce rate, endpoint status, system metrics |

### Voice Architecture:
- **STT:** Groq Whisper (`whisper-large-v3-turbo`) via `/api/hq/stt`
- **LLM:** Groq LLaMA 3.3 70b via `/api/hq/chat` (server-side, context-aware)
- **TTS:** ElevenLabs Rachel voice (`21m00Tcm4TlvDq8ikWAM`), `eleven_turbo_v2_5` via `/api/hq/tts`
- **Flow:** Hold mic button → WebM audio → STT → text → LLM → text → TTS → audio plays

---

## 13. Key Files & Integration Points

### Core System Files
```
lib/sf/
├── memory.ts               — 5-type memory layer, company-isolated
├── sequences.ts            — 5-touch ARIA engine with A/B routing
├── abTest.ts               — deterministic A/B split + impression tracking
├── replyParser.ts          — Groq intent classification + auto-respond
├── magicLink.ts            — HMAC-SHA256 signed checkout links
├── janet-v2.ts             — Janet CGO orchestrator (all 8 agents)
├── janet-cgo.ts            — Daily brief runner
└── agents/
    ├── sales.ts            — Pipeline metrics + recommendations
    ├── marketing.ts        — A/B proposals, content calendar
    ├── productGrowth.ts    — Feature backlog, architect tasks
    ├── research.ts         — Competitor intel, ICP refinement
    ├── finance.ts          — MRR tracking, forecasting
    ├── customerSuccess.ts  — Retention, upsell detection
    └── executiveAssistant.ts — Daily brief, decision queue

lib/os/
├── heartbeat.ts            — System health checks
└── watchdog.ts             — Bounce rate + stall detection, self-healing

app/hq/
└── page.tsx                — HQ dashboard (overview/janet/pipeline/approvals/memory/health)

app/api/
├── hq/route.ts             — Live data aggregator
├── hq/chat/route.ts        — Server-side Janet chat (Groq)
├── hq/tts/route.ts         — ElevenLabs TTS
├── hq/stt/route.ts         — Groq Whisper STT
├── hq/directive/route.ts   — Store directive in memory + Telegram
├── hq/task/route.ts        — Architect task approve/reject/done
├── cron/aria-daily/        — Trigger ARIA sequence
├── cron/janet-cgo/         — Daily brief
├── cron/janet-weekly/      — Full evolution cycle
├── cron/os-heartbeat/      — Health check
├── cron/os-watchdog/       — Self-healing watchdog
├── webhooks/reply/         — Inbound email reply handler
├── webhooks/resend/        — Bounce/open/click handler
├── stripe/magic-checkout/  — Self-serve checkout (HMAC-signed)
├── stripe/webhook/         — Payment → customer conversion
├── janet/report/           — On-demand Janet report
├── janet/memory/           — Memory read/write
├── architect/              — Architect task queue
├── leads/sample-request/   — Self-serve sample form handler
└── portal/
    ├── validate/           — Token validation
    └── feedback/           — Client feedback → Telegram

app/
├── hq/page.tsx             — Management console
├── portal/[token]/page.tsx — Client delivery portal
├── samples/page.tsx        — Sample ad gallery
├── get-samples/page.tsx    — Self-serve sample request form
├── billing/page.tsx        — Stripe subscription tiers
├── (auth)/login/           — Auth
└── (dashboard)/billing/    — Authenticated billing
```

### Key Environment Variables
```
DATABASE_URL                    — Neon PostgreSQL (direct, NOT pooler)
GROQ_API_KEY                    — LLaMA 3.3 70b for Janet + Whisper STT
ELEVENLABS_API_KEY              — TTS voice output
RESEND_API_KEY                  — Email delivery
STRIPE_SECRET_KEY               — Payment processing
STRIPE_WEBHOOK_SECRET           — Webhook signature verification
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
SF_STARTER_MONTHLY/ANNUAL       — Stripe price IDs
SF_GROWTH_MONTHLY/ANNUAL
SF_AGENCY_MONTHLY/ANNUAL
CRON_SECRET                     — Cron job authentication
NEXT_PUBLIC_APP_URL             — Base URL
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
MARKETING_START_DATE            — Week number calculation base
```

### Database Tables
```
outreach_leads          — All leads, pipeline stages, touch timestamps
janet_memory            — 5-type memory layer (company-isolated)
architect_tasks         — Task queue for Qwen
ab_impressions          — A/B test impression + conversion tracking
```

---

## 14. Current Prompt Library

### ARIA Touch 1 (Control)
> Subject: "UGC ads for {co} — 3 free samples"
> Body: Found {co} while researching {cat} brands doing paid social... We generate 30+ photorealistic UGC ads in 48 hours...

### ARIA Touch 1 (Test)
> Subject: "quick question about {co}"
> Body: Quick question — how are you currently handling ad creative for {co}?...

### ARIA Touch 2
> Subject: "Re: UGC samples for {co}"
> Body: Following up — similar {cat} brands we work with are seeing 3x engagement on UGC vs studio shoots...

### ARIA Touch 3 (with Calendly)
> Subject: "Last call - 2 sample slots left this week"
> P.S. If easier, grab 10 min here: calendly.com/kyle-scrollfuel

### ARIA Touch 4
> Subject: "One question before I close your file"
> Is UGC content something {co} is actively investing in right now, or is the timing off?

### ARIA Touch 5
> Subject: "Closing your file"
> Closing out my file on {co}. If you ever want to explore UGC ads...

### Reply Intent Classes
`interested | not_now | not_interested | question | unsubscribe | out_of_office | spam_complaint | unknown`

### Magic Checkout Email
> Subject: "Your {co} UGC samples + how to get started"
> Body: I finished building 3 custom UGC ads for {co}... [CTA button → Stripe checkout, no login]

---

## 15. Autonomy Assessment

| Component | Status | Level |
|---|---|---|
| Email sending (ARIA, daily) | Autonomous | L4 |
| Bounce handling + suppression | Autonomous | L4 |
| Reply classification (Groq) | Autonomous | L4 |
| Interested reply → checkout email | Autonomous | L4 |
| Payment → customer + Telegram | Autonomous | L4 |
| Janet daily brief + weekly report | Autonomous | L3 |
| Memory update + self-learning | Autonomous | L4 |
| Self-healing watchdog | Autonomous | L4 |
| A/B test routing + tracking | Autonomous | L4 |
| Apollo lead sourcing | Requires approval | L3 |
| Sends >20/day | Requires approval | L3 |
| Strategic pricing changes | Founder decides | L1 |
| Weekly report review + decisions | Founder — 20 min | L1 |

**Overall: 95% autonomous. Founder interaction: ~15 min/day.**

---

## 16. Versioning Protocol

From V3.0 onwards:
- All revisions increment to V3.1, V3.2, etc.
- Every version update is implemented across ALL active Kaan AI OS deployments simultaneously
- Changes are tracked in this document and in `janet_memory` under `type='strategic', key='os_version'`
- Version is stored in each deployment's DB: `INSERT INTO janet_memory (company_id, type, key, value) VALUES ('[company]', 'strategic', 'os_version', 'v3.0')`

**Active deployments:**
1. ScrollFuel (scrollfuel.io) — v3.0 ✅
2. PhishSimAi (phishsimai.com) — v3.0 [replicating]


| **3.2** | **Jun 28 2026** | **Marcus Architect Agent, Bug Telemetry, QA Smoke, Live Issues HQ tab** |