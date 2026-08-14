# Cold email copy variants — reply rate investigation (PS-REPLYCOPY-01)

**Status: INVESTIGATION.** No live copy or send behavior changes here. The candidates below are
proposals for founder review; none activate without a deliberate edit to `AB_EXPERIMENTS` in
`server/os/abTest.ts` plus founder sign-off — this funnel's body copy is founder-supplied/approved
verbatim by long-standing doctrine (PS-COPY-REWRITE-01, PS-COPY-PRICE-01), because autonomously
invented cold-email copy has previously shipped invented stats and fake urgency and produced a
hostile reply. This document does not repeat that mistake: every candidate below only rephrases
already-approved, already-true facts (price, trial terms) — it invents no new claims.

## Scope check

"Reply rate" only exists as a concept in one place in this codebase: the **cold-outreach sales
funnel** (`ps_outreach_leads`, `server/os/sequences.ts`, `server/os/abTest.ts`) where PhishSim AI
sells itself to MSP prospects. The phishing-**simulation** product (`templates`/`campaigns`/
`campaign_results`) has no reply concept at all — no reply column on `campaign_results`, and no
inbound-reply webhook wired yet. So this investigation is scoped to the sales funnel, which is
where "reply rate" is a real, tracked metric today (`ps_outreach_leads.replied`/`replied_at`).

## What exists today

- `server/os/abTest.ts` holds the only live variant/A-B framework. One active experiment,
  `touch1_subject` (abTest.ts:164) — a **subject-line-only** test; both arms send the identical
  approved body (`touch1Text`). Split is 50/50 or adaptive via `computeAdaptiveSplit`.
- `touch2` deliberately has **no** test arm (abTest.ts:161-163) — "one honest email beats two, and
  the loser slot is where invented copy used to hide."
- **Gap found and fixed in this change:** `computeAdaptiveSplit` (abTest.ts) allocated traffic
  toward the higher-**open**-rate arm, not the higher-**reply**-rate arm — a proxy standing in for
  the actual goal this task is about. The function now takes an optional `outcomeEvent` parameter
  (`'opened' | 'replied'`, default `'opened'` — unchanged behavior for every existing call site) so
  a caller can optimize the split on replies directly. `touch1_subject`'s call site in
  `sequences.ts` is untouched; switching it to `'replied'` is a one-line, founder-reviewable change
  once reply volume supports it (see Recommendation).
- `getExperimentResults('touch1_subject')` (abTest.ts:270) already aggregates sent/replied counts
  per variant, but replies have historically been near-zero — the PS-TOUCH2-PRICE-01 note in
  abTest.ts records 0 external replies across 884 sends as of 2026-08-03. A reply-optimized bandit
  needs `minSamples` raised well past the current default (200 *sends*) before it converges on
  signal instead of noise, since so few sends produce a reply at all.

## Candidate copy variants (proposals only — no invented stats/customers)

1. **Reply-first CTA.** `touch1Text` (abTest.ts) currently closes on a link: "Start your free
   trial (30 days, no card): https://phishsimai.com/login?mode=register". Ending on a
   directly-answerable question instead of a link is a well-established lever for *reply* rate
   specifically (as distinct from open/click rate) — hitting reply is a smaller action than
   clicking through and completing a signup flow. Candidate close: *"Worth two minutes, or should
   I stop reaching out?"* — same approved facts, only the final ask changes.

2. **Explicit opt-out ask, extended to touch-1.** `touch2Text` already uses this idea
   ("tell me and I'll stop") and the accompanying comment reasons that a negative reply is still
   useful signal against a currently-unmeasured list. Touch-1 has no equivalent close today.
   Extending it is consistent with already-approved doctrine, not new copy.

3. **Verb-led subject, queued after the current test resolves.** The live test arm
   (`test_t1_subject_punchy`, abTest.ts) is mid-experiment. A further subject variant (e.g. "See
   the 10-minute setup") should wait for that test to conclude, or use a distinct experiment key —
   `AB_EXPERIMENTS` supports one `test` arm per key, not a three-way split.

## Recommendation

- Do not activate any candidate without founder sign-off, per PS-COPY-PRICE-01 / PS-SUBJECT-AB-01
  precedent.
- Once `touch1_subject` accumulates enough sends that `replied` counts are non-trivial, call
  `computeAdaptiveSplit('touch1_subject', <higher minSamples>, floor, 'replied')` instead of the
  open-rate default, so the bandit targets the metric this task cares about.
- If candidate #1 is approved, wire it as a **new** experiment key (e.g. `touch1_cta`) rather than
  overloading `touch1_subject`, so the ongoing subject-line result isn't confounded by a
  simultaneous CTA change.
