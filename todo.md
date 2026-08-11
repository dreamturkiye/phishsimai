## ⚠️ AMF KEY IS SHARED — ROTATION IS A 4-PLACE OPERATION (PS-SHARED-AMF-01)

ONE AMF KEY, TWO PRODUCTS, PERMANENTLY. AnyMailFinder issues one key per account. Rotating it for
either product silently 401s the other's enrichment, and NEITHER reports it — proven 2026-07-18:
rotating for PhishSim took ScrollFuel's enrichment dark for ~2 hours and it was found only by
testing, not by any alarm. The credit pool is also shared + finite: if it empties, BOTH go dark
with a 402 (not a 401) — different error, same silence.

RULE: rotating the AMF key is a TWO-PRODUCT operation. Update, in one pass:
  PhishSim .env.local · PhishSim Vercel · ScrollFuel .env.local · ScrollFuel Vercel
Four places. Miss one and a product goes dark silently.


# ✅ OUTBOUND OPEN — 2026-07-18, founder-approved. Reopening gate ALL GREEN.

First scheduled send: **07:00 UTC 2026-07-18** — up to 20 US MSPs, all MX-verified, at l4.

- [x] **AMF key valid** — `4GW…` VALID (auth 200 + live enrichments). In all four places: PhishSim
      `.env.local` + Vercel, ScrollFuel `.env.local` + Vercel (founder set it). See the 4-place rule above.
- [x] **google_maps leads enriched** — 22 eligible US MSPs (was 0 all week); pool drains ~9/clean run.
- [x] **MX gate passes them** — enforced at send time; a no-MX lead (nexacoreitsolutions.com) is
      marked dead + skipped, never emailed. Rail proven on the real list.
- [x] **New copy live** — PS-COPY-REWRITE-01 (MSP/reseller, insurance wedge, nothing invented) +
      PS-SALUTATION-01 (derived first name) + PS-LOGO-CROP-01 (tight dark-on-white logo).
- [x] **Bounce rate rescoped & honest** — PS-BOUNCE-WINDOW-01: rolling 7-day live window, measured
      flag, only a measured trip is an incident. Both readers (getSequenceHealth, watchdog) rescoped.
- [x] **Autonomy raised to l4 (send_simulation)** — 2026-07-18, and actually enforced in the send path.
- [x] **Founder approved the recipient list** — 2026-07-18.

Live rails on every send: OUTBOUND_HARD_PAUSED · bounce breaker (7d window) · autonomy gate (l4) ·
MX pre-check · geo allowlist [US,GB,AU] · DAILY_SEND_LIMIT 20 (query LIMIT 20 + loop break).

## Open, non-blocking (next sessions)

- **PS-BOUNCE-SOURCE-01** — four bounce calculations, one truth. getSequenceHealth + watchdog are
  rescoped; `routes.ts:456` (HQ dashboard) and `cgoAutonomy.ts:97` (dead code) still compute the
  lifetime rate. Route ALL bounce readers through getSequenceHealth so there is exactly one number.
- **PS-DISCOVERY-EMPTY-01** — Outscraper returns 0 places for "managed service provider, Denver,
  Colorado" after 181s; Miami worked (14 leads), so the query format is fine and Denver is
  empty/blocked. Pool drains in ~5 runs. RESOLUTION (not a fix): moot once the founder's 12,000
  US-MSP import lands — that becomes the queue's refill, not Outscraper city-cycling.

---

# PhishSim AI SaaS — Project TODO

## Phase 1: Database Schema & Backend
- [x] Design and apply full DB schema (organizations, targets, departments, campaigns, campaign_results, templates, training_modules, training_completions, gamification_scores, invites)
- [x] Backend routers: organizations (multi-tenant CRUD, settings)
- [x] Backend routers: departments (default + custom)
- [x] Backend routers: targets (employee management per org/department)
- [x] Backend routers: campaigns (create, list, update, delete, schedule)
- [x] Backend routers: campaign results (track opens, clicks, credential submissions)
- [x] Backend routers: templates (library, AI generation, community sharing)
- [x] Backend routers: training modules (list, start, complete)
- [x] Backend routers: gamification (scores, leaderboard, org posture)
- [x] Backend routers: invites (invite users to org)
- [x] Backend routers: scheduled campaigns (heartbeat cron integration)

