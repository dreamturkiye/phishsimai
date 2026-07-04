/**
 * Kaan AI OS v5.0 — L5 Hierarchical Autonomous Edition
 * Master specification (ScrollFuel canonical doc; mirrored on all product editions)
 *
 * Supersedes: KAAN_AI_OS_V4.5.md (v4.5.8 remains backward-compatible during migration)
 */

# Kaan AI OS v5.0 — L5 Hierarchical Autonomous Edition

**Version:** 5.0.0  
**Autonomy level:** L5  
**Status:** Dev/QA branches (`feature/kaan-os-v5`) — **not production until founder QA approval**

---

## Executive Summary

v5.0 evolves Kaan AI OS from solid **L4** (self-healing, instant Marcus wake, wiring audit) to **L5 full autonomy**:

- **Unified core** (`lib/kaan-os-core/`) shared by ScrollFuel, PhishSimAI, VellaChat
- **Hierarchical multi-agent org** — Janet CEO → department supervisors → sub-agents
- **Supervisor graph** — LangGraph-style plan → delegate → reflect loops in TypeScript
- **Self-learning** — `architect_memory` + `os_skill_library` with proactive skill recall
- **Governance** — honesty rules, deploy-claim verification, audit logging
- **Cross-company orchestration** — pattern propagation across all three products
- **Marcus proactive** — predictive maintenance scans
- **A/B experiment autonomy** — Nova/Echo sub-team auto-winner selection

All v4.5.8 capabilities are preserved: Mac daemon instant wake, Telegram alerts, HQ dashboard, ConvAI 2-way, heal-test E2E, wiring audit.

---

## Unified Core Architecture

```
lib/kaan-os-core/          ← shared by all sites (copy or symlink per repo)
├── types.ts               Product config, hierarchy, graph state, skills
├── version.ts             KAAN_OS_VERSION = 5.0.0
├── productRegistry.ts     scrollfuel | phishsimai | vellachat + instantiateNewProduct()
├── hierarchy.ts           L5 org tree (Janet CEO + dept heads + sub-agents)
├── supervisorGraph.ts     SupervisorGraph class (plan/delegate/reflect)
├── governance.ts          Honesty gate + audit entries
├── selfLearning.ts        Skill library + recall + proactive suggestions
├── wiringL5.ts            Extended wiring audit (v4.5 + L5 checks)
├── marcusProactive.ts     Queue health + preventive scans
├── abExperiment.ts        Autonomous A/B winner selection
├── crossCompany.ts        Cross-product incident/pattern bus
└── index.ts               Barrel export

lib/os/                    ← product adapter (ScrollFuel / VellaChat)
server/os/                 ← product adapter (PhishSim Express)
```

### Product Registry

| Product | Company ID | HQ Secret | Dev Branch | Prod Branch | Architect Table |
|---------|------------|-----------|------------|-------------|-----------------|
| ScrollFuel | scrollfuel | sf-hq-2026 | dev | master | architect_tasks |
| PhishSimAI | phishsimai | ps-hq-2026 | dev | main | os_architect_tasks |
| VellaChat | vellachat | vc-hq-2026 | develop | main | architect_tasks |

**New site:** call `instantiateNewProduct()` in `productRegistry.ts`, add to `marcus_watcher.py` PRODUCTS, deploy adapter `lib/os/`.

---

## L5 Agent Hierarchy

```
Janet (CEO / CGO) [L5]
├── Marcus — VP Engineering [L5]
│   ├── Quinn (marcus-qa) — QA Automation [L4]
│   ├── Sage (marcus-security) — Security Review [L4]
│   └── Ivy (marcus-infra) — Infra & Deploy [L4]
├── Aria — VP Marketing [L5]
│   ├── Cleo (aria-content) — Content Production [L4]
│   └── Sage-L (aria-social) — Social Distribution [L4]
├── Nova — VP Product [L5]
│   ├── Ollie (nova-onboarding) — Onboarding Optimization [L4]
│   └── Echo (nova-experiments) — Experimentation [L5]
├── Max — Chief of Staff [L5]
│   ├── Blake (max-briefs) — Executive Briefing [L4]
│   └── River (max-coordination) — Cross-Team Coordination [L4]
├── Mason — Sales Director [L4]
├── Rex — RevOps [L4]
├── Finn — CFO [L1]
├── Vera — Customer Success [L4]
└── Scout — Market Intelligence [L1]
```

**Delegation rule:** Janet routes to department supervisors first; Marcus owns all code/deploy decisions.

---

## Supervisor Graph (LangGraph-style)

```typescript
import { SupervisorGraph } from '@/lib/kaan-os-core'

const graph = new SupervisorGraph('scrollfuel', 'scrollfuel', 'Fix HQ dashboard MRR hardcode')
await graph.run()
// state: plan → delegate (marcus, max, …) → reflect → audit log
```

Keyword routing maps goals to departments (engineering, growth, product, operations). Reflection loop capped at 3 iterations.

---

## Self-Learning System

