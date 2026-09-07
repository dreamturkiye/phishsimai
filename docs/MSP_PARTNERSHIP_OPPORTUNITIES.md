# MSP partnership and collaboration opportunities (PS-MSP-CHANNEL-01)

**Status: RESEARCH.** Findings and candidate next steps only. Nothing here commits spend,
signs an agreement, or ships code — any marketplace application fee, association membership
due, or carrier BD conversation is a founder decision, same standing doctrine as
[`docs/COLD_EMAIL_OUTREACH_STRATEGY_INVESTIGATION.md`](./COLD_EMAIL_OUTREACH_STRATEGY_INVESTIGATION.md).
External facts below (program names, requirements) are from web search performed during this
pass, sourced inline; nothing is invented. Anything that reads as a specific number, fee, or
term should be re-verified against the vendor's current site before acting — these programs
change their terms often.

## Why look for a second channel

Per `docs/COLD_EMAIL_REPLY_RATE_INVESTIGATION.md` and
`docs/COLD_EMAIL_OUTREACH_STRATEGY_INVESTIGATION.md`, the existing MSP acquisition channel is
cold email (`server/os/agents/leadResearcher.ts`, `server/os/sequences.ts`), and its own history
records the reply rate as still near zero. That funnel is a **cold, unendorsed** channel: it
reaches an MSP owner's inbox with no prior trust signal. Every category below is instead a
**warm or structurally-required** channel — the MSP either already trusts the intermediary
(a PSA vendor, a peer group, an insurer) or is contractually required to show the artifact we
produce (a phishing-sim completion log). That is the actual thesis of this research: not
"more outreach volume," but "outreach through a channel the MSP already trusts."

## What we already have to build on

- **PSA ticket integrations already exist and already speak the protocols marketplaces
  require.** `server/psa/connectwise.ts` and `server/psa/halo.ts` implement working adapters
  against ConnectWise Manage and HaloPSA (`server/psa/index.ts` is the single provider-string
  dispatch point). A marketplace listing needs a certified integration, not a new one built from
  scratch — this is the head start.
- **A resale artifact already ships**: branded completion certificates
  (`PS-WHITELABEL-CERT-01`, per `docs/DEFERRED_PROJECTS.md`) are "the resale artifact an MSP
  hands their client" — exactly the kind of proof-of-work a marketplace listing or an insurance
  carrier integration would surface.
