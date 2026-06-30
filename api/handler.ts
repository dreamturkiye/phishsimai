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
    hq_secret: process.env.HQ_SECRET || "ps-hq-2026"
  });
});

let _routesModule: any = null;

async function getRoutes() {
  if (_routesModule) return _routesModule;
  _routesModule = await import("../server/os/routes");
  return _routesModule;
}

async function dispatchOsRoute(req: any, res: any) {
  try {
    const routes = await getRoutes();
    const path = req.path;
    const method = req.method.toLowerCase();

    // ── Crons (ScrollFuel parity) ───────────────────────────────────────
    if (path === "/api/os/heartbeat") return routes.cronHeartbeat(req, res);
    if (path === "/api/os/sequence") return routes.cronSequence(req, res);
    if (path === "/api/os/aria-daily") return routes.cronAriaDaily(req, res);
    if (path === "/api/os/janet" || path === "/api/os/janet-cgo") return routes.cronJanetCgo(req, res);
    if (path === "/api/os/watchdog") return routes.cronWatchdog(req, res);
    if (path === "/api/os/researcher") return routes.cronResearcher(req, res);
    if (path === "/api/os/discover") return routes.cronDiscover(req, res);
    if (path === "/api/os/agent-watchdog") return routes.cronAgentWatchdog(req, res);
    if (path === "/api/os/qa-smoke") return routes.qaSmokePS(req, res);

    // ── Webhooks ────────────────────────────────────────────────────────
    if (path === "/api/os/webhook/reply") return routes.webhookReply(req, res);
    if (path === "/api/os/webhooks/resend" && method === "post") return routes.webhookResend(req, res);

    // ── HQ ──────────────────────────────────────────────────────────────
    if (path === "/api/os/hq" && method === "get") return routes.hqData(req, res);
    if (path === "/api/os/hq/chat" && method === "post") return routes.hqChat(req, res);
    if (path === "/api/os/hq/ingest" && method === "post") return routes.hqIngest(req, res);
    if (path === "/api/os/hq/tts" && method === "post") return routes.hqTTS(req, res);
    if (path === "/api/os/hq/stt" && method === "post") return routes.hqSTT(req, res);
    if (path === "/api/os/hq/task" && method === "post") return routes.hqTask(req, res);
    if (path === "/api/os/hq/directive" && method === "post") return routes.hqDirective(req, res);
    if (path === "/api/os/hq/memory" && method === "get") return routes.hqMemoryGet(req, res);
    if (path === "/api/os/seed" && method === "post") return routes.hqSeed(req, res);
    if (path === "/api/os/bug-report" && method === "post") return routes.bugReport(req, res);

    // ── Janet / Architect (ScrollFuel path aliases) ─────────────────────
    if (path === "/api/os/janet/report" && method === "get") return routes.janetReport(req, res);
    if (path === "/api/os/architect/pending" && method === "get") return routes.architectPending(req, res);
    if (path === "/api/os/architect/code" && method === "post") return routes.architectCode(req, res);
    if (path === "/api/os/architect/complete" && method === "post") return routes.architectComplete(req, res);
    if (path === "/api/os/architect-run") return routes.architectRun(req, res);

    // ── Telegram ────────────────────────────────────────────────────────
    if (path === "/api/os/webhook/telegram" && method === "post") return routes.telegramWebhook(req, res);
    if (path === "/api/os/telegram/test") return routes.telegramTest(req, res);
    if (path === "/api/os/telegram/status") return routes.telegramStatus(req, res);
    if (path === "/api/os/telegram/setup-webhook" && method === "post") return routes.telegramSetupWebhook(req, res);

    // ── Unified OS router (ScrollFuel /api/os) ──────────────────────────
    if (path === "/api/os" && (method === "get" || method === "post")) return routes.osUnified(req, res);

    // ── Kaan AI OS v4 ───────────────────────────────────────────────────
    if (path === "/api/os/v4/status") return routes.v4Status(req, res);
    if (path === "/api/os/v4/roster") return routes.v4Roster(req, res);
    if (path === "/api/os/v4/standup") return routes.v4Standup(req, res);
    if (path === "/api/os/v4/weekly-review") return routes.v4WeeklyReview(req, res);
    if (path === "/api/os/v4/full") return routes.v4Full(req, res);
    if (path.startsWith("/api/os/v4/agent/")) return routes.v4AgentTalk(req, res);

    return res.status(404).json({ error: "Unknown OS route: " + path });
  } catch (e: any) {
    return res.status(503).json({ error: "OS route failed", detail: e.message + " | " + (e.stack || "").slice(0, 400) });
  }
}

app.all("/api/os", dispatchOsRoute);
app.all("/api/os/*", dispatchOsRoute);

export = app;