| Layer | Table | Purpose |
|-------|-------|---------|
| Pattern memory | `architect_memory` | Root cause + fix per error signature |
| Skill library | `os_skill_library` | Extracted skills with embedding hints |
| Governance audit | `janet_memory` (type=operating) | L5 delegation + honesty events |

After Marcus diagnosis (`runArchitectAgent`):
1. Upsert `architect_memory`
2. Extract skill tags → `os_skill_library`
3. High-confidence patterns → `propagateIncidentPattern()` to sibling products

---

## L5 Wiring Audit

**ScrollFuel / VellaChat:** `GET /api/os?secret=<hq-secret>&action=wiring`  
**PhishSimAI:** `GET /api/os/v4/wiring?secret=ps-hq-2026`

New response fields:
- `l5_ok` — all L5 features including optional
- `autonomy: "L5"`
- Features: `hierarchy_l5`, `self_learning`, `governance_l5`, `supervisor_graph`, `cross_company`, `marcus_proactive`, `ab_experiment_l5`

---

## Governance & Honesty (L5)

- `l5HonestyCheck()` — blocks deploy completion claims without architect proof
- `appendGovernanceAudit()` — every supervisor graph run logged
- Janet must say **"queued Marcus"** not **"Marcus deployed"** unless `architect_tasks.status=done` + commit SHA within 48h

---

## Marcus Proactive (L5)

`runMarcusProactiveScan(sql, companyId)` checks:
- Stuck tasks >5m
- Concurrent running tasks >2
- High-confidence pattern consolidation opportunities

Invoked from agent-watchdog cron (product adapters).

---

## A/B Experiment Autonomy

Nova/Echo sub-team via `abExperiment.ts`:
- `createAutonomousExperiment()` — starts running experiment
- `evaluateExperimentAutonomy()` — auto-declares winner when min samples + lift threshold met

---

## Cross-Company Orchestration

`crossCompany.ts` maintains in-memory bus (persist via janet_memory in adapters):
- `propagateIncidentPattern(source, pattern)` — notifies sibling products
- Used when ScrollFuel learns a high-confidence fix applicable to VellaChat/PhishSim

---

## Self-Heal Pipeline (unchanged from v4.5.8)

```
Bug / HQ chat / heal-test
  → bug-report OR processJanetHQResponse
  → runArchitectAgent() (Groq diagnosis + skill recall)
  → queueJanetArchitectTask + dispatchMarcusWake()
  → Mac daemon (3s poll + :8765 HTTP wake)
  → /api/architect/code → git dev → QA → prod → complete
  → architect_memory + os_skill_library + Telegram
```

**Mac daemon:** `scripts/marcus_watcher.py --daemon` — do not revert to 10-min-only polling.

---

## File Map (ScrollFuel)

| Path | Role |
|------|------|
| `lib/kaan-os-core/*` | Unified L5 core |
| `lib/os/version.ts` | Re-exports core version |
| `lib/os/osWiring.ts` | L5 wiring report adapter |
| `lib/os/l5Core.ts` | Convenience barrel |
| `lib/os/architectAgent.ts` | Skill upsert + cross-company propagate |
| `lib/os/janetHQActions.ts` | Honesty gate (v4.5.7+, compatible with L5 governance) |
| `lib/sf/agents/kaan_os_v4.ts` | Agent roster + Janet orchestration |
| `scripts/marcus_watcher.py` | Multi-product Mac daemon |

PhishSim: `server/os/kaan-os-core/*` + adapters  
VellaChat: `lib/kaan-os-core/*` (mirror ScrollFuel)

---

## QA Checklist (before prod)

- [ ] `npm run build` passes on all three repos (feature branch)
- [ ] Wiring audit: `parity_ok: true`, `version: 5.0.0`, `autonomy: L5`
- [ ] Heal-test: `/heal-test?arm={sf|vc|ps}-hq-2026` → Marcus queue → dev deploy
- [ ] Janet HQ chat: false deploy claim blocked
- [ ] ConvAI 2-way + `/api/janet/tool` (or PhishSim `/api/os/janet/tool`)
- [ ] Mac watcher heartbeat ≤2m on all products
- [ ] Founder explicit approval

---

## Changelog v4.5.8 → v5.0.0

### Added
- Unified `lib/kaan-os-core/` package
- L5 hierarchy with 14 nodes (CEO + 4 dept heads + 8 sub-agents)
- `SupervisorGraph` orchestration
- `os_skill_library` + skill extraction from architect_memory
- L5 wiring audit extensions
- Cross-company pattern propagation
- Marcus proactive maintenance module
- A/B experiment autonomy module
- Governance audit trail

### Changed
- `KAAN_OS_VERSION` → `5.0.0`
- `osWiring.ts` uses `buildL5WiringReport()`
- Janet title: CEO supervisor (was CGO-only wording)

### Unchanged
- Mac daemon instant wake
- Telegram alerts
- HQ dashboard routes
- ConvAI integration
- Marcus dev → QA → prod pipeline
- Honesty rules (enhanced with audit)

---

## Migration

See **MIGRATION_V5.md** for step-by-step site migration.

---

*Document version: 5.0.0 — generated for feature/kaan-os-v5 branches*
