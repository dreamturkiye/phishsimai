# Kaan AI OS v5.0 — Migration Guide

Migrate existing v4.5.x sites to unified L5 core without breaking production.

**Rule:** Deploy to production only after full QA + founder approval.

---

## Overview

| Step | Action | Risk |
|------|--------|------|
| 1 | Merge/copy `lib/kaan-os-core/` | Low |
| 2 | Update `lib/os/version.ts` re-exports | Low |
| 3 | Update `lib/os/osWiring.ts` to L5 | Low |
| 4 | Wire `architectAgent` skill upsert | Low |
| 5 | QA on dev branch | — |
| 6 | Prod deploy via Marcus pipeline | Medium |

---

## ScrollFuel (ugc-agency)

**Branch:** `feature/kaan-os-v5` from `master`

```bash
cd /Users/kaan/ugc-agency
git checkout -b feature/kaan-os-v5
# core already in lib/kaan-os-core/
npm run build
curl "https://scrollfuel.io/api/os?secret=sf-hq-2026&action=wiring"  # after dev deploy
```

**Verify:**
- `version: "5.0.0"`, `autonomy: "L5"`, `l5_ok: true`
- Heal-test: `https://scrollfuel.io/heal-test?arm=sf-hq-2026`

---

## VellaChat (vellachat-source)

**Branch:** `feature/kaan-os-v5` from `main`

```bash
cd /Users/kaan/vellachat-source
git checkout -b feature/kaan-os-v5
# lib/kaan-os-core/ copied from ScrollFuel
npm run build
```

**Product-specific (unchanged):**
- `develop` → dev, `main` → prod
- HQ secret: `vc-hq-2026`
- Verify HQ chat uses `processJanetHQResponse` in `app/api/hq/chat/route.ts`

**Verify:**
```bash
curl "https://vellachat.com/api/os?secret=vc-hq-2026&action=wiring"
```

---

## PhishSimAI (phishsimai)

**Branch:** `feature/kaan-os-v5` from `dev`

```bash
cd /Users/kaan/phishsimai
git checkout -b feature/kaan-os-v5
# server/os/kaan-os-core/ copied from ScrollFuel
npm run build   # or your existing build command
```

**PhishSim differences (preserved):**
- Express routes under `/api/os/*`
- Wiring: `GET /api/os/v4/wiring`
- Architect table: `os_architect_tasks`
- Janet tool: `/api/os/janet/tool`

**Verify:**
```bash
curl "https://phishsimai.com/api/os/v4/wiring?secret=ps-hq-2026"
```

---

## New Site Instantiation

1. Add product to `productRegistry.ts`:

```typescript
import { instantiateNewProduct } from './productRegistry'

const mysite = instantiateNewProduct({
  productId: 'mysite',
  companyId: 'mysite',
  label: 'MySite',
  baseUrl: 'https://mysite.com',
  hqSecret: 'ms-hq-2026',
  repoPath: '/Users/kaan/mysite',
})
```

2. Copy `lib/kaan-os-core/` + `lib/os/*` adapter files from ScrollFuel template
3. Add to `scripts/marcus_watcher.py` PRODUCTS list
4. Set ElevenLabs agent env: `ELEVENLABS_AGENT_JANET_MYSITE`
5. Run wiring audit + heal-test before prod

---

## Database Migrations (auto on first run)

L5 modules create tables/columns idempotently:

- `architect_memory` — adds `skill_tags`, `embedding_hint`, `proactive_score`
- `os_skill_library` — new
- `os_ab_experiments` — new

No manual migration required if architect agent has run once.

---

## Rollback

If v5.0 causes issues on a site:

1. Revert `lib/os/version.ts` to `4.5.8`
2. Revert `lib/os/osWiring.ts` to v4.5.8 checklist
3. Remove `lib/kaan-os-core/` imports from `architectAgent.ts` (optional — core is additive)
4. Redeploy previous branch

Core modules are backward-compatible; v4.5 wiring checks still pass if version pinned to 4.5.8.

---

## Syncing Core Updates

When updating shared logic:

1. Edit canonical copy: `/Users/kaan/ugc-agency/lib/kaan-os-core/`
2. Copy to siblings:
   ```bash
   cp -R /Users/kaan/ugc-agency/lib/kaan-os-core /Users/kaan/vellachat-source/lib/
   cp -R /Users/kaan/ugc-agency/lib/kaan-os-core /Users/kaan/phishsimai/server/os/
   ```
3. Bump version in `kaan-os-core/version.ts` once (all sites re-export)

Future: consider git submodule or npm private package for single source.

---

## QA Commands

```bash
# Wiring (local dev)
curl "http://localhost:3000/api/os?secret=sf-hq-2026&action=wiring" | jq '.version, .autonomy, .l5_ok, .parity_ok'

# Unit smoke (ScrollFuel)
npx tsx scripts/test-kaan-os-core.ts

# Heal-test (staging/prod after deploy)
open "https://scrollfuel.io/heal-test?arm=sf-hq-2026"
```

---

## Production Deploy (founder approval required)

Use existing Marcus pipeline per site:

1. Merge `feature/kaan-os-v5` → dev branch
2. Marcus codes + QA on preview
3. Promote to prod branch
4. Re-run wiring audit on prod URLs
5. Confirm Telegram + HQ dashboard unchanged

**Do not** run `vercel deploy --prod` manually unless Marcus pipeline unavailable.

---

*Migration guide v5.0.0 — feature/kaan-os-v5*
