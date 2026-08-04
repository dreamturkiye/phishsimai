# Deferred projects — scoped, blocked, and NOT to be re-attempted blind

Each entry records a project that was deliberately parked, with the concrete blockers, so a later
session does not rediscover them from scratch or start building against a dependency that isn't
reachable. A project leaves this file only when its blockers are resolved.

---

## DEFER-01 — Custom-domain portal white-labeling (the deep-tier half of #9)

**Status: PARKED. Founder decision 2026-08-04.** The branded-certs half of #9 shipped
(`PS-WHITELABEL-CERT-01`, PR #104) — that is the resale artifact an MSP hands their client, and it
is the piece with immediate sales value. Custom-domain white-labeling (an MSP's clients reaching the
portal at `security.themsp.com`) is deferred, with real reasons, not merely cost.

### The goal (for when it's un-parked)
An MSP's client loads the phishing-simulation portal at the MSP's own domain, fully branded, with
valid TLS — the deep white-label a larger MSP expects.

### Three blockers, each independently sufficient to stop a build

1. **EXTERNAL DEPENDENCIES the runtime cannot reach.**
   - Programmatic domain-add is `POST /v10/projects/{projectId}/domains` on `api.vercel.com`
     (team `getvelacom`), which needs a **Vercel management API token**. The runtime has **none** —
     only build-time `VERCEL_GIT_*` / `VERCEL_OIDC_TOKEN` / `VERCEL_URL`. This is already documented
     in `server/os/deployVerify.ts:10-11` ("we do NOT have a Vercel management-API token in this
     runtime"). `VERCEL_OIDC_TOKEN` is a deployment-identity token, not a management credential.
   - TLS is auto-provisioned by Vercel *only after* the domain is added via that API — gated behind
     the token.
   - Ownership verification is a Vercel-native TXT/CNAME handshake initiated and polled through the
     same API, plus **each MSP's own DNS** must be changed — a second external party per tenant.
   - Plan tier unconfirmed: per-tenant domains at scale can hit plan limits.

2. **SECURITY REGRESSION against tonight's email-auth foundation.**
   Deliverability was hardened around `sim.phishsimai.com` sending on a reputation-isolated
   subdomain, kept off the apex that cold outreach depends on (`PS-SIM-ISOLATION-01`). Introducing
   per-tenant custom domains for the customer-facing surface risks entangling that isolation —
   sending identity, SPF/DKIM/DMARC alignment, and the apex/subdomain split were verified
   empirically tonight (a live sim arrived `From security@sim.phishsimai.com`). A custom-domain
   layer must be designed to NOT touch the sending-auth foundation, or it is a security regression,
   not just a feature cost.

3. **ARCHITECTURE: no server-side host→tenant routing exists.**
   The app is a static CRA SPA. There is **no** host-based tenant resolution anywhere
   (0 hits for `req.hostname` / `x-forwarded-host` in `server/`), and **no** tenant custom-domain
   data model (`org_verified_domains` is the email *sending* domain, an unrelated concept). Both
   would have to be built, and both are inert without blocker 1 resolved — a resolved host that
   never actually routes to us.

### What is buildable now (and why it still shouldn't be built yet)
The data model (a `customDomain` + verification-state column on `msp_tenants`) and a host→tenant
branding middleware are pure code with no external dependency. They are deliberately NOT built:
without blocker 1, the domain neither routes to us nor gets TLS, so the middleware would resolve a
host that never arrives — dead code.

### Decision to make BEFORE any code (do not let a builder pick this silently)
Two architectures, materially different in cost and risk:
- **Per-tenant domain on the Vercel project** — the API path above; simplest, but per-domain API
  calls and plan limits, and the most direct collision risk with the sending-auth foundation.
- **Wildcard domain + per-tenant CNAME, or a thin reverse proxy** — avoids per-domain API calls and
  plan limits; more moving parts, but isolates the customer-facing surface from the sending domain.

### To un-park, the founder must provide
- (a) a Vercel management API token scoped to `getvelacom`;
- (b) confirmation the plan tier permits per-tenant custom domains;
- (c) a chosen architecture (per-domain vs wildcard/proxy), designed to leave `sim.phishsimai.com`
  sending-auth untouched.
