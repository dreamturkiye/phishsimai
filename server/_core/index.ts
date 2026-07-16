import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { scheduledCampaignHandler } from "../scheduledHandlers";
import { registerStripeWebhook } from "../stripe/webhook";
import { registerTrackingRoutes } from "../email/tracker";
import {
  cronSequence, cronJanet, cronWatchdog, cronHeartbeat,
  webhookReply, hqData, hqChat, hqTTS, hqJanetSignedUrl, hqJanetTool, hqTask, hqMemoryGet, hqSeed,
  v4Status, v4Roster, v4Standup, v4WeeklyReview, v4Full, v4AgentTalk,
  architectAutonomy, architectIncident
} from '../os/routes';
import { miaSpeak, miaFeedbackDigest } from '../mia/routes';
import { mountMiaApi } from '../mia/vercelMount';
import { outreachDiscoverHandler, outreachSequenceHandler, outreachLinkedInHandler } from "../outreach/outreachCrons";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => { server.close(() => resolve(true)); });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // SECURITY: Enforce JWT_SECRET at startup
  const jwtSecret = process.env.JWT_SECRET ?? "";
  if (!jwtSecret || jwtSecret.length < 32) {
    console.error("[FATAL] JWT_SECRET must be set and >= 32 chars. Refusing to start.");
    process.exit(1);
  }

  const app = express();
  const server = createServer(app);

  // SECURITY: Helmet — security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://api.elevenlabs.io", "wss://api.elevenlabs.io", "https://*.elevenlabs.io", "wss://*.elevenlabs.io"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }));

  // SECURITY: CORS — explicit origin allowlist
  const allowedOrigins = [
    "https://phishsimai.com",
    "https://www.phishsimai.com",
    ...(process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? []),
    ...(process.env.NODE_ENV === "development" ? ["http://localhost:3000", "http://localhost:5173"] : []),
  ];
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error("CORS policy: origin not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }));

  // SECURITY: Rate limiting
  const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
  app.use(globalLimiter);
  const strictLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
  app.use("/api/trpc/templates.generate", strictLimiter);
  app.use("/api/trpc/auth", strictLimiter);

  // Body parsers — reduced limits to prevent DoS
  // Stripe webhook must be registered BEFORE body parsers (express.raw needs the raw body for signature verification)
  registerStripeWebhook(app);

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "5mb", extended: true }));

  registerTrackingRoutes(app);
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.post("/api/scheduled/campaign", scheduledCampaignHandler);
  app.post("/api/scheduled/outreach-discover", outreachDiscoverHandler);
  app.post("/api/scheduled/outreach-sequence", outreachSequenceHandler);
  app.post("/api/scheduled/outreach-linkedin", outreachLinkedInHandler);

  // One-time migration: create outreach_leads table
  app.post("/api/admin/migrate-outreach", async (_req, res) => {
    try {
      const { getDb } = await import("../db");
      const { sql } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("No DB connection");
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS outreach_leads (
          id INT AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(320) UNIQUE NOT NULL,
          name VARCHAR(255),
          company VARCHAR(255),
          sector VARCHAR(128),
          country VARCHAR(2),
          job_title VARCHAR(255),
          domain VARCHAR(255),
          linkedin_url TEXT,
          source VARCHAR(64) DEFAULT 'apollo',
          touch1_sent_at TIMESTAMP NULL,
          touch2_sent_at TIMESTAMP NULL,
          touch3_sent_at TIMESTAMP NULL,
          touch4_sent_at TIMESTAMP NULL,
          replied BOOLEAN DEFAULT FALSE,
          unsubscribed BOOLEAN DEFAULT FALSE,
          bounced BOOLEAN DEFAULT FALSE,
          bounced_at TIMESTAMP NULL,
          linkedin_queued BOOLEAN DEFAULT FALSE,
          status VARCHAR(64) DEFAULT 'new',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      res.json({ success: true, message: "outreach_leads table created" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message ?? String(err) });
    }
  });

  // ── Kaan AI OS v3.0 ─────────────────────────────────────────────────────
  // PS-LADDER-01: clean-day ladder. GET ?action=status | ?action=compute&day=YYYY-MM-DD
  // POST an incident to void a day. Both gated by okCronOrHq (CRON_SECRET or HQ_SECRET).
  app.get("/api/architect/autonomy", architectAutonomy);
  app.post("/api/architect/incident", architectIncident);
  app.get("/api/os/sequence", cronSequence);
  app.get("/api/os/janet", cronJanet);
  app.get("/api/os/watchdog", cronWatchdog);
  app.get("/api/os/heartbeat", cronHeartbeat);
  app.post("/api/os/webhook/reply", webhookReply);
  app.get("/api/os/hq", hqData);
  app.post("/api/os/hq/chat", hqChat);
  app.post("/api/os/hq/tts", hqTTS);
  app.get("/api/os/janet/signed-url", hqJanetSignedUrl);
  app.post("/api/os/janet/tool", hqJanetTool);
  app.post("/api/os/hq/task", hqTask);
  app.get("/api/os/hq/memory", hqMemoryGet);
  app.post("/api/os/seed", hqSeed);
  // ── Kaan AI OS v4 — Janet + 8 named specialist agents ────────────────────
  app.get("/api/os/v4/status", v4Status);
  app.get("/api/os/v4/roster", v4Roster);
  app.get("/api/os/v4/standup", v4Standup);
  app.get("/api/os/v4/weekly-review", v4WeeklyReview);
  app.get("/api/os/v4/full", v4Full);
  app.get("/api/os/v4/agent/:name", v4AgentTalk);
  app.post("/api/os/v4/agent/:name", v4AgentTalk);
  mountMiaApi(app);
  // ────────────────────────────────────────────────────────────────────────


  // SECURITY: Seed endpoint gated behind secret
  app.post("/api/admin/seed", async (req, res) => {
    if (process.env.NODE_ENV === "production" && !process.env.ALLOW_SEED_IN_PROD) {
      return res.status(403).json({ success: false, error: "Seed disabled in production" });
    }
    const adminSecret = process.env.ADMIN_SEED_SECRET;
    if (!adminSecret || req.headers["x-admin-secret"] !== adminSecret) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    try {
      const { seedDatabase } = await import("../seed");
      await seedDatabase();
      res.json({ success: true, message: "Database seeded successfully" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message ?? String(err) });
    }
  });

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  server.listen(port, () => { console.log(`Server running on http://localhost:${port}/`); });
}

startServer().catch(console.error);
