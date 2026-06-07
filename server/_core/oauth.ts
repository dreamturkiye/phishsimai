// Self-contained email/password authentication routes.
// Replaces Manus OAuth — no external OAuth server required.
// POST /api/auth/register  — create account
// POST /api/auth/login     — sign in, sets session cookie
// GET  /api/auth/logout    — clears session cookie (also handled via tRPC)

import { COOKIE_NAME } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

// Simple password hashing using Node.js built-in crypto (no bcrypt dependency)
import { createHash, randomBytes, timingSafeEqual } from "crypto";

function hashPassword(password: string, salt: string): string {
  return createHash("sha256").update(salt + password + salt).digest("hex");
}

function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

function verifyPassword(password: string, salt: string, hash: string): boolean {
  const computed = hashPassword(password, salt);
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  } catch {
    return false;
  }
}

export function registerOAuthRoutes(app: Express) {
  // POST /api/auth/register
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body ?? {};
      if (!email || !password) {
        return res.status(400).json({ error: "email and password are required" });
      }
      if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ error: "password must be at least 8 characters" });
      }

      // Check if user already exists
      const existing = await db.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: "An account with this email already exists" });
      }

      const salt = generateSalt();
      const passwordHash = hashPassword(password, salt);
      const openId = `local_${randomBytes(16).toString("hex")}`;

      await db.upsertUser({
        openId,
        name: name ?? email.split("@")[0],
        email,
        loginMethod: "email",
        passwordHash: `${salt}:${passwordHash}`,
        lastSignedIn: new Date(),
      });

      const user = await db.getUserByOpenId(openId);
      if (!user) return res.status(500).json({ error: "Failed to create user" });

      const token = await sdk.createSessionToken(openId, { name: user.name ?? "" });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, cookieOptions);
      return res.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
    } catch (err: any) {
      console.error("[Auth] Register error:", err);
      return res.status(500).json({ error: "Registration failed" });
    }
  });

  // POST /api/auth/login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body ?? {};
      if (!email || !password) {
        return res.status(400).json({ error: "email and password are required" });
      }

      const user = await db.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const [salt, hash] = user.passwordHash.split(":");
      if (!salt || !hash || !verifyPassword(password, salt, hash)) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });

      const token = await sdk.createSessionToken(user.openId, { name: user.name ?? "" });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, cookieOptions);
      return res.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
    } catch (err: any) {
      console.error("[Auth] Login error:", err);
      return res.status(500).json({ error: "Login failed" });
    }
  });

  // GET /api/auth/logout
  app.get("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return res.redirect("/");
  });
}
