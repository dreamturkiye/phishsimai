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
        connectSrc: ["'self'"],
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
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "5mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.post("/api/scheduled/campaign", scheduledCampaignHandler);

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