## Phase 2: Landing Page & Shell
- [x] Dark elegant theme (deep navy/slate, cyan accent, refined typography)
- [x] Landing page: hero, features, pricing, CTA
- [x] Auth flow: sign in / sign up redirect
- [x] Dashboard shell with sidebar navigation (PhishSim AI branding)
- [x] Sidebar menu: Dashboard, Phishing (Campaigns, Templates, Targets, Training, Leaderboard), Analytics, Settings

## Phase 3: Campaign Management
- [x] Campaign list page (status badges, search, filter)
- [x] Create campaign dialog (name, language, sender)
- [x] Campaign detail page (status, results summary, pie chart)
- [x] Campaign status tracking (draft, active, completed, paused)

## Phase 4: AI Template Generator
- [x] Template generator dialog with form (industry, attack type, language EN/ES/TR)
- [x] AI-powered template generation via LLM (subject + HTML body)
- [x] Save generated template to library
- [x] Template preview modal

## Phase 5: Template Library
- [x] Browse all templates (community + own org)
- [x] Filter by tabs (My Library / Community)
- [x] Template card with preview, fork, delete actions
- [x] Share template to community toggle
- [x] Seed library with built-in templates (EN/ES/TR)

## Phase 6: Department & Target Management
- [x] Department list page (default: Finance, Sales, Management, Operations, Warehouse + custom)
- [x] Add/delete custom departments
- [x] Target (employee) list with department assignment
- [x] Add/delete individual targets

## Phase 7: Training Modules
- [x] Training module list (under Phishing > Training submenu)
- [x] 15+ built-in training modules (HIPAA, PCI DSS, GDPR, passwords, social engineering, etc.)
- [x] Module viewer with content + quiz
- [x] Mark module as complete
- [x] Training completion tracking per org

## Phase 8: Analytics Dashboard
- [x] Overview stats (open rate, click rate, credential submission rate)
- [x] Charts: trend over time (line chart), per-department breakdown (bar chart)
- [x] Department risk summary table
- [x] Security posture score card

## Phase 9: Gamification System
- [x] Gamification toggle in org settings (on/off)
- [x] Employee risk score display
- [x] Org-wide security posture score
- [x] Leaderboard page (under Phishing submenu)
- [x] Department risk scores with progress bars

## Phase 10: Org & User Management
- [x] Organization settings page (name, gamification toggle, training toggle)
- [x] Member list with roles
- [x] Invite user flow (email invite link)
- [x] Accept invite page
- [x] Role management (admin/member)

## Phase 11: Automated Scheduling
- [x] Recurring campaign scheduler (heartbeat cron integration)
- [x] /api/scheduled/campaign endpoint + handler

## Phase 12: Polish & Tests
- [x] Vitest tests passing (1 test suite, 1 test)
- [x] TypeScript: 0 errors
- [x] Empty states for all pages
- [x] Loading states
- [x] Responsive sidebar (mobile + desktop)
- [x] Final checkpoint

## Phase 13: Compliance & Certification
- [x] Add Compliance section to landing page (Home.tsx)
- [x] Create ComplianceCenter.tsx dashboard page with all 10 framework cards
- [x] Build compliance procedures detail view per framework
- [x] Build compliance status tracker (requirements checklist per framework)
- [x] Build compliance report generator (HTML → downloadable)
- [x] Build compliance certificate generator with org name, date, framework
- [x] Add compliance DB schema (compliance_records, compliance_certs tables — client-side state, no DB needed)
- [x] Add compliance backend routers (client-side generation — no server round-trip needed)
- [x] Add Compliance nav item to AppLayout sidebar
- [x] Add /compliance route to App.tsx

