import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { scheduledCampaignHandler } from "../scheduledHandlers";
import { outreachDiscoverHandler, outreachSequenceHandler, outreachLinkedInHandler } from "../outreach/outreachCrons";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // Scheduled heartbeat handlers
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

  // One-time seed endpoint — inserts built-in templates + training modules
  app.post("/api/admin/seed", async (_req, res) => {
    try {
      const { seedDatabase } = await import("../seed");
      await seedDatabase();
      res.json({ success: true, message: "Database seeded successfully" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message ?? String(err) });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
