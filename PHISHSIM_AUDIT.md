# PHISHSIM_AUDIT.md — PS-AUDIT-01

_Systematic audit of the four failure **shapes** behind every major incident of 2026-07-17.
Audit for the shapes, not the bugs: each shape below recurs across the codebase, and finding
one instance predicts the next._

Method: four parallel read-only sweeps over `server/` and `client/` (excluding the generated
`api/index.js` bundle), cross-checked against the live production database (`ep-spring-leaf`),
the live Stripe account, Resend's API, and DNS. Every row cites `file:line` or a quoted query.
Claims that could not be verified from the repo are marked **UNVERIFIED**, never asserted.

---

## 0. THE ROOT SHAPE — THREE SHARED SINGLETONS ACROSS FIVE PRODUCTS

The deepest finding. Three separate disasters this session have **one** cause: PhishSim shares a
production singleton with sibling products, with no namespacing, so one product's truth becomes
another product's silent lie.

| singleton | account/host | shared across | how it bit PhishSim |
|---|---|---|---|
| **Neon Postgres** | `ep-purple-surf` | ScrollFuel + PhishSim | 2 weeks of dev landed in ScrollFuel's production DB; the real send-ledger (713 leads) lives there, not in PhishSim's `ep-spring-leaf` |
| **Resend** | one account | 5 domains (phishsimai, tryscrollfuel, scrollfuel.io, solacelife, vellachat) | 13.1% bounce reputation shared across all five; a bad PhishSim campaign degrades ScrollFuel deliverability |
| **Stripe** | `acct_1SX5XF…` "StopThreatAI" | ≥5 products (PhishSim, ScrollFuel, Vela, DreamHub, FanAgent) | wrong-account price ID in prod env; the $99 drift (below); 4 registered webhooks, none PhishSim's |

**The $99 drift — verbatim, because it is the perfect illustration.** A cold email
(`magicLink.ts` → `buildCheckoutEmail`) shipped a red button reading **"Start PhishSimAI —
$99/mo"**. There is no PhishSim plan at $99. `$99/mo` is the unit price of the product literally
named **"Scroll Fuel Agency"**, living in the same Stripe account with no namespace. That is not
a typo. **That is what a shared singleton does: it makes one product's truth into another
product's lie, silently, and it reads as a normal number.** Nobody would flag "$99" as wrong — it
is a real price, for the wrong product.

**The counter-example that proves the fix.** Telegram is the one integration done right.
`server/os/telegram.ts:9-13` reads **product-prefixed** `PHISHSIM_TELEGRAM_*` and explicitly
documents the defense: _"a generic name is exactly how one product ends up alerting on another
product's channel."_ Because it is namespaced, Telegram is **not** a shared-singleton risk for
PhishSim. The lesson was learned for Telegram and never applied to the DB, Resend, or Stripe.

**Open singleton questions (UNVERIFIED from this repo):**
- A fourth shared DB? `NEON_PROJECT_ID` is empty in all env files; only `ep-purple-surf` and
  `ep-spring-leaf` appear. FanAgent's datastore is not referenced here — cannot confirm/deny.
- The founder's Telegram bot `8920614347` appears in `/Users/kaan/HQ/` tooling (separate from
  PhishSim's `PHISHSIM_TELEGRAM_*`); whether that bot is itself shared across HQ automations is a
  founder question, out of scope for this repo.

---

## THE FUNNEL — FOUR STACKED DEFECTS, ONE INSTRUMENT FAILURE

Every stage of the revenue funnel was broken, and each defect hid the one beneath it because
**nothing measured beyond it.**

```
245 delivered → wrong pitch (PS-POSITIONING-01) → 0 replies
  → /checkout 404 (PS-CHECKOUT-404) → 0 sessions EVER
    → no PhishSim webhook registered in Stripe (PS-STRIPE-WEBHOOK-UNREGISTERED) → event has nowhere to go
      → webhook handler not deployed (PS-STRIPE-WEBHOOK-UNMOUNTED) → the URL would 404
        → price map matched nothing (PS-STRIPE-PRICEMAP-01) → 400 unknown_price_id
```

Confirmed against Stripe: **0 charges, 0 subscriptions, 0 checkout sessions, 0
`checkout.session.completed` events, ever.** Nobody has paid — this is latent, caught before it
cost a customer. Fixed this session: PS-CHECKOUT-404, PS-STRIPE-PRICEMAP-01,
PS-STRIPE-WEBHOOK-UNMOUNTED. Founder action: PS-STRIPE-WEBHOOK-UNREGISTERED. Founder + copy:
PS-POSITIONING-01.

---

## SHAPE 1 — WRITES WITH NO READERS (orphaned tables)

