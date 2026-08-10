# READ FIRST

**Before making any change in `server/os/` or related routers, read the system map.** This is not optional — the L5/L5.8 autonomy layer has genuine cascading-break risk, and tracing an incident without this map takes an hour instead of a minute.

- [`docs/FULL_SYSTEM_MAP.md`](docs/FULL_SYSTEM_MAP.md) — base architecture, agent hierarchy, critical daily cron chain, highest-blast-radius files, safe-change protocol
- [`docs/SYSTEM_MAP_ADDENDUM.md`](docs/SYSTEM_MAP_ADDENDUM.md) — verified corrections (real gate order in `sequences.ts`), what was fixed 2026-08-10, and a summary of Kaan AI OS 7.4 (planned, not built)

Read both together. If you find something in code that contradicts either file, the code is the source of truth — fix the map, don't trust the map over what's actually running.
