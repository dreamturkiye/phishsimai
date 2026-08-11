# CLAUDE.md

Project-specific notes for working in this repo.

## Production database
- PhishSim prod `DATABASE_URL` points at Neon **ep-spring-leaf** (project `phishsim-prod`). This is authoritative — confirmed by reading the Vercel dashboard (Settings → Environment Variables → Production) directly.
- ⚠️ Do NOT trust `vercel env pull` on this machine for the prod DB URL — it resolves the WRONG scope (returns ScrollFuel's **ep-purple-surf**). This caused a false "DB mismatch" alarm. Ground truth = the Vercel dashboard, not the CLI pull.
- **ep-purple-surf** is a DIFFERENT database (ScrollFuel / OS-layer: `creators`, `video_generations`, `agent_tasks`). PhishSim's schema (`organizations`, `campaign_results`, `org_verified_domains`, `templates`) lives ONLY on ep-spring-leaf.
- Migrations `0000`–`0014` are applied to ep-spring-leaf (verified 2026-07-23 against `information_schema`; there is no `0008` in the tree). Includes the compliance trigger `trg_assert_target_domain_enrolled` (0002), the autonomy guard triggers `trg_assert_autonomy_level` + `trg_audit_autonomy_delete` (0012), the posture tracker `os_posture_state` / `os_posture_drills` (0013), and `os_autonomy_state.clean_day_streak_criteria` (0014).
- ⚠️ `drizzle.__drizzle_migrations` is NOT authoritative here — it holds 7 rows while 14 migrations are applied, because 0009+ were applied out-of-band. Verify a migration by checking for the object it creates (`information_schema.columns` / `pg_trigger`), never by counting journal rows.
- ⚠️ Don't state a migration high-water mark from memory — this line read `0000`–`0005` for weeks while prod was at `0013`.
- To place a DB connection for a supervised DB gate, use:
  ```sh
  printf 'DATABASE_URL_UNPOOLED=%s\n' 'URL' > .env.prod.local
  ```
  (plain `echo >>` has failed to land.) Delete the file after use.

## Daily autonomy cron chain (ordering is load-bearing)
- These four crons form a dependency chain. `vercel.json` is strict JSON and cannot say so; `server/os/cronOrdering.test.ts` enforces it and fails the build if a link moves out of order.
  ```
  06:00  /api/os/metrics-snapshot            writes metrics_daily for YESTERDAY
  06:30  /api/os/architect/autonomy?compute  judges YESTERDAY (needs that row)
  06:40  /api/os/autonomy-promote            reads the finalized clean day
  08:00  /api/os/janet                       standup renders the posture line
  ```
- ⚠️ Posture check 8 requires a `metrics_daily` row for the judged day; a missing one is `unmeasured`, and **unmeasured is not clean**. Compute used to run at 00:10 — 5h50m *before* the snapshot it depends on — so every day was judged not-clean and the L5.7 gate was unreachable. v1 `computeCleanDay` had no metrics check and scored those days clean, which is why it stayed invisible until PS-POSTURE-01 moved the cron to v2 `recordDay`.
- Each link judges "yesterday" from its own clock, so the whole chain must stay within one UTC day. Don't move a link past midnight.

## LLM / models
- AI features route through **`llmComplete`** (`server/os/llmChat.ts`). Default chain: **Cerebras (free) → DeepInfra (cheap paid) → Ollama Cloud (last resort)**, from `DEFAULT_CHAIN` in that file.
- ⚠️ **`LLM_PROVIDER_CHAIN` unconditionally overrides `DEFAULT_CHAIN`.** If it is set in Vercel, a change to the code default has *no effect in prod*. Check the env before assuming a chain change took effect — a stale value here is how ScrollFuel shipped new providers that silently never ran.
- **Cerebras**: model `zai-glm-4.7` (NOT `glm-4.7` — that id does not exist, and a 404 falls through the chain silently, so a typo makes Cerebras skip forever while DeepInfra quietly absorbs 100% of load). Reasoning is suppressed with `reasoning_effort: 'none'`, which is **model-specific**: valid for `zai-glm-4.7`, INVALID for `gpt-oss-120b` (that model accepts only low|medium|high). Do NOT use `disable_reasoning` — deprecated, removed by Cerebras 2026-07-21. Free tier context cap is **8,192 tokens**; oversized calls pre-emptively skip to DeepInfra.
- **DeepInfra**: `https://api.deepinfra.com/v1/openai/chat/completions`, model `meta-llama/Llama-3.3-70B-Instruct`. Paid from the first call. It has its **own 60s timeout** (`DEEPINFRA_TIMEOUT_MS`), deliberately independent of the shared one — a 70B model on a long prompt will blow a short shared timeout and look like a broken vendor when it's really a client-side abort.
- If `[llm] recovered from reasoning field` appears in logs, reasoning suppression is **not** working — a clean run never prints it.
- Groq and Gemini remain implemented but are **off the default chain** (reachable via `LLM_PROVIDER_CHAIN`). Groq model **`llama-3.1-8b-instant` is DISCONTINUED — do not use.** Current: **`llama-3.3-70b-versatile`** (`GROQ_DEFAULT_MODEL` in `server/os/groqChat.ts`).
- Structured output uses `response_format { type: "json_object" }` — **NOT `json_schema`** (json_schema isn't supported across all chain providers; it 400'd on `llama-3.3-70b-versatile`). Parse/validate the JSON server-side (strip markdown fences) and fall back to no `response_format` if a provider rejects it.
