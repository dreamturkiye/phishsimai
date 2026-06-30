# PhishSimAI HQ Backend Deployment Guide

## ✅ Completed

### Backend Implementation
- [x] Created `server/os/hq.ts` with TiDB/MySQL implementations:
  - `hqData()` - Returns agent status, metrics, recent tasks
  - `hqChat()` - Routes messages to agents with persistence
  - `hqTask()` - Creates and tracks architect tasks
  - `hqMemoryGet()` - Fetches agent persistent memory
  - `hqSeed()` - Initializes test data (9 agents)
  - `hqTTS()` - TTS endpoint placeholder

### Repository Updates
- [x] Pushed `server/os/hq.ts` (84d815c6)
- [x] Updated `server/os/routes.ts` to export HQ functions (21ee59ff)
- [x] Removed duplicate function definitions (81 lines cleaned)
- [x] Routes already wired in `api/handler.ts` (catch-all `/api/os/*` handler)
- [x] Created database migrations SQL (9848e514)
- [x] Created migration runner script (scripts/run_tidb_migration.py)

### Database Schema
5 tables created for full HQ backend:
1. `agent_status` - Agent health, uptime, metrics
2. `agent_memory` - Persistent key-value store for agents
3. `agent_tasks` - Task/assignment tracking
4. `agent_chats` - Chat history and completion reports
5. `completion_reports` - Qwen task execution results

## 🚀 Deployment Steps (Run on Mac)

### Step 1: Deploy Code to Vercel
```bash
cd /Users/kaan/phishsimai
git fetch origin && git reset --hard origin/main
/opt/homebrew/bin/vercel --prod --yes
```

### Step 2: Run Database Migrations
```bash
export DATABASE_URL="your_tidb_connection_string"
python3 scripts/run_tidb_migration.py
```

### Step 3: Verify Endpoints
```bash
# Health check
curl https://phishsimai.com/api/os/diag

# Seed test data
curl -X POST https://phishsimai.com/api/os/seed \
  -H "Content-Type: application/json" \
  -d '{"secret":"ps-hq-2026"}'

# Get HQ data
curl https://phishsimai.com/api/os/hq?secret=ps-hq-2026

# Get v4 roster
curl https://phishsimai.com/api/os/v4/roster?secret=ps-hq-2026
```

## 📋 Endpoints Live

### HQ Backend Routes (TiDB/MySQL)
- `GET  /api/os/hq?secret=ps-hq-2026` → agent status + metrics
- `POST /api/os/hq/chat` → chat with agents
- `POST /api/os/hq/task` → create/manage tasks
- `GET  /api/os/hq/memory?agent_id=janet` → get agent memory
- `POST /api/os/seed?secret=ps-hq-2026` → seed 9 test agents
- `POST /api/os/hq/tts` → text-to-speech (placeholder)

### Kaan AI OS v4 Roster Routes
- `GET  /api/os/v4/status` → overall system health
- `GET  /api/os/v4/roster` → list all 9 agents
- `GET  /api/os/v4/standup` → daily standup
- `GET  /api/os/v4/weekly-review` → weekly review
- `GET  /api/os/v4/full` → complete orchestration
- `GET/POST /api/os/v4/agent/:name` → talk to specific agent

## 🔧 Configuration

### Required Environment Variables
```
DATABASE_URL=mysql://user:pass@host:port/database
HQ_SECRET=ps-hq-2026
GROQ_API_KEY=gsk_...
```

### Database Connection Pattern (TiDB)
Uses `@tidbcloud/serverless` with `connect()` and `execute()`:
```typescript
const conn = await createConnection({ url: process.env.DATABASE_URL });
const results = await conn.execute('SELECT * FROM agent_status WHERE ?', [status]);
```

## 🎯 Next Steps

1. **Deploy Code**: Run Step 1 above on your Mac
2. **Run Migrations**: Execute `scripts/run_tidb_migration.py` after code is live
3. **Seed Data**: Call `POST /api/os/seed` to initialize 9 test agents
4. **Test HQ Console**: Navigate to `https://phishsimai.com/hq` and verify dashboard loads
5. **Monitor**: Check `/api/os/hq` endpoint returns agent status with healthy counts

## 📊 Database Design

### agent_status
- Tracks health, uptime %, last_ping, task_count
- Indexed on: status, created_at
- Purpose: Real-time agent monitoring dashboard

### agent_memory
- Key-value store for persistent agent state
- Unique constraint on (agent_id, key)
- Purpose: Agent long-term memory, context persistence

### agent_tasks
- Tracks pending→in_progress→completed workflow
- Priority and error handling
- Purpose: Architect task distribution and tracking

### agent_chats
- Message and response logging
- Indexed on agent_name and created_at
- Purpose: Chat history and audit trail

### completion_reports
- Qwen task execution results
- Stores file changes, commit SHA, errors
- Purpose: Tracking automated code changes

## ✨ Architecture Notes

**Same Backend Pattern as ScrollFuel:**
- Identical HQ endpoint signatures
- TiDB/MySQL driver (not Postgres)
- 9-agent system (Janet CGO + 8 specialists)
- Memory persistence via database
- Task tracking and completion reporting

**Key Differences from ScrollFuel:**
- Uses TiDB `@tidbcloud/serverless` not Neon Postgres
- Parameterized queries use `?` placeholders (MySQL style)
- `connect()` returns connection, not pool
- `execute()` for all operations (no tagged templates)

---

**Status**: Ready for deployment ✅
**Last Updated**: 2026-06-30
