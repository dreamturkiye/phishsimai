# Cold email outreach strategy — current state and recommendations (PS-OUTREACH-AUDIT-01)

**Status: INVESTIGATION.** No copy, send-volume, or gating changes ship in this change. Findings
and proposals only, per the standing doctrine in [`docs/COLD_EMAIL_REPLY_RATE_INVESTIGATION.md`](./COLD_EMAIL_REPLY_RATE_INVESTIGATION.md):
this funnel's body copy and its scale-up decisions are founder-gated, because autonomously-invented
cold-email copy has previously shipped invented stats and produced a hostile reply. All figures
below are read from code, comments, migrations, and `docs/OPEN-COMMITMENTS.md` — none were re-queried
live against the database for this pass, and that gap is itself the first recommendation.

## Scope

"Cold email outreach" is one specific, well-scoped system: the **sales funnel** where PhishSim AI
sells itself to MSP prospects — `ps_outreach_leads`, `server/os/sequences.ts`, `server/os/abTest.ts`,
`server/os/outreachThrottle.ts`, `server/os/replyParser.ts`, `server/os/sendGate.ts`,
`server/os/dexBreaker.ts`, `server/os/agents/leadResearcher.ts`. It is unrelated to the phishing
**simulation** product's own deliverability problem (`campaigns`/`templates`, `todo.md` Phase 19,
`PS-DELIVER-ALLOWLIST-01`) except where the two literally share infrastructure (see Finding 3).

## Current state — how the funnel works today

1. **Lead supply**: Google Maps (Outscraper) discovery → AnyMailFinder/Icypeas enrichment
   (`leadResearcher.ts`) → geo-gated (`US`/`GB`/`AU` only, `CA` excluded by founder decision) →
   sanitized pool (`sanitizeRefill.ts`) that tops up to the day's send cap just-in-time.
2. **Sequence**: touch-1 (new leads, price-led, plain text) → touch-2 (separate 150-lead
   founder-gated batch, `TOUCH2_BATCH1_LIMIT`) → touch-3/4 (price recap, then breakup — went live
   2026-08-24 per `PS-FOLLOWUP-COPY-01`). Every touch is plain-text only, by founder directive
   (`PS-COPY-PLAINTEXT-01`) — HTML/logo blocks read as bulk mail.
3. **Throttle**: hard DB-counted caps — 50/day per touch-type, 100/day combined
   (`server/os/outreachThrottle.ts`), delivered as an hourly drip rather than a burst
   (`PS-DRIP-01`), currently held at a 50/day ramp ceiling rather than the originally-planned 100
   (`PS-RAMP-HOLD-01`) because enrichment throughput hasn't been shown to keep pace.
4. **Gates, in order, every send path**: geo allowlist (fail-closed on unknown country) → MX
   existence check → `assertSendable()` consent/suppression gate (`sendGate.ts`, two redundant
   layers by design) → bounce-rate breaker (`dexBreaker.ts`, threshold **derived** from the live
   sanitized-cohort bounce rate, not a hardcoded constant, tightening-only unless a human loosens
   it) → autonomy gate (skippable only in founder-directed ramp mode).
5. **Reply handling**: inbound replies are LLM-classified (`replyParser.ts`) into
   interested/not_now/not_interested/question/unsubscribe/out_of_office/spam_complaint. Only
   `unsubscribe`/`spam_complaint`/`not_interested` act automatically (internal state only — never
   an outbound email). Anything that would draft an outbound reply, including a checkout link for a
   confident "yes," is **held for founder approval via Telegram**, never auto-sent.
6. **Experimentation**: one live A/B test, `touch1_subject` (subject line only, identical approved
   body in both arms), with an epsilon-greedy adaptive traffic split (`computeAdaptiveSplit`).

The compliance/consent engineering here (geo allowlist, CAN-SPAM footer + one-click
`List-Unsubscribe`, double-layered suppression gate, fail-closed bounce breaker) is thorough and
already reflects lessons from at least two prior incidents (`PS-INCIDENT-01`, `PS-DEX-GATE-01`).
That part of the strategy is not where the funnel is stuck.

## What's actually limiting results