## Phase 14: Mandatory Mandate Highlighting & Certificate Enhancement
- [x] Add prominent "Mandatory Compliance" hero banner section to landing page with urgency messaging
- [x] Add individual mandatory mandate cards with legal citations on landing page
- [x] Rebuild certificate generator with framework-specific regulatory language per certificate
- [x] Update ComplianceCenter to visually distinguish mandatory vs recommended vs industry-specific
- [x] Add mandatory badge/indicator to each mandatory framework card in dashboard
- [x] Update landing page compliance section header to emphasize legal requirement

## Phase 15: MSP White Label Portal
- [x] DB schema: msp_tenants, msp_customer_orgs, msp_branding, msp_activity_log tables
- [x] Backend: MSP registration and profile router
- [x] Backend: MSP customer provisioning (create/suspend/delete customer orgs)
- [x] Backend: MSP impersonation (act-as-customer session)
- [x] Backend: MSP white-label branding (logo, colors, domain, support email)
- [x] Backend: MSP customer analytics aggregation (all customers overview)
- [x] Backend: MSP activity log (audit trail of all MSP actions)
- [x] MSP Portal page: separate /msp route and layout (distinct from customer dashboard)
- [x] MSP Dashboard: KPI cards (total customers, active campaigns, compliance scores, at-risk orgs)
- [x] MSP Customer List: table with status, plan, last activity, compliance score, quick actions
- [x] MSP Customer Provisioning Wizard: create new customer org (name, domain, plan, admin email)
- [x] MSP Impersonate Customer: "Manage" button to enter customer's dashboard as admin
- [x] MSP White Label Branding Settings: upload logo, set brand colors, custom support email
- [x] MSP Activity Log: audit trail of all provisioning and access actions
- [x] Add MSP section to landing page (targeting IT service providers)
- [x] Add MSP nav entry to AppLayout for MSP-role users
- [x] Vitest tests for MSP routers

## Phase 15: MSP White Label Portal
- [x] DB schema: msp_tenants, msp_customer_orgs, msp_branding, msp_activity_log tables
- [x] Backend: MSP registration, customer provisioning, impersonation, branding, activity log routers
- [x] MSP Portal page (/msp route, separate layout, MSP-role gated)
- [x] MSP Dashboard: KPI cards (total customers, active campaigns, compliance scores, at-risk orgs)
- [x] MSP Customer List: table with status, plan, last activity, compliance score, quick actions
- [x] MSP Customer Provisioning Wizard: create new customer org (name, domain, plan, admin email)
- [x] MSP Impersonate Customer: "Manage" button to enter customer dashboard as admin
- [x] MSP White Label Branding Settings: logo, brand colors, custom support email
- [x] MSP Activity Log: audit trail of all provisioning and access actions
- [x] Vitest tests for MSP routers

## Phase 16: Marketing Polish & Go-Live Readiness
- [x] Landing page: stronger hero with 2X better / half price value prop
- [x] Landing page: competitor comparison table (vs KnowBe4, Proofpoint, Cofense)
- [x] Landing page: social proof / testimonials section
- [x] Landing page: MSP / partner section with dedicated CTA
- [x] Landing page: How It Works (3-step visual flow)
- [x] Landing page: FAQ section
- [x] Landing page: full multi-column footer (Product, Compliance, Company, Legal)
- [x] Landing page: Privacy Policy and Terms of Service pages
- [x] Add MSP pricing tier to pricing section
- [x] Beta test all pages and fix any UI/UX issues

## Phase 17: Professional Template Library
- [x] Seed 100 real US-brand phishing templates into the live database
- [x] Rebuild Templates.tsx into professional-grade library UI
- [x] Left filter panel: attack type, difficulty, industry, language, source tabs
- [x] Search bar with live filtering
- [x] Template cards: brand icon/color, subject, tags, difficulty badge, attack type badge
- [x] Full-screen preview modal with HTML iframe and metadata sidebar
- [x] "Use Template" CTA in preview modal
- [x] Empty state for no results
- [x] Loading skeleton cards

