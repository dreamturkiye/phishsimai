# Alternative channels for lead generation and outreach — investigation (PS-CHANNELS-INVEST-01)

**Status: INVESTIGATION.** No sends, schedules, schema, or copy changed in this pass, per the same
standing doctrine as [`docs/COLD_EMAIL_OUTREACH_STRATEGY_INVESTIGATION.md`](./COLD_EMAIL_OUTREACH_STRATEGY_INVESTIGATION.md):
this funnel's scale-up and channel decisions are founder-gated. This is a survey of what channels
exist today (live, dormant, or content-only), what alternative channels are already partially built,
and what a next channel would need before it could carry real send volume.

## Scope

"Lead generation and outreach" today is not one channel, it is three code paths of very different
liveness, plus one adjacent content channel:

1. **The sanctioned cold-email funnel** — live, audited in detail in
   `docs/COLD_EMAIL_OUTREACH_STRATEGY_INVESTIGATION.md`. Google Maps (Outscraper) discovery →
   AnyMailFinder/Icypeas enrichment (`server/os/agents/leadResearcher.ts`) → `ps_outreach_leads` →
   `server/os/sequences.ts` (touch 1–4, plain text, full gate stack). This is the only channel that
   currently sends anything to a real prospect.
2. **A second, dormant lead-gen + outreach module** — `server/outreach/*` — new finding, below.
3. **Sarah LinkedIn content posting** — live but distinct: brand-building posts via PostForMe, not
   individual outbound lead outreach. Tracked separately in `KAAN_AI_OS_V4.5.md` and
   `janetOpsSnapshot.ts`.

## Finding 1 — `server/outreach/*` is a second, fully-built alternative-channel stack that never runs

There is an entire second lead-gen/outreach system in the repo, separate from the sanctioned funnel,
consisting of:

- `server/outreach/leadDiscovery.ts` — Apollo.io-based prospect search (six targets across
  US/GB/CA/AU, MSP + vertical keyword search), writing into a table called `outreach_leads`.
- `server/outreach/outreachSequence.ts` — a 4-touch email sequence reading from `outreach_leads`.
- `server/outreach/linkedinQueue.ts` — **an alternative channel to email**: for leads that already
  received touch 1, it drafts a personalized LinkedIn connection message and pushes it to the
  founder's Telegram for manual send (never auto-DMs LinkedIn directly — no ToS exposure).

All three are registered as live routes (`server/_core/index.ts:120-122`,
`/api/scheduled/outreach-{discover,sequence,linkedin}`), but **none of the three appears anywhere in
`vercel.json`'s cron list**, and nothing else in the codebase calls them. They are reachable only by
someone manually POSTing the route with cron/HQ auth — which nothing does today. This is the same
shape of problem `docs/OPEN-COMMITMENTS.md` already tracks for `mobileOptimizedTemplates.ts`
("Shipped to production as dead code. Wire it or delete it"): fully-built, non-trivial functionality
that has never executed in production.

Three additional problems compound the dormancy, meaning this cannot simply be "turned on" by adding
a cron entry:

- **Wrong table, wrong dialect.** The sanctioned funnel's table is `ps_outreach_leads` (Postgres,
  reconciled in `0007_reconcile_ps_outreach_leads.sql`). This module reads/writes a *different*
  table, `outreach_leads`, whose only `CREATE TABLE` is the inline handler at
  `server/_core/index.ts:125-160` — and that DDL is written in **MySQL syntax**
  (`INT AUTO_INCREMENT PRIMARY KEY`), which is not valid on the project's actual Postgres/Neon
  database. If that table exists at all in `ep-spring-leaf`, it was not created by the code in this
  repo, so the schema on disk is unverifiable from here.
- **The email half is deliberately dead.** `outreachSequence.ts`'s `sendEmail()` unconditionally
  throws (`PS-BYPASS-CLOSE-01`) because it is a raw Resend call with none of the sanctioned funnel's
  sanitizer/MX/suppression/CAN-SPAM/ramp-cap gates. The comment is explicit: route sends through
  `server/os/sequences.ts` instead of re-enabling this. So of the two channels this module offers,
  one is intentionally permanently disabled and the other (LinkedIn) has never been scheduled.