_A component writing data nothing consumes: talking to itself._ All 48 prod tables classified
across raw SQL **and** Drizzle ORM paths (20 tables are ORM-only; a raw-SQL grep alone would
falsely flag them).

| table | writer(s) | reader(s) | verdict |
|---|---|---|---|
| **audit_log** | `campaignSend.ts:18`, `circuitBreaker.ts:463`, `autonomyGate.ts:149` | **none** | **ORPHANED** — write-only |
| **founder_briefs** | `founderBrief.ts:197` | **none** | **ORPHANED** — write-only (mitigated: same content sent live via Telegram) |
| os_memory | none | none | dead both ways |
| provider_usage | none | none | dead both ways |
| os_autonomy_state | none in repo | `autonomyGate.ts:135` | reverse-orphan: fail-closed gate reads it; rows seeded out-of-band — **if prod has 0 rows, every gated action silently denies** |
| deploy_verifications | none in repo | `cleanDays.ts:57` | reverse-orphan: read, never written here |
| agent_tasks | `kaan_os_v4.ts:438` (sole writer, test-enforced) | 25+ readers | healthy |
| janet_memory | `memory.ts:28` (+~25 sites) | `memory.ts:41,43` + 5 consumers | healthy |

**audit_log is the one to care about:** the complete governance trail — every autonomy denial,
every manual breaker close, every compliance allow/reject on a send — is written append-only and
**never read by any query, route, or ORM call.** `drizzle/v7Schema.ts:134` declares the table and
nothing ever calls `.from(auditLog)`. An audit or incident post-mortem has no way to retrieve it.

**CORRECTION TO EARLIER CLAIM:** `agent_tasks` was previously reported (by me) as orphaned with
`sales.ts:39` as its writer. **Both are false.** `sales.ts` never writes `agent_tasks`; the table
has 25+ readers and a test-enforced single writer. See PS-LEARN-GATE-01 for the real, sharper
finding.

---

## SHAPE 2 — READS WITH NO WRITERS (blind gates)

_The most dangerous shape: a gate reading an unwritten column does not fail — it silently passes
or silently blocks._

| column · table | read (gate) | written | verdict |
|---|---|---|---|
| `pipeline_stage='customer'` · ps_outreach_leads | `sequences.ts:150,196,202,208,214` (every send gate) | `crmLink.ts:26` — **NOT IN DEPLOYED BUNDLE** | **BLIND — silently passes.** A Stripe payer stays `prospect` and keeps getting "Closing your file." |
| `country` · ps_outreach_leads | `sequences.ts:149,194,200,206,212` | `leadResearcher.ts:219` only; `founderIngest.ts:68` omits it | blind, **fail-closed** — unknown country = unsendable (correct, but rests on manual DB state) |
| `unsubscribed` · ps_outreach_leads | `sequences.ts:149,195,201,207,213` | `replyParser.ts:62` only; **`/unsubscribe` was a 404** | was partially blind — **FIXED this session** |
| `bounced` · ps_outreach_leads | `getSequenceHealth` breaker `sequences.ts:68` | `routes.ts:889` webhook only, **no signature verification** | mounted + in bundle, but blind unless Resend registration is live (it was not: 45 real bounces, 0 recorded — **PS-BOUNCE-01**, backfilled this session) |
| `bounced_at`, `trial_at`, `icp_score`(=const 72), `customer_at`, `tier`, `stripe_customer_id`, `subscription_id` | read by nothing | various | write-no-read / dead both ways |

**Two dead links found by the same method (both FIXED this session):**
- `/unsubscribe` — 404. Every cold email since 2026-06-04 carried a dead opt-out link.
  **CAN-SPAM violation.** Now `server/os/unsubscribe.ts`, mounted on the Vercel entry.
- `/checkout` — 404. The hottest lead (classified `interested`) hit a dead page; 0 sessions ever.
  Now `server/os/checkout.ts`.

Schema drift: `country`, `customer_at`, `trial_at`, `tier`, `stripe_customer_id`,
`subscription_id` exist in the live DB but in **no** migration, schema file, or `conn.ts` DDL —
added out-of-band. A rebuild from `ensureHqTables()` produces a table where the geo gate throws.

---

## SHAPE 3 — INSTRUMENTS THAT CANNOT FAIL

_Not "is it correct" but "can it ever produce a non-default output?"_ Ranked by blast radius.
(The codebase already hardened its **throw** paths — Outscraper, AMF, Resend-in-outreachSequence
all fail loud. These are the surviving **value** paths: an HTTP 402, a missing id, a `false` that
stayed `false`.)

