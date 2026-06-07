// Self-contained email/password authentication routes.
// Replaces Manus OAuth — no external OAuth server required.
// POST /api/auth/register  — create account
// POST /api/auth/login     — sign in, sets session cookie
// GET  /api/auth/logout    — clears session cookie (also handled via tRPC)
import { COOKIE_NAME } from "@shared/const";
import * as db from "../db";
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

function getSessionCookieOptions(req: any) {
  const isSecure = req.protocol === "https" || (req.headers?.["x-forwarded-proto"] as string) === "https";
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: isSecure,
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerOAuthRoutes(app: any) {
  // POST /api/auth/register
  app.post("/api/auth/register", async (req: any, res: any) => {
    try {
      const { email, password, name } = req.body ?? {};
      if (!email || !password) {
        return res.status(400).json({ error: "email and password are required" });
      }
      if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ error: "password must be at least 8 characters" });
      }
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
  app.post("/api/auth/login", async (req: any, res: any) => {
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
  app.get("/api/auth/logout", (req: any, res: any) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return res.redirect("/");
  });
}
