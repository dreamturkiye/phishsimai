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
    hq_secret: process.env.HQ_SECRET || "MISSING"
  });
});

// Load OS routes lazily on first request
let _osLoaded = false;
let _osError: string | null = null;

app.all("/api/os/*", async (req: any, res: any) => {
  if (_osError) {
    return res.status(503).json({ error: "OS routes failed", detail: _osError });
  }
  if (!_osLoaded) {
    try {
      const routes = await import("../server/os/routes");
      const path = req.path;
      const method = req.method.toLowerCase();
      _osLoaded = true;
      if (path === "/api/os/heartbeat") return (routes as any).cronHeartbeat(req, res);
      if (path === "/api/os/sequence") return (routes as any).cronSequence(req, res);
      if (path === "/api/os/janet") return (routes as any).cronJanet(req, res);
      if (path === "/api/os/watchdog") return (routes as any).cronWatchdog(req, res);
      if (path === "/api/os/webhook/reply") return (routes as any).webhookReply(req, res);
      if (path === "/api/os/hq" && method === "get") return (routes as any).hqData(req, res);
      if (path === "/api/os/hq/chat" && method === "post") return (routes as any).hqChat(req, res);
      if (path === "/api/os/hq/tts" && method === "post") return (routes as any).hqTTS(req, res);
      if (path === "/api/os/hq/task" && method === "post") return (routes as any).hqTask(req, res);
      if (path === "/api/os/hq/memory" && method === "get") return (routes as any).hqMemoryGet(req, res);
      if (path === "/api/os/seed" && method === "post") return (routes as any).hqSeed(req, res);
      return res.status(404).json({ error: "Unknown OS route: " + path });
    } catch(e: any) {
      _osError = e.message + " | " + (e.stack || "").slice(0, 300);
      return res.status(503).json({ error: "OS load failed", detail: _osError });
    }
  }
});

export = app;