- **`gamechangers/gc4-msp-marketplace/README.md`** is a one-line stub ("Game Changer 4 — MSP
  Compliance Marketplace") — a marketplace/compliance angle was already identified as worth
  pursuing, but nothing beyond the title exists yet. This research is a concrete starting point
  for that stub, not a duplicate of it.

## Candidate partnership categories

### 1. PSA/RMM marketplaces — highest leverage given existing integrations
- **ConnectWise Marketplace / Invent program**: a certified-integration catalog of 400+
  vendors; certification requires an independent security review of the integration before it
  can list as "Invent-certified" ([ConnectWise Marketplace](https://marketplace.connectwise.com/),
  [Cybersecurity Partners category](https://marketplace.connectwise.com/integration-partners/cybersecurity)).
  Since `server/psa/connectwise.ts` already implements the ticketing side, the incremental work
  to qualify is the security review and marketplace listing process, not a new integration.
- **HaloPSA marketplace**: same logic applies to `server/psa/halo.ts` — worth checking HaloPSA's
  current partner/marketplace listing process directly on their site before assuming parity with
  ConnectWise's process.
- Next step (no spend): read ConnectWise Invent's actual application requirements and fee
  structure, and HaloPSA's equivalent, and bring both back as a founder decision with real
  numbers rather than assumed ones.

### 2. Cloud/security distributors (bundled billing + discoverability)
- **Pax8**, **Sherweb**, **Ingram Micro Cloud** are the major MSP-facing cloud distributors —
  MSPs buy and bill much of their stack through these marketplaces rather than direct from each
  vendor. Ingram Micro's catalog is reported at 1,500+ vendors; Pax8 and Sherweb are described as
  cloud-first and actively adding security/compliance vendors
  ([Pax8 Q4 2025 vendor additions](https://www.pax8.com/blog/pax8-vendors-q4-2025/),
  [Sherweb marketplace](https://scopable.io/blog/pax8-vs-sherweb-msps-csp-billing)).
- These are distribution/billing partnerships, not just integrations — getting listed typically
  means a revenue-share or wholesale-pricing negotiation. That negotiation is explicitly out of
  scope for this research (falls under the pricing-gate this task must not touch); flagging the
  category is as far as this pass goes.

### 3. MSP associations and peer groups (direct access to MSP owners, warmer than cold email)
- **CompTIA ISAO** — an information-sharing organization now bundled free into CompTIA's MSP
  membership; security vendor engagement (e.g. its MSP Champions Council) is a plausible
  sponsorship/visibility angle
  ([CompTIA ISAO](https://www.comptia.org/newsroom/press-releases/comptia-isao-announces-members-of-its-msp-champions-council)).
- **The ASCII Group** — a long-running North American MSP/MSSP membership community that
  explicitly runs vendor-channel-growth programs for "up-and-coming technology vendors," and
  stood up an MSP Security Committee
  ([ASCII Group vendor channel growth](https://blog.smallbizthoughts.com/2023/07/the-ascii-group-fuels-channel-growth.html)).
- **MSPAlliance** — describes itself as the largest vendor-neutral MSP/cloud-provider
  organization; its events are named as a place vendors meet MSP owners directly.
- **Robin Robins / Technology Marketing Toolkit (TMT)** — runs vendor sponsorship programs
  (e.g. the "Producers Club") built specifically for security/compliance vendors selling into
  the MSP channel, plus the SMB TechFest event.
- These are membership/sponsorship relationships (dues or event fees), not code integrations —
  the concrete next step is getting real membership/sponsorship pricing from each before any
  founder decision, not signing up autonomously.

### 4. Cyber insurance carriers — structurally-required channel, but has entrenched incumbents
- Several major MSP-relevant carriers now make security-awareness training and phishing
  simulation evidence a **binding/renewal requirement**, not an upsell: **Coalition** bundles
  its own mandatory training platform into coverage; **At-Bay** bundles training and phishing
  simulation into the policy more flexibly than Coalition
  ([carrier comparison](https://seedpodcyber.com/cyber-insurance-carrier-comparison/),
  [Huntress: cyber insurance requirements](https://www.huntress.com/cybersecurity-insurance-guide/insurance-requirements)).
  This is the strongest structural fit for a phishing-sim product — the MSP's client needs the
  artifact we already produce in order to get insured at all.
- **This category already has direct competitors running exactly this play**: HacWare markets
  an MSP partner program directly, and Adaptive Security / RansomLeak both position
  specifically around the insurance-requirement angle
  ([HacWare MSP partner program](https://hacware.com/msp),
  [Adaptive Security on insurance](https://www.adaptivesecurity.com/blog/cybersecurity-awareness-training-cyber-insurance)).
  Their existence is useful signal that the channel works, and their public partner-program
  pages are worth studying as a structural model — but it means we would be entering as a
  follower, not a first mover, and Coalition in particular locks MSPs into its own bundled
  platform rather than an open integration slot.
- Next step (no spend): before any outreach to a carrier, read what "integration" actually means
  to Coalition vs. At-Bay (API partnership? preferred-vendor list? nothing formal?) — the search
  above surfaced requirements, not confirmed partner-program mechanics.

## Recommendation

Prioritize category 1 (PSA marketplaces) first — it converts existing code
(`server/psa/connectwise.ts`, `server/psa/halo.ts`) into a listing with no new engineering, and
ConnectWise's own materials describe the process (security review + certification) rather than
requiring a cold BD relationship. Categories 3 and 4 are plausibly higher-value long-term but
both require a founder-level commitment (dues/sponsorship spend, or a BD conversation with a
carrier that has entrenched competitors) that this task should surface, not decide. Category 2
(distributors) is real but is fundamentally a pricing/revenue-share negotiation and should wait
until the product has listings/proof points from category 1 to point to.

## Explicitly not done in this pass
No application was submitted, no membership was purchased, no carrier or distributor was
contacted, and `gamechangers/gc4-msp-marketplace/README.md` was left untouched — this document
is the research a founder would need to turn that stub into a real scoped project.