Per `docs/COLD_EMAIL_REPLY_RATE_INVESTIGATION.md` and `docs/KAAN_AI_OS_7.10_Architecture.md:637`,
the funnel's own history states the reply rate is still near zero (884 compliance-led sends → 1
reply, hostile, as of 2026-08-03) and names the constraint as "deliverability / list quality /
offer, not more [analysis] machinery." The findings below are what this pass adds to that
diagnosis — gaps that either sit upstream of reply rate (nothing gets read) or quietly disable the
instrumentation meant to tell you why.

### Finding 1 — The subject-line A/B test cannot ever produce a result (new finding)

`computeAdaptiveSplit()` (`server/os/abTest.ts:225`) defaults `outcomeEvent` to `'opened'`, and its
only call site (`sequences.ts:486`) uses that default. But `touch1Html`/`touch2Html`
(`abTest.ts:93,135`) unconditionally return `''` — every touch-1 and touch-2 send is plain-text by
founder directive (`PS-COPY-PLAINTEXT-01`) — and `sendEmail()` only inserts the open-tracking pixel
into an HTML body (`sequences.ts:97`, `withOpenPixel` at `sequences.ts:65`). **The pixel that
`trackOpen.ts` and migration `0030_ps_outreach_leads_open_tracking.sql` exist to record is never
attached to a single message the funnel actually sends.** `open_count` stays `0` for every lead by
construction, `'opened'` events can never be inserted into `ab_impressions`, and
`computeAdaptiveSplit('touch1_subject')` has therefore returned the fallback `0.5` on every call
since the bandit shipped (`5b69f65`, `1bb6d2e`) — it is not "not yet converged," it is structurally
unable to converge. The subject-line test has been running on a coin flip since day one, with no
path to ever prefer the winning subject. This is silent: nothing errors, nothing logs a warning: it
just never does the one thing it was built to do.

`docs/COLD_EMAIL_REPLY_RATE_INVESTIGATION.md` already flagged that the bandit optimizes the wrong
metric (opens, not replies) and proposed passing `outcomeEvent: 'replied'` once reply volume
supports it. That fix does not by itself help: replies would still need the row to have a
`recordConversion(..., 'replied')` call, which `replyParser.ts:134` already does — reply-based
optimization is not blocked by the plain-text gap, only open-based optimization is. So the
actionable options are (a) leave `'opened'` unused and switch the one call site to `'replied'` per
the prior investigation's own recommendation, since that path is real and already wired, or (b)
retire the open-pixel infrastructure and its `0030` columns as dead code for these two touches. Not
both being possible reduces the ambiguity: there is no version of "fix the open pixel" that helps
without also un-deciding the plain-text doctrine, which is a founder call, not an engineering one.

### Finding 2 — Cold outreach shares a sending domain with real customer/product mail

`FROM = 'Sarah Mitchell <sarah@phishsimai.com>'` (`sequences.ts:14`) is the same apex domain used
for transactional and product email. `todo.md` already names this exact risk
(`PS-DELIVER-IDENTITY-01`, `todo.md:240-245`): cold outreach reputation is disposable and volatile
by nature (bounces, spam complaints, low engagement against a cold list) while transactional mail
reputation is not something you can afford to burn. The item proposes a dedicated, separate burner
domain for cold outreach, distinct from both the apex and the (also-proposed) `sim.phishsimai.com`.
It is written down but not built. Every day the funnel runs on the shared domain is a day a bad
bounce/complaint signal on cold outreach can degrade deliverability for password resets, invoices,
and trial-conversion emails that have nothing to do with it — and the reverse holds too: a customer
marking a `phishsimai.com` product email as spam degrades the cold-outreach sender score. Given the
bounce breaker (`dexBreaker.ts`) already treats this reputation as fragile enough to warrant an
auto-tightening circuit breaker, closing this shared-domain gap changes what that breaker is
protecting from bleeding into product email.

### Finding 3 — DMARC has no aggregate reporting; the funnel is flying blind on alignment failures

`todo.md:248-250` records that `_dmarc.phishsimai.com` has no `rua=` tag, so DMARC failures (spoofing,
alignment breaks from Resend infrastructure changes, a misconfigured forwarder) generate zero
visibility — "we stop collecting zero data." For a domain sending cold, unsolicited B2B mail at
volume, DMARC aggregate reports are the earliest signal of a deliverability problem that would
otherwise only surface as "reply rate dropped again, no idea why." This is listed as a "quick win,"
i.e. a DNS TXT record change, not a code change, and remains outstanding.

