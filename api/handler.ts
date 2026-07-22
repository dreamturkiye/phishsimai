// Vercel serverless Express app — product API (tRPC, auth, tracking, Mia) + OS routes
import express from "express";
import { mountProductApi } from "../server/productApiMount";
import { registerStripeWebhook } from "../server/stripe/webhook";
import { registerResendWebhook } from "../server/email/resendWebhook";
import { scheduledCampaignHandler } from "../server/scheduledHandlers";
import { initSentry } from "../server/os/sentryServer";
import { sentryErrorMiddleware } from "../server/os/sentryExpress";

// Error capture. MUST run before any route is registered so an error thrown during
// mounting is still captured. No-op (and never throws) when SENTRY_DSN is unset.
initSentry();

// PS-DOUBLE-SEND-01 defense-in-depth. Express does not await async route handlers, and there was
// NO process-level rejection handler — so a single escaped rejection (e.g. a double-send throwing
// past its own catch) crashed the whole lambda with exit 128, killing any OTHER request in flight
// on the same reused process. That is how a qa-smoke bug could kill a researcher mid-enrichment.
// Log and survive instead of dying: one endpoint's failure must never take down another's work.
// Registered once, guarded so hot-reload re-imports do not stack listeners.
if (!(globalThis as any).__psRejectionGuard) {
  (globalThis as any).__psRejectionGuard = true;
  process.on("unhandledRejection", (reason: any) => {
    console.error("[unhandledRejection] survived (not crashing the shared process):", reason?.stack || reason);
  });
  process.on("uncaughtException", (err: any) => {
    console.error("[uncaughtException] survived:", err?.stack || err);
  });
}

const app = express();

// PS-STRIPE-WEBHOOK-UNMOUNTED: the Stripe webhook was registered ONLY in server/_core/index.ts
// (the local Express server) and never shipped — grep api/index.js for "api/stripe/webhook"
// returned 0. Registering the endpoint in the Stripe dashboard would have pointed at a 404 and
// every completed checkout would land nowhere. Mounted HERE, and BEFORE express.json(): Stripe
// signature verification (webhooks.constructEvent) needs the RAW request body, so the raw route
// must win before the global JSON parser consumes the stream. Order is load-bearing.
registerStripeWebhook(app);
// 1b: Resend delivery webhook — same load-bearing rule as Stripe. Its Svix signature is verified
// over the RAW body, so it MUST win before the global JSON parser below consumes the stream. This
// is the production (Vercel) entry point; server/_core/index.ts registers it for local/dev.
registerResendWebhook(app);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// Product API: tRPC (/api/trpc), auth/OAuth, email open/click tracking, the
// campaign scheduler, and Mia. Mounted once, eagerly, before the OS routes and
// preview routes below (registration order matters). mountProductApi owns Mia,
// so there is no separate lazy Mia mount. registerTrackingRoutes stays public —
// phishing-simulation targets are unauthenticated.
mountProductApi(app);

// Vercel Cron issues GET, but mountProductApi registers the campaign handler as
// POST. Register the same handler for GET so the hourly cron actually fires.
app.get("/api/scheduled/campaign", scheduledCampaignHandler);

app.get("/api/health", (_req: any, res: any) => {
  res.status(200).json({
    ok: true,
    service: "phishsim-ai",
    node: process.version,
    timestamp: Date.now(),
  });
});

