// Vercel serverless Express app — OS routes + lazy product API (tRPC, auth, Mia)
import express from "express";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

let _productMounted = false;
let _productMounting: Promise<void> | null = null;

function isMiaApiPath(path: string): boolean {
  return (
    path.startsWith("/api/mia") ||
    path.startsWith("/api/scheduled/mia-feedback-digest")
  );
}

async function ensureMiaApi(): Promise<void> {
  if (_productMounted) return;
  if (!_productMounting) {
    _productMounting = (async () => {
      const { mountMiaApi } = await import("../server/mia/vercelMount");
      mountMiaApi(app);
      _productMounted = true;
    })();
  }
  await _productMounting;
}

app.use(async (req, res, next) => {
  if (!isMiaApiPath(req.path)) return next();
  if ((req as any)._miaRouted) return next();
  try {
    await ensureMiaApi();
    (req as any)._miaRouted = true;
    app.handle(req, res, next);
  } catch (e: any) {
    res.status(503).json({ error: "Mia API init failed", detail: e?.message });
  }
});

app.get("/api/health", (_req: any, res: any) => {
  res.status(200).json({
    ok: true,
    service: "phishsim-ai",
    node: process.version,
    timestamp: Date.now(),
  });
});

app.get("/api/os/diag", async (_req: any, res: any) => {
  let llmHealth: { ok: boolean; provider?: string; model?: string; chain?: string[]; error?: string } = { ok: false, error: "not tested" };
  try {
    const { llmPing } = await import("../server/os/llmChat");
    llmHealth = await llmPing();
  } catch (e: any) {
    llmHealth = { ok: false, error: e?.message || "llm ping failed" };
  }
  res.json({
    ok: true,
    node: process.version,
    env: process.env.NODE_ENV,
    db: process.env.DATABASE_URL ? "SET" : "MISSING",
    gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ? "SET" : "MISSING",
    groq: process.env.GROQ_API_KEY ? "SET" : "MISSING",
    ollama: process.env.OLLAMA_API_KEY ? "SET" : "MISSING",
    ollama_model: process.env.OLLAMA_CHAT_MODEL || "glm-5.2:cloud",
    llm_chain: process.env.LLM_PROVIDER_CHAIN || "gemini,ollama,groq",
    llm_health: llmHealth,
    hq_secret: process.env.HQ_SECRET || "ps-hq-2026",
    mia: "enabled",
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

    if (path === "/api/os/heartbeat") return routes.cronHeartbeat(req, res);
    if (path === "/api/os/sequence") return routes.cronSequence(req, res);
    if (path === "/api/os/aria-daily") return routes.cronAriaDaily(req, res);
    if (path === "/api/os/janet" || path === "/api/os/janet-cgo") return routes.cronJanetCgo(req, res);
    if (path === "/api/os/watchdog") return routes.cronWatchdog(req, res);
    if (path === "/api/os/researcher") return routes.cronResearcher(req, res);
    if (path === "/api/os/discover") return routes.cronDiscover(req, res);
    if (path === "/api/os/agent-watchdog") return routes.cronAgentWatchdog(req, res);
    if (path === "/api/os/analytics/collect" && method === "post") return routes.analyticsCollect(req, res);
    if (path === "/api/os/sarah-social") return routes.cronSarahSocial(req, res);
    if (path === "/api/os/hq/social") return routes.hqSarahSocial(req, res);
    const heroMatch = path.match(/^\/api\/os\/social\/hero\/([^/]+)\.png$/);
    if (heroMatch && (method === "get" || method === "head")) {
      req.params = { token: heroMatch[1] };
      return routes.socialHeroImage(req, res);
    }
    if (path === "/api/os/qa-smoke") return routes.qaSmokePS(req, res);
    if (path === "/api/os/webhook/reply") return routes.webhookReply(req, res);
    if (path === "/api/os/webhooks/resend" && method === "post") return routes.webhookResend(req, res);
    if (path === "/api/os/hq" && method === "get") return routes.hqData(req, res);
    if (path === "/api/os/hq/chat" && method === "post") return routes.hqChat(req, res);
    if (path === "/api/os/hq/ingest" && method === "post") return routes.hqIngest(req, res);
    if (path === "/api/os/hq/tts" && method === "post") return routes.hqTTS(req, res);
    if (path === "/api/os/janet/signed-url" && method === "get") return routes.hqJanetSignedUrl(req, res);
    if (path === "/api/os/janet/tool" && method === "post") return routes.hqJanetTool(req, res);
    if (path === "/api/os/hq/stt" && method === "post") return routes.hqSTT(req, res);
    if (path === "/api/os/hq/task" && method === "post") return routes.hqTask(req, res);
    if (path === "/api/os/hq/directive" && method === "post") return routes.hqDirective(req, res);
    if (path === "/api/os/hq/memory" && method === "get") return routes.hqMemoryGet(req, res);
    if (path === "/api/os/seed" && method === "post") return routes.hqSeed(req, res);
    if (path === "/api/os/bug-report" && method === "post") return routes.bugReport(req, res);
    if (path === "/api/os/janet/report" && method === "get") return routes.janetReport(req, res);
    if (path === "/api/os/architect/pending" && method === "get") return routes.architectPending(req, res);
    if (path === "/api/os/architect/code" && method === "post") return routes.architectCode(req, res);
    if (path === "/api/os/architect/complete" && method === "post") return routes.architectComplete(req, res);
    if (path === "/api/os/architect-run") return routes.architectRun(req, res);
    if (path === "/api/os/webhook/telegram" && method === "post") return routes.telegramWebhook(req, res);
    if (path === "/api/os/telegram/test") return routes.telegramTest(req, res);
    if (path === "/api/os/telegram/status") return routes.telegramStatus(req, res);
    if (path === "/api/os/telegram/setup-webhook" && method === "post") return routes.telegramSetupWebhook(req, res);
    if (path === "/api/os" && (method === "get" || method === "post")) return routes.osUnified(req, res);
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

app.all("/api/os/*", dispatchOsRoute);

app.get("/preview/social/:token", async (req: any, res: any) => {
  const routes = await getRoutes();
  return routes.socialPreviewPage(req, res);
});

app.post("/preview/social/:token/review", async (req: any, res: any) => {
  const routes = await getRoutes();
  return routes.socialPreviewReview(req, res);
});

export = app;