| # | file:line | defect | what it hides |
|---|---|---|---|
| 1 | `sequences.ts:247` | `reportAgentRun('aria', totalSent >= 0)` — a counter that starts at 0 and only increments; **can never be false**. `sendEmail:13-18` never checks `res.ok`. | Revoke the Resend key → every send silently `continue`s → dashboard stays green forever. **PS-ARIA-TAUTOLOGY.** |
| 2 | `sequences.ts:68` + `routes.ts:889` | bounce breaker reads a column ONE unverified, unsigned webhook writes | Webhook unregistered → `bounced` stays false → breaker can never trip. Proven: ran at 13.1% for weeks, blind. |
| 3 | `routes.ts:1044` | `telegramWebhook` returns `{ok:true}` from BOTH try and catch, no error binding | Every founder command can fail permanently; Telegram sees 200 and never retries. |
| 4 | `watchdog.ts:103` | `reportAgentRun('watchdog', true)` hardcoded; 3 checks swallow errors into strings, none increments `issues_found` | DB down → all 3 checks throw → watchdog reports "healthy, 0 issues." |
| 5 | `heartbeat.ts:12-15 vs 27-29` | asymmetric catch: db-check sets `healthy=false`, sequence-check does not | A failing sequence engine returns `{healthy:true, issues:['sequence_engine']}` — self-contradicting. |
| 6 | `circuitBreaker.ts:3-5` | well-built breaker, but "Marcus is NOT wired to call this yet"; sole feed is `routes.ts:992` `.catch(()=>{})` | Breaker can't trip → `cleanDays.ts:111` L5.7 autonomy rung permanently unreachable. |
| 7 | `api/handler.ts` `/api/os/diag` | hardcodes top-level `ok:true` while `llmHealth.ok` may be false | The endpoint named `diag` reads green with every LLM provider dead. |
| 8 | `routes.ts:127,140,154` | `cronEscalationNotify` / `cronFounderBrief` / `cronAgentLevels` return **HTTP 200** with `ok:false`, no log | Vercel Cron counts 200 as success; a permanently failing escalation never appears in cron metrics. |
| 9 | `leadResearcher.ts:111` | `enrichViaHunter` — `catch { return null }`, no `res.ok` check | Hunter.io outage/revoked-key reads identical to "MSP has no contact." |
| 10 | `kaan_os_v4.ts:444,542,644,743,870`; `routes.ts:1004`; `agentHealth.ts:75` | fire-and-forget `.catch(()=>{})` on state-changing + founder-facing calls | `sendTelegram` returns `{ok:false}` and **every caller discards it.** Self-heal restart failures invisible. |
| 11 | `abTest.ts:50,59,69` | `catch {}` on impression insert; `catch { return [] }` on results | Broken A/B recorder reads as "no data yet"; subject-line decisions made on silently-lossy data. |
| 12 | `vercel.json` SPA catch-all `/((?!api).*)→/index.html` | **the domain returns HTTP 200 for every path that does not exist** — `/this-route-does-not-exist` → 200 (React shell) | Any health check hitting a URL on this domain reports green unconditionally. This is the `curl` exiting 0 on a 401, in HTTP form. **The only honest probe is a CONTROL diff**: compare the response body against a known-nonexistent path; if they match, the route is not live. Non-API routes MUST be proven by body-diff, never by status code. |

---

## SHAPE 4 — READS FROM THE WRONG PLACE

_Duplicated sources of truth that drift; the wrong copy wins because it is the one that is wired._

**Env → DB (the 2-week incident):** 5 of 8 env files point `DATABASE_URL` at `ep-purple-surf`
(ScrollFuel prod). Exactly one file — `.env.spring-leaf.real` — is correct, and it is named like a
scratch file. The trap: `.env.spring-leaf` (named for the RIGHT db) has an **empty**
`DATABASE_URL`, and its only endpoint is `OLD_DATABASE_URL=ep-purple-surf`. All 8 are gitignored,
so the wrong host is invisible to code review by construction.

**Stripe price map (PS-STRIPE-PRICEMAP-01, FIXED):** code read `STRIPE_*_PRICE_ID` names that
exist in **zero** env files; prod has `STRIPE_PRICE_*`; the one that resolved was a foreign
account's price. Now reads Stripe live (`server/stripe/prices.ts`).

**One fact, many copies:**
| duplicated value | sources | wins at runtime |
|---|---|---|
| pricing (149/299/749/1499) | `OrgSettings.tsx:20-23` (hardcode) · `VITE_PS_*` env (unread) · `memory.ts:72` (prose) · `Home.tsx:55` (comment) | hardcode; env copy is dead |
| app URL `phishsimai.com` | `VITE_APP_URL` / `APP_URL` / `NEXT_PUBLIC_APP_URL` (none set) + ~15 hardcodes | hardcode; setting one env var moves 1/3 of the app |
| Groq model | `groqChat.ts:4` "single source of truth" + `llm.ts:280`, `marcus.ts:3`, `architectAgent.ts:111` | each site's own copy |
| LLM chain | `llmChat.ts:48` DEFAULT_CHAIN vs `LLM_PROVIDER_CHAIN` env | **env wins unconditionally** (`llmChat.ts:74`); UNVERIFIED whether set in Vercel |