// Diagnostics — AUTHENTICATED. This enumerates which secrets are set, the resolved
// provider chain, and the live model ids; that is an inventory of the OS's attack
// surface, so it goes behind the same Bearer CRON_SECRET / HQ_SECRET guard every
// other /api/os/* route uses. It also burns a real LLM call per hit, so leaving it
// open let anyone drain the Cerebras free tier.
app.get("/api/os/diag", async (req: any, res: any) => {
  const { okCronOrHq } = await import("../server/os/routes");
  if (!okCronOrHq(req, res)) return;

  let llmHealth: { ok: boolean; provider?: string; model?: string; chain?: string[]; error?: string } = { ok: false, error: "not tested" };
  let defaultChain = "unknown";
  try {
    const { llmPing, DEFAULT_CHAIN } = await import("../server/os/llmChat");
    defaultChain = DEFAULT_CHAIN;
    llmHealth = await llmPing();
  } catch (e: any) {
    llmHealth = { ok: false, error: e?.message || "llm ping failed" };
  }
  res.json({
    ok: true,
    node: process.version,
    env: process.env.NODE_ENV,
    db: process.env.DATABASE_URL ? "SET" : "MISSING",
    cerebras: process.env.CEREBRAS_API_KEY ? "SET" : "MISSING",
    deepinfra: process.env.DEEPINFRA_API_KEY ? "SET" : "MISSING",
    gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ? "SET" : "MISSING",
    groq: process.env.GROQ_API_KEY ? "SET" : "MISSING",
    ollama: process.env.OLLAMA_API_KEY ? "SET" : "MISSING",
    ollama_model: process.env.OLLAMA_CHAT_MODEL || "glm-5.2:cloud",
    // The code default, and whether an env override is currently beating it. An override that
    // has drifted stale is how new providers silently never run — surface it, don't hide it.
    llm_chain_default: defaultChain,
    llm_chain_override: process.env.LLM_PROVIDER_CHAIN || null,
    llm_chain: process.env.LLM_PROVIDER_CHAIN || defaultChain,
    llm_health: llmHealth,
    hq_secret: process.env.HQ_SECRET ? "SET" : "MISSING",
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
    if (path === "/api/os/metrics-snapshot") return routes.cronMetricsSnapshot(req, res);
    if (path === "/api/os/escalation-notify") return routes.cronEscalationNotify(req, res);
    if (path === "/api/os/founder-brief") return routes.cronFounderBrief(req, res);
    if (path === "/api/os/truth-report") return routes.cronTruthReport(req, res);
    if (path === "/api/os/task-runner") return routes.osTaskRunner(req, res);
    if (path === "/api/os/agent-levels") return routes.cronAgentLevels(req, res);
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
    // PS-REPLY-CAPTURE-01: inbound reply capture (Google Workspace forward relay POSTs here).
    if (path === "/api/os/webhooks/resend-inbound" && method === "post") return routes.resendInbound(req, res);
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
    if (path === "/api/os/architect/breaker") return routes.breakerEndpoint(req, res);
    if (path === "/api/os/architect/pending" && method === "get") return routes.architectPending(req, res);
    // PS-LADDER-01: clean-day ladder. Mounted HERE, not in server/_core/index.ts -- that
    // Express app is the LOCAL dev server and never runs on Vercel. Production enters via
    // api/index.js -> api/handler.ts, which routes by explicit path match. A route mounted
    // in _core is a route that 404s in prod, which is how "mountProductApi defined but never
    // called" happened: code that exists, looks wired, and is unreachable.
    if (path === "/api/os/architect/autonomy" && method === "get") return routes.architectAutonomy(req, res);
    // PS-AUTONOMY-BRIDGE-01: daily earned-autonomy promotion (token-audited). Scheduled AFTER the
    // clean-day compute so it reads the finalized result. Emits the daily autonomy Telegram line.
    if (path === "/api/os/autonomy-promote") return routes.cronAutonomyPromotion(req, res);
    if (path === "/api/os/sanitize-refill") return routes.cronSanitizeRefill(req, res);
    if (path === "/api/os/msp-harvest") return routes.cronMspHubHarvest(req, res);
    if (path === "/api/os/outreach-funnel") return routes.cronOutreachFunnel(req, res);
    if (path === "/api/os/architect/incident" && method === "post") return routes.architectIncident(req, res);
    if (path === "/api/os/architect/wake") return routes.architectWake(req, res);
    if (path === "/api/os/architect/code" && method === "post") return routes.architectCode(req, res);
    if (path === "/api/os/architect/complete" && method === "post") return routes.architectComplete(req, res);
    if (path === "/api/os/portfolio-dispatch" && method === "get") return routes.portfolioDispatchLiveness(req, res);
    if (path === "/api/os/portfolio-dispatch" && method === "post") return routes.portfolioDispatch(req, res);
    if (path === "/api/os/architect-run") return routes.architectRun(req, res);
    if (path === "/api/os/webhook/telegram" && method === "post") return routes.telegramWebhook(req, res);
    if (path === "/api/os/telegram/test") return routes.telegramTest(req, res);
    if (path === "/api/os/telegram/status") return routes.telegramStatus(req, res);
    if (path === "/api/os/telegram/setup-webhook" && method === "post") return routes.telegramSetupWebhook(req, res);
    if (path === "/api/os" && (method === "get" || method === "post")) return routes.osUnified(req, res);
    if (path === "/api/os/v4/status") return routes.v4Status(req, res);
    if (path === "/api/os/v4/wiring") return routes.v4Wiring(req, res);
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

// PS-UNSUBSCRIBE-404. Every cold email since 2026-06-04 carries this link; it had no route and
// fell through vercel.json's SPA catch-all to NotFound. Mounted HERE, on the Vercel entry, not
// on server/_core/index.ts — _core is the local Express server and does not ship to production
// (that is how crmLink's Stripe writer went missing). vercel.json needs the matching rewrite:
// without it, /unsubscribe never reaches this file.
app.get("/unsubscribe", async (req: any, res: any) => {
  const { unsubscribePage } = await import("../server/os/unsubscribe");
  return unsubscribePage(req, res);
});

// RFC 8058 one-click: List-Unsubscribe-Post makes Gmail/Outlook POST to this same URL. The
// handler reads ?e= from the query for both methods, so one implementation serves both.
app.post("/unsubscribe", async (req: any, res: any) => {
  const { unsubscribePage } = await import("../server/os/unsubscribe");
  return unsubscribePage(req, res);
});

// PS-CHECKOUT-404. Cold-email magic-link funnel entry (no auth — the clicker is a lead with no
// account). Mounted on the Vercel entry, not _core/index.ts. Needs the vercel.json rewrite.
app.get("/checkout", async (req: any, res: any) => {
  const { checkoutRedirect } = await import("../server/os/checkout");
  return checkoutRedirect(req, res);
});

// LAST. Catches anything thrown by the routes above (tRPC, auth, tracking, preview
// — none of which had any top-level error handling), captures it to Sentry, and
// bridges it into bug_reports → architectAgent → the autonomy gate. Inert when
// SENTRY_DSN is unset; the bug_reports bridge still runs, since that path predates
// Sentry and does not depend on it.
app.use(sentryErrorMiddleware);

export = app;
