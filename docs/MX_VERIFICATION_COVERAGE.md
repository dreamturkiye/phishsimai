# MX / verification coverage — simulation send path vs. outreach send path

Diagnosis only. No gate behavior changed; `PAUSE_ON_BOUNCE_RATE` untouched.

## Headline

`hasMx` (`server/os/mxGate.ts`) is wired into every **outreach** send path and into
**zero** points of the **simulation** send path. The simulation path has no
deliverability check of any kind between "campaign launch" and the Resend API call.
Separately, even where `hasMx` *does* run today, the team's own outreach code already
documents that a domain-level MX check cannot detect catch-all domains or per-mailbox
bounces — which is consistent with outreach's 5.0% bounce rate (45/908, Resend export)
despite `hasMx` gating every send.

## Where verification runs today

| Path | Step | What it actually checks | When | Citation |
|---|---|---|---|---|
| Outreach touch-1/2/3-5 | `hasMx(domainOf(lead.email))` | Domain resolves an MX record (RFC 7505 null-MX excluded) | Per send, immediately before `sendEmail` | `server/os/sequences.ts:251-252, 429-430, 531-532` |
| Outreach lead refill (pool top-up, not per-send) | MyEmailVerifier (`MYEMAILVERIFIER_API_KEY` set) — per-mailbox check, detects catch-all. Falls back to `hasMx` only (domain-level, no catch-all detection) if unkeyed, and that fallback is **off by default** (`REFILL_ALLOW_MX_ONLY=1` required to opt in) | Once, when promoting a lead into the sendable pool — not re-checked at actual send time | `server/os/sanitizeRefill.ts:9-15, 69-97` |
| Outreach raw sender (`outreachSequence.ts`) | N/A — path is disabled | `sendEmail` throws unconditionally (PS-BYPASS-CLOSE-01); dead code, cannot send | `server/outreach/outreachSequence.ts:66-77` |
| Simulation campaign launch | Allowlist gate — admin's **claim** that ESP/mail-gateway allowlisting was configured with the customer; never independently verified (no vendor API exposes tenant allowlist policy) | Once per `launch` call, before the send loop | `server/routers.ts:866-872` |
| Simulation campaign launch | Compliance floor (`checkSendAllowed` / `domainEnrolled`) — recipient's domain is a member of `org_verified_domains` with `verified=true` | Once per target, at `enqueueCampaignSend` | `server/routers.ts:899`, `server/lib/campaignSend.ts:34-53`, `server/lib/complianceGuard.ts:44-71` |
| Simulation campaign launch | `sendCampaignEmail` → Resend `emails.send` | Nothing — no pre-flight MX or mailbox check; From-domain allowlist only | `server/routers.ts:911`, `server/email/sender.ts:28-59` |

`org_verified_domains.verified` is set once, via a one-time DNS **TXT** proof of domain
*ownership* (`server/routers.ts:291-319`, `server/lib/domainVerify.ts`) — it answers "does
this org control this domain," not "can this domain currently receive mail" or "does this
specific mailbox exist." It is never re-checked at send time, so a domain that later loses
its MX records, or a target row with a stale/typo'd address, passes the compliance floor
exactly as it did on the day the TXT record was published.

## What's missing on each path

- **Simulation send path**: no `hasMx` call, no per-mailbox check, no re-verification of
  domain deliverability at send time. `mxGate.ts` is imported by three outreach modules and
  by nothing under `server/routers.ts` or `server/lib/campaignSend.ts`. The domain-ownership
  TXT check is a compliance/consent gate, not a deliverability gate, and both gates that do
  run (allowlist claim, TXT ownership) are evaluated long before send time and never re-run
  per-target.
- **Outreach send path**: has `hasMx` at send time (domain-level only) and, at refill time
  only, an optional per-mailbox/catch-all check that requires a paid key and is off by
  default for the free fallback. Neither layer runs *at the moment of send* with per-mailbox
  precision — `hasMx` at send time cannot see catch-all, and the more precise MEV check
  already ran (or didn't) days earlier when the lead was promoted into the pool, so a mailbox
  that stopped existing since then is not caught.

## Is `hasMx` at send time sufficient?

No, even where it already runs. `hasMx` only proves the domain has *some* MX record; it
cannot prove:
1. **Catch-all domains** — a domain with a valid MX may accept mail for any local part and
   never bounce a nonexistent mailbox at the SMTP layer, so `hasMx` reports "fine" for
   addresses no human will ever read. Conversely,
2. **Strict (non-catch-all) domains** — a domain with a valid MX can still hard-bounce a
   specific address that doesn't exist (`550 no such user`), which is a per-mailbox fact
   `hasMx` cannot see by design (it never contacts the mailbox, only the domain's DNS).

`server/os/sanitizeRefill.ts:9-15` documents exactly this tradeoff for the free fallback
("CANNOT detect catch-all... risking bounces") and gates it behind an explicit opt-in flag —
the team has already concluded, in code comments, that MX-only is not sufficient for the
outreach list (~82% catch-all by their own measurement) and built a better check for it.
Outreach's real-world 5.0% bounce rate (45/908) with `hasMx` active on every send is direct
evidence that the domain-level gate alone does not stop per-mailbox bounces.

Applying `hasMx` to the simulation path (which this diagnosis does **not** do) would raise
the floor from "no deliverability check at all" to "the same floor outreach already has and
has already shown is insufficient" — it would catch fully dead domains (the historical
10/125-bounce case `mxGate.ts` was built for) but not catch-all-domain false negatives or
stale/typo'd mailboxes on strict domains, which is the same gap the compliance floor's
one-time TXT check leaves open.

## Not changed

- `PAUSE_ON_BOUNCE_RATE` — untouched, per instruction.
- No gate wired into the simulation send path — diagnosis only, no behavior change.
- No schema change — this report needed no new column/table.
