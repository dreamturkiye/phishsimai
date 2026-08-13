# PS_OPEN_TRACK_SCHEMA_AUDIT.md — PS-OPEN-TRACK-SCHEMA-01

Standup pivot (2026-08-13): "Validate Open-Tracking Implementation" (PS-OPEN-TRACK-VALIDATE-01,
`server/os/trackOpen.test.ts`) is PAUSED. This is a narrower, static audit of the
`ps_outreach_leads` schema and migration history in its place: do the tracking-pixel columns
that PS-OPEN-TRACK-01 depends on actually exist, and is there evidence they reached production
(`ep-spring-leaf`)?

Method: read-only, repo-only (no DB connection available in this session; no `git`/commit per
task scope). Claims not verifiable from the repo are marked **UNVERIFIED** per the standing audit
convention in `PHISHSIM_AUDIT.md`.

---

## HEADLINE

The columns exist, are additive/idempotent, and the write path is unit-tested against their
exact shape. But the task's own naming (`opened_at`) does not match any column on this table —
that name belongs to an unrelated table — and **no migration-application evidence for `0030`
exists anywhere in this repo more recent than 2026-07-23**, which predates the migration itself.
Whether `0030` has actually run against prod is genuinely **UNVERIFIED**, not confirmed.

---

## 1. THE COLUMN NAMES IN THE TASK DO NOT EXIST

The task asks to verify `opened_at` and `open_count`. `open_count` is correct. `opened_at` is
not — no column by that name exists on `ps_outreach_leads` anywhere in the codebase.

- The real columns, per `drizzle/pg/0030_ps_outreach_leads_open_tracking.sql:21-24`, are
  **`first_opened_at`**, **`last_opened_at`**, and **`open_count`** (lead-level, not touch-level —
  matching the existing shape of `bounced`/`replied`/`unsubscribed` on this table).
- `opened_at` exists in this codebase, but on a **different table entirely**: the circuit-breaker
  state row (`server/os/circuitBreaker.ts:74,501,519`, `drizzle/v7Schema.ts:58`). That table has
  no relationship to `ps_outreach_leads` or cold-outreach tracking. Anyone querying prod for a
  literal `opened_at` column on `ps_outreach_leads` will correctly get "column does not exist" —
  that is not a deployment failure, it's a naming mismatch in how this task was phrased.

**Action for whoever issued the standup task:** re-target verification at `first_opened_at` /
`last_opened_at` / `open_count`, not `opened_at`.

---

## 2. MIGRATION 0030 IS CORRECT, ADDITIVE, AND SELF-CONSISTENT

`drizzle/pg/0030_ps_outreach_leads_open_tracking.sql`:
```sql
ALTER TABLE ps_outreach_leads
  ADD COLUMN IF NOT EXISTS first_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_count INT NOT NULL DEFAULT 0;
```
- Additive only (no drops, no rewrites), idempotent (`IF NOT EXISTS`), matches this repo's
  established migration style.
- **Mirrored** in `server/os/conn.ts:56-61` (`ensureHqTables`) with the identical `ADD COLUMN IF
  NOT EXISTS` triplet — so a from-scratch DB rebuild via app code reproduces the same schema the
  migration produces. No drift between the two sources of truth for this table (contrast with the
  `country`/`tier`/`customer_at` drift `PHISHSIM_AUDIT.md` Shape 4 found on this same table for an
  earlier migration).
- The write path (`server/os/trackOpen.ts:29-35`) issues exactly the columns the migration
  created — `COALESCE(first_opened_at, …)`, unconditional `last_opened_at`, `open_count + 1` — and
  `server/os/trackOpen.test.ts:81-93` asserts that exact query shape against the exact migration
  comment referencing `0030`. Code, migration, and test all agree on the same three column names.

**Verdict: the implementation is correct.** This is not where a schema gap would come from.

---

## 3. WHETHER 0030 REACHED PROD — UNVERIFIED, AND THE GAP IS REAL

This is the part the task actually asked about, and it cannot be closed from the repo alone:

- `CLAUDE.md`'s confirmed prod migration high-water mark is **0000–0014, verified 2026-07-23**
  against `ep-spring-leaf`'s `information_schema` — directly, not via the journal table (which
  `CLAUDE.md` explicitly flags as non-authoritative: 7 journal rows vs 14+ applied migrations).
  `0030` (git-committed 2026-08-11, per `git log`) is **16 migrations past** that last confirmed
  point. There is no memory entry, doc, or artifact in this repo dated after 0030 landed that
  confirms it was applied to `ep-spring-leaf`.
