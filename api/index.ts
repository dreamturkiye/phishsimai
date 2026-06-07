// Vercel serverless function — wraps the Express app.
// All /api/* requests are routed here by vercel.json.

import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "../server/_core/oauth";
import { registerStorageProxy } from "../server/_core/storageProxy";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";
import { scheduledCampaignHandler } from "../server/scheduledHandlers";

const app = express();

// Body parser
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Storage proxy (no-op on Vercel Blob)
registerStorageProxy(app);

// Email/password auth routes
registerOAuthRoutes(app);

// Scheduled campaign handler (triggered by Vercel Cron)
app.post("/api/scheduled/campaign", scheduledCampaignHandler);

// One-time seed endpoint
app.post("/api/admin/seed", async (_req: any, res: any) => {
  try {
    const { seedDatabase } = await import("../server/seed");
    await seedDatabase();
    res.json({ success: true, message: "Database seeded successfully" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

// tRPC
app.use(
  "/api/trpc",
  createExpressMiddleware({ router: appRouter, createContext })
);

export default app;