- **The LinkedIn queue is otherwise sound and low-risk.** Unlike the email half, `linkedinQueue.ts`
  never sends anything itself — it queues a draft to Telegram for a human to act on, which sidesteps
  both LinkedIn automation ToS risk and the funnel's existing compliance gate stack. It is the one
  piece of this module that could plausibly be wired up as-is, *if* it read from `ps_outreach_leads`
  instead of the legacy/unverifiable `outreach_leads` table.

## Finding 2 — the only channel with new-account volume is the same one already flagged as stuck

Per the existing audit, the sanctioned email funnel has near-zero reply rate (884 sends → 1 hostile
reply as of 2026-08-03) and its own diagnosis names deliverability/list quality/offer, not more
outreach machinery, as the binding constraint. Standing up a *second* channel before that diagnosis
is resolved risks repeating the same untargeted-volume pattern on a new surface (LinkedIn connection
requests instead of cold email) rather than fixing what's actually broken. This matters for
sequencing: reviving Finding 1's LinkedIn path is lower engineering cost than it looks, but doing so
before Finding 1's parent funnel's reply-rate problem is diagnosed just adds a second channel with
the same untested offer/targeting.

## Finding 3 — content/brand channel exists and is measured as idle, not failing

`server/os/janetOpsSnapshot.ts` already tracks Sarah's LinkedIn *content* channel (PostForMe) as a
first-class posture line (`sarahLinkedIn.status`), with an explicit `not_wired` state when
`POSTFORME_API_KEY` is missing or the post queue is empty. This is a channel that builds inbound
awareness/credibility (not direct outreach) and is already instrumented to say honestly when it is
idle — it just currently reports idle rather than posting. Unlike Finding 1, there is no
schema/dead-sender problem here: the blocker is purely "queue empty" or "key missing," both
operator-actionable without a founder decision on copy or targeting.

## Channels not yet attempted (for founder consideration, not proposed as work)

Listed for completeness, not as a recommendation to build — each would need its own compliance and
volume analysis before any code:

- **Partner/MSP referral** — the landing page already has a dedicated MSP/partner CTA
  (`todo.md` Phase 16), but there is no code path that converts a partner-page visit into a lead
  record the way Apollo/Outscraper discovery does. This is the only "channel" here that is inbound
  rather than outbound, which sidesteps the cold-outreach compliance/reputation problem entirely.
- **Paid ads, direct mail, phone/cold-calling, webinars** — no code, no infrastructure, no existing
  founder decision on record in `todo.md` or `docs/OPEN-COMMITMENTS.md`. Out of scope for an
  engineering recommendation until a founder names one as worth building.

## Recommendations

Ranked by leverage, not ease. All are founder decisions per standing doctrine — nothing here is
proposed as work to do unprompted.

1. **(Founder decision) Decide Finding 1's fate: wire it up, or delete it as dead code.** If kept:
   point `linkedinQueue.ts` at `ps_outreach_leads`, add its cron to `vercel.json`, and delete
   `leadDiscovery.ts` (Apollo) + `outreachSequence.ts`'s dead sender as redundant with the sanctioned
   Outscraper/AnyMailFinder + `sequences.ts` paths. If not: remove all of `server/outreach/*` and its
   three now-unreachable routes, the same call `OPEN-COMMITMENTS.md` already made for
   `mobileOptimizedTemplates.ts`.
2. **(Founder decision) Sequence Finding 1 behind Finding 2.** Don't stand up LinkedIn outreach volume
   until the existing email funnel's reply-rate diagnosis (offer/list quality) is resolved — a second
   channel doesn't fix an offer problem, it duplicates it on new surface area.
3. **(Operator, no decision needed) Un-idle the content channel (Finding 3)** — confirm
   `POSTFORME_API_KEY` is set in Vercel and that Sarah's post queue has content, since the blocker is
   already isolated to those two operator-actionable causes.
4. **(Founder decision) Name one inbound channel to invest in, if any.** Partner/MSP referral is the
   only channel above with existing UI surface and no compliance/reputation exposure; it is the
   cheapest next channel to reason about precisely because it is inbound, not outbound.