### Finding 4 — Supply is still the ramp's binding constraint, and it isn't remeasured

`RAMP_MAX` is held at 50/day, not the originally-planned 100 (`sequences.ts:27-41`,
`PS-RAMP-HOLD-01`), pending "enriched-per-day >= send rate for ~3 consecutive days" — and
`docs/OPEN-COMMITMENTS.md:28` (last reviewed 2026-08-24) still lists this as "not measured yet." A
strategy conversation about "how do we send more" is premature while the volume lever is explicitly
gated on a measurement nobody has taken since the hold was decided. This is process debt, not code
debt: the fix is running the measurement, not writing more send logic.

### Finding 5 — The follow-up ladder has an inconsistent shape that both docs already flag as a trap

Touch-2 lives in its own founder-gated 150-lead batch path (`touch2Eligible`/`runTouch2Batch`,
`sequences.ts:236-344`) with its own budget, while touch-3/4 live in the generic `touchDefs` loop
inside `runFullSequence` with a different budget (`followUpDailyCap`) and are explicitly excluded
from that loop to avoid double-sending. `docs/OPEN-COMMITMENTS.md:39` already names this as
"correct today... but a trap for the next person," deferred until touch-2's batch-1 results are
evaluated. Nothing new to add here except that this consolidation should happen before any further
touch (a hypothetical touch-5) is added, since each new touch currently means deciding by hand which
of two code paths and two budgets it belongs to.

## Recommendations

Ranked by leverage, not by ease — several of these are DNS/measurement actions an operator can take
immediately with no founder sign-off; copy/scale items still require it per standing doctrine.

1. **(Founder decision) Resolve the open-pixel dead end (Finding 1).** Either (a) switch the one
   `computeAdaptiveSplit('touch1_subject')` call site to `outcomeEvent: 'replied'` — the reply path
   is real, already wired via `recordConversion(..., 'replied')`, and this is exactly what the prior
   reply-rate investigation already recommended, or (b) accept plain-text-only as permanent doctrine
   and remove the now-provably-dead pixel path (`withOpenPixel`, `trackOpenPixel`, the `0030`
   columns) rather than keep instrumentation that reads as "we track opens" while it structurally
   cannot. Either answer is fine; leaving it unresolved means the bandit keeps running for free
   without doing anything.
2. **(Operator, no decision needed) Add the DMARC `rua` tag (Finding 3).** A DNS TXT change,
   `v=DMARC1; p=none; rua=mailto:dmarc@phishsimai.com; fo=1`, already specified in `todo.md`. Zero
   send-behavior risk, and it is the cheapest way to get ahead of the next deliverability regression
   instead of diagnosing it after reply rate drops again.
3. **(Founder decision, engineering-ready) Migrate cold outreach off the apex domain (Finding 2).**
   `PS-DELIVER-IDENTITY-01` in `todo.md` already scopes this; the remaining work is DNS + a new
   verified Resend domain + a warm-up period, not new send logic (`FROM`/`REPLY_TO` in
   `sequences.ts:14-15` are the only two lines that would need to change once the domain is live).
   This directly bounds the blast radius of the bounce-breaker's failure mode described in Finding 2.
4. **(Operator, no decision needed) Re-run the enrichment-vs-send-rate measurement (Finding 4)**
   before any conversation about raising `RAMP_MAX`. `docs/OPEN-COMMITMENTS.md` already names the
   exact bar (3 consecutive days, enriched ≥ sent); this is a measurement task, not a code change.
5. **(Founder decision, low urgency) Consolidate the touch-2 batch path with touch-3/4's generic
   loop (Finding 5)** once touch-2 batch 1's 150-send result is in hand — already the plan on record
   in `docs/OPEN-COMMITMENTS.md`, just flagging it stays correctly sequenced behind that evaluation.
6. **(Whoever owns founder reporting) Re-measure and republish the headline funnel numbers** — sends,
   bounce rate, opens (once Recommendation 1 is resolved one way or the other), and replies — before
   using any figure in this document or in `docs/COLD_EMAIL_REPLY_RATE_INVESTIGATION.md` to make a
   decision. Every number cited above is a snapshot from comments/commits, several of them from
   early August; this investigation deliberately did not touch the database, per the task
   instruction to make no send/copy/DB changes, so a live pull is the immediate next step for
   whoever acts on this.
