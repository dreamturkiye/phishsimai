# Spec ↔ code drift register

Deliberate divergences between the Kaan AI OS specs and enforced code, each with a decision and a
direction. **A row here means the drift was decided, not missed.**

Rule: when spec and code disagree, the one verified against reality wins, and the loser gets a row
here so the next reader does not "fix" the correct side.

---

## PS-DRIFT-01 — protected paths: **CODE WINS.** Spec update needed.

**Decided 2026-08-04 by Kaan.** Direction of the fix: **update the spec, not the code.**

### What diverged

`server/os/circuitBreaker.ts` (`PROTECTED_CATEGORIES`) enforces the paths Marcus may never write on
his execute path. The originally-specified set was:

    **/auth/**, **/webhooks/**, **/payment*/**, **/billing/**

Measured against the real tree: **0 of 486 tracked files matched.** PhishSim has none of those four
directories. Identity lives in `server/_core/oauth.ts`, money in `server/stripe/`, webhooks in
`server/email/resendWebhook.ts` and `server/stripe/webhook.ts`.

The unit tests passed throughout because they asserted on invented paths (`server/webhooks/stripe.ts`,
`server/billing/invoice.ts`) that exist nowhere in the repo — a guard proven against hypothetical
inputs, protecting nothing.

### What the code now enforces (PS-MARCUS-SELFGUARD-01, `802f5a9`, PR #91)

Five categories, each asserted non-empty against the real tree by
`server/os/architectProtectedPath.test.ts`, so a category that stops matching fails loudly instead of
silently protecting nothing:

| category | covers |
|---|---|
| `identity` | `server/_core/oauth.ts`, `cookies.ts`, `context.ts`, `trpc.ts`, `useAuth.ts` |
| `money` | `server/stripe/**`, any `*billing*` / `*payment*` file |
| `webhooks` | any `*webhook*` file |
| `send_rails` | `campaignSend.ts`, `complianceGuard.ts` |
| `governance` | the gate, the breaker, promotion inputs, `drizzle/`, and the tests pinning them |

### Reconciled against 7.4 — they agree

`Kaan_AI_OS_7.4_Architecture_Spec.md` **§2.1.1 L67** defines Tier B as, without exception:

> "any DELETE or destructive UPDATE of data; any change to a payment flow, pricing, billing, or
> subscription logic; any schema migration or DDL; any change to auth/security gates; anything that
> spends money or moves funds; anything the engine cannot classify with confidence
> (**unknown ⇒ Tier B**, fail-safe)."

That maps cleanly onto `money`, `identity`, and `governance` (which covers `drizzle/`, i.e. schema
and DDL). **7.4's real Tier-B text and the code are consistent.** No change needed on either side
for 7.4.

### ⚠️ SPEC-UPDATE-NEEDED

The stale four-glob list is **not** in 7.4 — that document has six sections (0–6) and no path list.
It lives in the older architecture docs and in the pre-#91 code comment. When 7.4 (or whichever
document carries the crown-jewel path list) is next edited:

- Replace the four generic globs with the five code-verified categories above.
- Keep the requirement that each category be asserted non-empty against the real tree — that is the
  property that made the emptiness visible in the first place.

**Do NOT weaken `PROTECTED_CATEGORIES` to match any document that still lists the four globs.**

---

## PS-DRIFT-02 — the agent roster: chart ≠ runtime. Tracked, not deleted.

**Decided 2026-08-04 by Kaan.** Direction: **track the gap; build or remove later, deliberately.**

`L5_HIERARCHY` (`server/os/kaan-os-core/hierarchy.ts`, pinned vendored copy) currently reports
**8 built / 14 unbuilt of 22 charted roles**, with `dex` shipped but absent from the chart.

Three names were nearly deleted as "ghosts". Checked against the specs first, and that would have
been wrong in both directions:

- **Max — SPECIFIED, UNBUILT.** `KAAN_AI_OS_V7.3_ORIGINAL.md:97` lists him as Chief of Staff with a
  real remit (task routing, calendar/ops, cleanup jobs, health probes). Also `KAAN_AI_OS_V6.md:25`.
  A roadmap role, not a ghost.
- **Blake and River — IN CODE, IN NO SPEC.** 0 hits across 7.4, both v7.3 documents, and V6. They
  exist only at `hierarchy.ts:140,151`. Origin unknown.
- **Dex — BUILT, UNCHARTED.** On cron, in both standup paths, absent from `L5_HIERARCHY`.

Live blast radius today is **zero**: nothing iterates the array. `janet.ts` / `janetReport.ts`
reference it 0 times, `hierarchyPromptBlock()` is never called, and `getDirectReports()` is used only
by `supervisorGraph.ts`, which no product file imports.

`server/os/hierarchyRoster.test.ts` tracks this: it reports built-vs-unbuilt, fails on any **new**
uncharted-or-unexecuted role, and forces its own exception list to shrink once the gap closes. It
explicitly asserts Max, Blake and River remain on the chart — the tracker may never delete a role.

Changing the chart is an **upstream** change to `dreamturkiye/kaan-os-core`, shared with ScrollFuel
and VellaChat, and needs their code visible before `max` is touched. A review diff exists but is
uncommitted.
