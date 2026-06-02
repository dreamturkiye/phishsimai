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