**Schema — two source-of-truth systems:** 26 tables created via `CREATE TABLE IF NOT EXISTS`
(a no-op on an existing table, so edits never propagate). `drizzle/v7Schema.ts` is imported by
**nothing at runtime** — all 11 v7 tables are declared-but-unread. `mia_memory`/`product_feedback`
have THREE definitions; `miaChat.ts:69` fires **MySQL DDL at Postgres** on every request (syntax
error, swallowed at `:97`, retried forever). `drizzle/0000-0005` are stale MySQL migrations in the
same folder as the live Postgres ones (`drizzle/pg/`), unmarked.

**Deployment drift (`_core/index.ts` vs `api/handler.ts`):** the standalone local Express server
registers routes the Vercel bundle does not. Confirmed stranded: `linkStripeCustomerToLead`
(Shape 2 above) and `registerStripeWebhook` (**FIXED this session** — was `_core`-only, grep
`api/index.js` → 0; now mounted before `express.json()` for raw-body signature verification).
`api/handler.ts:131` already names this exact trap: _"a route in _core is a route that 404s in
prod."_

---

## THE LEDGER — every PS-* code from this session

| code | title | status |
|---|---|---|
| PS-TOUCH-GATE-01 | touch-2..5 send gates ignored `pipeline_stage` | FIXED (4 lines, `sequences.ts`) |
| PS-BOUNCE-01 | 45 Resend bounces never written; breaker blind | BACKFILLED (breaker now trips at 46.5%) |
| PS-SEND-LEDGER-01 | 713 leads / 280 sends live in ScrollFuel's DB | FOUND; migration pending founder ruling |
| PS-POSITIONING-01 | copy sells end-user service to MSP resellers; 0 replies on 245 delivered | copy rewrite = founder's |
| PS-LEARN-GATE-01 | `sales.ts:46` gates learning on `replied>0` — cold-start trap | LOGGED (deepest finding) |
| PS-UNSUBSCRIBE-404 | dead CAN-SPAM opt-out link | FIXED + tested (row flips) |
| PS-CHECKOUT-404 | funnel entry 404s; 0 sessions ever | FIXED + tested (real `cs_live` session) |
| PS-STRIPE-PRICEMAP-01 | price map read drifted env names / foreign account | FIXED (reads Stripe live) |
| PS-STRIPE-WEBHOOK-UNMOUNTED | webhook handler not in bundle; URL would 404 | FIXED (mounted, verifies sig) |
| PS-STRIPE-WEBHOOK-UNREGISTERED | no PhishSim endpoint in Stripe | FOUNDER ACTION (URL + events below) |
| PS-CHECKOUT-PROVISION-01 | magic-link payer has no org to activate | LOGGED (fails loud; org-creation is a product decision) |
| PS-ARIA-TAUTOLOGY | `totalSent>=0` health flag can never be false | LOGGED (Shape 3 #1) |
| PS-STRIPE-LOOKUPKEY-01 | prices lack `lookup_key`/`metadata.tier`; name-prefix is only discriminator | LOGGED (hardening, not urgent) |
| PS-BACKUP-127 | `com.phishsim.backup` exit 127 for 11 days; no backups | OPEN — **blocks D2** |

**PS-STRIPE-WEBHOOK-UNREGISTERED — founder action:** in the StopThreatAI Stripe dashboard, add
endpoint `https://phishsimai.com/api/stripe/webhook`, events `checkout.session.completed` +
`customer.subscription.created|updated|deleted`, and put the generated `whsec_…` into Vercel
Production as **`STRIPE_WEBHOOK_SECRET`** (the exact name the code reads at `webhook.ts:75`).
Also delete Vercel's `STRIPE_PRICE_PRO` — a foreign account's price ID, now read by nothing.

---

## NOT DONE, AND WHY

- **D2 (purge 1,064 fabricated `ai_discovery` rows)** — NOT STARTED. Dumps exist
  (`spring-leaf_prod_2026-07-17.sql` 770K, `purple-surf_2026-07-17.sql` 6.9M, content-verified),
  but `com.phishsim.backup` has exited 127 for 11 days: **there is no backup process**, only a
  one-time manual dump. A purge behind a backup that lies is the trade we refused all day. Fix or
  delete that LaunchAgent first.
- **Card-payment end-to-end** — proved everything except the card: all 4 tiers resolve against the
  live account, `/checkout` returns a real session URL, the foreign price fences to null. A real
  card requires Stripe TEST keys (`sk_test_` + test `whsec_`) from the founder.
