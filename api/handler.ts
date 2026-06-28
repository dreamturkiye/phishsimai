// Vercel serverless Express app
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";
import { scheduledCampaignHandler } from "../server/scheduledHandlers";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "phishsim-ai", timestamp: Date.now() });
});

app.post("/api/scheduled/campaign", scheduledCampaignHandler);

// Kaan AI OS v3.0 routes
let osRoutes: any = null;
async function loadOSRoutes() {
  if (!osRoutes) {
    try {
      osRoutes = await import("../server/os/routes");
    } catch(e: any) {
      console.error("OS routes load error:", e.message);
    }
  }
  return osRoutes;
}

app.all("/api/os/*", async (req: any, res: any) => {
  const routes = await loadOSRoutes();
  if (!routes) { return res.status(503).json({ error: "OS routes failed to load" }); }
  
  const path = req.path;
  const method = req.method.toLowerCase();
  
  if (path === "/api/os/heartbeat") return routes.cronHeartbeat(req, res);
  if (path === "/api/os/sequence") return routes.cronSequence(req, res);
  if (path === "/api/os/janet") return routes.cronJanet(req, res);
  if (path === "/api/os/watchdog") return routes.cronWatchdog(req, res);
  if (path === "/api/os/webhook/reply") return routes.webhookReply(req, res);
  if (path === "/api/os/hq" && method === "get") return routes.hqData(req, res);
  if (path === "/api/os/hq/chat" && method === "post") return routes.hqChat(req, res);
  if (path === "/api/os/hq/tts" && method === "post") return routes.hqTTS(req, res);
  if (path === "/api/os/hq/task" && method === "post") return routes.hqTask(req, res);
  if (path === "/api/os/hq/memory" && method === "get") return routes.hqMemoryGet(req, res);
  if (path === "/api/os/seed" && method === "post") return routes.hqSeed(req, res);
  if (path === "/api/os/diag") return res.json({ node: process.version, env: process.env.NODE_ENV });
  res.status(404).json({ error: "Unknown OS route" });
});

app.use(
  "/api/trpc",
  createExpressMiddleware({ router: appRouter, createContext })
);

export = app;
