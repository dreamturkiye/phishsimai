// Vercel serverless Express app — bare minimum for diagnostics
import express from "express";

const app = express();
app.use(express.json({ limit: "50mb" }));

app.get("/api/health", (_req: any, res: any) => {
  res.status(200).json({
    ok: true,
    service: "phishsim-ai",
    node: process.version,
    timestamp: Date.now()
  });
});

app.get("/api/os/diag", (_req: any, res: any) => {
  res.json({
    ok: true,
    node: process.version,
    env: process.env.NODE_ENV,
    db: process.env.DATABASE_URL ? "SET" : "MISSING",
    groq: process.env.GROQ_API_KEY ? "SET" : "MISSING",
    hq_secret: process.env.HQ_SECRET ? "SET" : "MISSING",
    telegram: process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID ? "SET" : "MISSING",
  });
});

// Load OS routes lazily on first request.
// IMPORTANT: do not cache import failures permanently — retry each request
// so a transient bad deploy doesn't lock out the route forever.
let _routesModule: any = null;

async function getRoutes() {
  if (_routesModule) return _routesModule;
  _routesModule = await import("../server/os/routes");
  return _routesModule;
}

app.all("/api/os/*", async (req: any, res: any) => {
  try {
    const routes = await getRoutes();
    const path = req.path;
    const method = req.method.toLowerCase();

    // ── Original v3 routes ──────────────────────────────────────────────
    if (path === "/api/os/heartbeat") return routes.cronHeartbeat(req, res);
    if (path === "/api/os/sequence") return routes.cronSequence(req, res);
    if (path === "/api/os/janet") return routes.cronJanet(req, res);
    if (path === "/api/os/watchdog") return routes.cronWatchdog(req, res);
    if (path === "/api/os/researcher") return routes.cronResearcher(req, res);
    if (path === "/api/os/webhook/reply") return routes.webhookReply(req, res);
    if (path === "/api/os/hq" && method === "get") return routes.hqData(req, res);
    if (path === "/api/os/hq/chat" && method === "post") return routes.hqChat(req, res);
    if (path === "/api/os/hq/tts" && method === "post") return routes.hqTTS(req, res);
    if (path === "/api/os/hq/task" && method === "post") return routes.hqTask(req, res);
    if (path === "/api/os/hq/memory" && method === "get") return routes.hqMemoryGet(req, res);
    if (path === "/api/os/seed" && method === "post") return routes.hqSeed(req, res);
    if (path === "/api/os/bug-report" && method === "post") return routes.bugReport(req, res);
    if (path === "/api/os/qa-smoke") return routes.qaSmokePS(req, res);
    if (path === "/api/os/webhook/telegram" && method === "post") return routes.telegramWebhook(req, res);
    if (path === "/api/os/telegram/test") return routes.telegramTest(req, res);
    if (path === "/api/os/telegram/status") return routes.telegramStatus(req, res);
    if (path === "/api/os/telegram/setup-webhook" && method === "post") return routes.telegramSetupWebhook(req, res);

    // ── Kaan AI OS v4 — Janet + 8 named specialist agents ───────────────
    if (path === "/api/os/v4/status") return routes.v4Status(req, res);
    if (path === "/api/os/v4/roster") return routes.v4Roster(req, res);
    if (path === "/api/os/v4/standup") return routes.v4Standup(req, res);
    if (path === "/api/os/v4/weekly-review") return routes.v4WeeklyReview(req, res);
    if (path === "/api/os/v4/full") return routes.v4Full(req, res);
    if (path.startsWith("/api/os/v4/agent/")) return routes.v4AgentTalk(req, res);

    return res.status(404).json({ error: "Unknown OS route: " + path });
  } catch (e: any) {
    // Do not cache this failure — next request gets a fresh attempt
    return res.status(503).json({ error: "OS route failed", detail: e.message + " | " + (e.stack || "").slice(0, 400) });
  }
});

export = app;
