// Vercel serverless Express app (bundled to api/index.js at build time)
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "../server/_core/oauth";
import { registerStorageProxy } from "../server/_core/storageProxy";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";
import { scheduledCampaignHandler } from "../server/scheduledHandlers";
import { registerStripeWebhook } from "../server/stripe/webhook";
import { pingDb } from "../server/db";

const app = express();

// Stripe webhook must receive raw body — register before express.json()
registerStripeWebhook(app);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

registerStorageProxy(app);
registerOAuthRoutes(app);

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "phishsim-ai",
    timestamp: Date.now(),
  });
});

app.get("/api/health/db", async (_req, res) => {
  const result = await pingDb();
  if (result.ok) {
    return res.status(200).json({ ok: true, db: "connected", timestamp: Date.now() });
  }
  return res.status(503).json({
    ok: false,
    db: "error",
    error: result.error,
    timestamp: Date.now(),
  });
});

app.post("/api/scheduled/campaign", scheduledCampaignHandler);

app.post("/api/admin/seed", async (_req, res) => {
  try {
    const { seedDatabase } = await import("../server/seed");
    await seedDatabase();
    res.json({ success: true, message: "Database seeded successfully" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

app.use(
  "/api/trpc",
  createExpressMiddleware({ router: appRouter, createContext })
);

// CommonJS export for Vercel @vercel/node
export = app;