## Phase 18: QA Bug Fixes (Pre-Launch)

- [ ] BUG-01: CampaignDetail — Add template selector and target assignment sections
- [ ] BUG-02: MSP Manage button — Use impersonateCustomer + org context switching
- [ ] BUG-03: AcceptInvite — Read token from route path params not query string
- [ ] BUG-04: OrgSettings invite — Show copyable invite link after creation
- [ ] BUG-05: CampaignDetail results — Show employee name/email not raw targetId
- [ ] BUG-06: Add org switcher in sidebar for multi-org users
- [ ] BUG-07: Campaign launch validation — require template + targets + sender
- [ ] BUG-08: MSP provision — auto-generate slug from org name
- [ ] BUG-10: Gamification — show Demo Data badge when no real data
- [ ] BUG-12: Templates "Use Template" — navigate to campaigns after fork
- [ ] BUG-13: OrgSettings — add Copy Link button for pending invites
- [ ] BUG-18: MSP impersonation banner — show "Managing: [Customer]" persistent banner

## Phase 19: Deliverability — sims must reach the inbox (routed to PhishSim seat)

Root cause of "product looks broken": simulated-phishing content is phishing BY DESIGN, so content
+ new-sender reputation put it in spam even with SPF/DKIM/DMARC all passing (auth is NOT the
problem — verified 2026-07-22: DKIM aligned, SPF healthy 2/10 lookups, DMARC passing). The industry
fix is customer-side allowlisting; every competitor gates onboarding on it. Confirmed by a real
send to kaan@phishsimai.com landing in Junk despite delivering.

- [ ] **PS-DELIVER-ALLOWLIST-01 (P1)** — Onboarding step that hands the customer's IT admin exact
      allowlist instructions, gated as part of setup (like KnowBe4/Proofpoint/Hoxhunt).
      • Microsoft 365: Defender → Policies & rules → Threat policies → **Advanced Delivery →
        Phishing simulation** — configure sending domain(s), IPs, and sim URLs → delivers to inbox,
        does NOT strip links, does NOT count as real threats. Purpose-built for exactly this.
      • Google Workspace: no single equivalent — combine Admin → Apps → Gmail → Spam/Phishing/
        Malware → **Email allowlist (sending IPs)** + a **content-compliance rule scoped to the sim
        sender domain** to bypass spam classification. (Google-approved pattern for third-party sims.)
      • Product surfaces the exact sending domain/IPs/URLs per org so the admin can paste them in.
- [ ] **PS-DELIVER-PREFLIGHT-01 (P2)** — Deliverability preflight: before a campaign launches, send
      a test sim to a seeded/monitored customer mailbox and verify INBOX placement. Block launch (or
      warn hard) if it lands in spam. Turns today's silent failure into a blocking check.
- [ ] **PS-DELIVER-IDENTITY-01** — Split sending identities so they stop poisoning each other:
      apex phishsimai.com = corporate/transactional ONLY; sims → dedicated `sim.phishsimai.com`
      (verified on Resend, own SPF/DKIM/DMARC, warmed); cold outreach → a SEPARATE, expendable
      burner domain (not a subdomain — outreach reputation is disposable). Code hook already in:
      CAMPAIGN_DEFAULT_SENDER env drives the sim sender (PS-SIM-ISOLATION-01); this item is the DNS +
      Resend-domain + warmup + outreach-domain-migration half.

Quick wins (not features — do directly):
- [ ] **DMARC rua** — add reporting so we stop collecting zero data. `_dmarc.phishsimai.com` TXT:
      `v=DMARC1; p=none; rua=mailto:dmarc@phishsimai.com; fo=1`  (same gap on scrollfuel.io).
- [ ] **DKIM 2048** — ask Resend to rotate resend._domainkey from 1024-bit to 2048-bit.