- `drizzle/pg/meta/_journal.json` only has entries through `0006` — migrations `0007`–`0030`
  (including `0030` itself) were hand-authored raw SQL never registered with drizzle-kit's
  journal. This is consistent with `CLAUDE.md`'s warning and confirms the journal cannot answer
  this question even in principle for `0030`.
- **The only self-heal path that would create these columns even if `0030` was never explicitly
  run is `ensureHqTables()`** (`server/os/conn.ts`), and it is called from `hqData` and
  `bugReport` (`server/os/routes.ts:493,797`) — **not** from `trackOpenPixel`
  (`server/os/trackOpen.ts`), which issues its `UPDATE` directly with no guard. This is a
  deliberate omission, not an oversight: `trackOpenPixel` is a no-auth, mail-client-facing,
  latency-measured hot path (`trackOpen.ts:18-19` logs the exact write latency), and
  `ensureHqTables()` runs 8 `CREATE TABLE`/`ALTER TABLE` statements across the entire HQ schema —
  too expensive to run per pixel-hit. So: if `0030` was never run and `hqData`/`bugReport` haven't
  fired since, `first_opened_at`/`last_opened_at`/`open_count` would not exist, and the first real
  pixel hit would throw. **That failure is swallowed** (`trackOpen.ts:44-48`, `catch` → `console.error`
  only) and the recipient still gets a valid pixel — the same fail-open contract as
  `unsubscribe.ts`, but it means a missing-migration state and a healthy state are
  **indistinguishable from the outside**. This is the same shape `PHISHSIM_AUDIT.md` Shape 3
  documents elsewhere on this codebase (an instrument that cannot report failure).
- **No dashboard or report reads these columns.** Grepped `truthReport.ts`, `janetOpsSnapshot.ts`,
  `janet.ts`, `funnelHealth.ts`, `watchdog.ts` for `first_opened_at`/`last_opened_at`/`open_count`
  — zero matches. Even if the columns are populated correctly in prod right now, nothing today
  would notice if they silently stopped being written.
- Separately: the **checked-in build artifact** `api/index.js` was last committed 2026-07-25
  (`git log -1 -- api/index.js`) — before `trackOpen.ts` (last touched 2026-08-12) or `0030`
  (2026-08-11) existed — and contains zero occurrences of `trackOpenPixel`, `/api/os/open`, or any
  of the three column names. `vercel.json`'s `buildCommand` reruns `npm run build` (which
  regenerates `api/index.js` from `api/handler.ts` via esbuild) on every deploy, so this stale
  checked-in copy is **not** proof the route is missing from the live deployment — Vercel doesn't
  build from it. But it means grepping the committed bundle to answer "is this deployed?" gives a
  false negative, which is exactly the kind of trap `PHISHSIM_AUDIT.md` Shape 4 warns about
  (`api/handler.ts:131`: "a route in `_core` is a route that 404s in prod" — the same trap applies
  in reverse to a stale committed bundle).

**What direct verification would require** (cannot be done from this session — no DB credentials,
and per `CLAUDE.md`, `vercel env pull` resolves the wrong Neon project on this machine): run
against `ep-spring-leaf` via the Neon/Vercel dashboard directly —
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'ps_outreach_leads'
  AND column_name IN ('first_opened_at','last_opened_at','open_count');
```
Three rows back = deployed. Fewer = not, and the fail-open swallow above means prod logs
(`[trackOpen] write FAILED`) are the only other signal — worth a targeted log search before
assuming either way.

---

## LEDGER

| code | finding | status |
|---|---|---|
| PS-OPEN-TRACK-SCHEMA-01a | task asked to verify `opened_at`; no such column exists on `ps_outreach_leads` — real names are `first_opened_at`/`last_opened_at`/`open_count` | DOCUMENTED — retarget verification |
| PS-OPEN-TRACK-SCHEMA-01b | migration 0030 additive/idempotent, matches code + test exactly | VERIFIED (repo-level correctness) |
| PS-OPEN-TRACK-SCHEMA-01c | prod application of 0030 to `ep-spring-leaf` has no confirming evidence dated after 2026-07-23 (0030 landed 2026-08-11); journal table doesn't cover it | **UNVERIFIED — needs a live `information_schema` check, not a repo read** |
| PS-OPEN-TRACK-SCHEMA-01d | `trackOpenPixel` writes without the `ensureHqTables()` guard `hqData`/`bugReport` use, and failures are swallowed silently — a missing-migration state is indistinguishable from healthy | LOGGED (deliberate latency tradeoff, not a bug — but it is why 01c can't be ruled out by "the app hasn't crashed") |
| PS-OPEN-TRACK-SCHEMA-01e | no report/dashboard reads these columns — a silent regression here would go unnoticed indefinitely | LOGGED (Shape 2 pattern: write with no reader/verifier) |
