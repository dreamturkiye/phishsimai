// ─────────────────────────────────────────────────────────────────────────────
//  SENTRY SERVER: fail-safety (DSN unset ⇒ inert no-op) + the PII scrub.
//
//  The fail-safe path is not a nicety — SENTRY_DSN is unset in dev, in CI, and in
//  every preview deploy. If the absence of a DSN could throw, it would take down
//  the app everywhere except production.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { scrubText, scrubUrl, scrubDeep, REDACTED } from "../../shared/piiScrub";

describe("SENTRY_DSN unset → inert no-op, never crashes", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SENTRY_DSN;
  });

  it("initSentry() returns false and does not throw", async () => {
    const { initSentry } = await import("./sentryServer");
    expect(() => initSentry()).not.toThrow();
    expect(initSentry()).toBe(false);
  });

  it("isSentryEnabled() is false", async () => {
    const { initSentry, isSentryEnabled } = await import("./sentryServer");
    initSentry();
    expect(isSentryEnabled()).toBe(false);
  });

  it("captureServerError() is a silent no-op", async () => {
    const { initSentry, captureServerError } = await import("./sentryServer");
    initSentry();
    expect(() => captureServerError(new Error("boom"), { route: "/x" })).not.toThrow();
  });

  it("flushSentry() resolves immediately", async () => {
    const { initSentry, flushSentry } = await import("./sentryServer");
    initSentry();
    await expect(flushSentry(10)).resolves.toBeUndefined();
  });

  it("capturing before init() ever ran still does not throw", async () => {
    const { captureServerError } = await import("./sentryServer");
    expect(() => captureServerError(new Error("boom"))).not.toThrow();
  });
});

describe("SENTRY_DSN set → capture is enabled", () => {
  beforeEach(() => {
    vi.resetModules();
    // Syntactically valid DSN. Nothing is ingested (the host is not real), but init
    // must succeed and flip the flag — otherwise capture would silently never run.
    process.env.SENTRY_DSN = "https://abc123@o0.ingest.sentry.io/1234567";
  });

  it("initSentry() returns true and isSentryEnabled() flips", async () => {
    const { initSentry, isSentryEnabled } = await import("./sentryServer");
    expect(initSentry()).toBe(true);
    expect(isSentryEnabled()).toBe(true);
  });

  it("captureServerError() does not throw when enabled", async () => {
    const { initSentry, captureServerError } = await import("./sentryServer");
    initSentry();
    expect(() => captureServerError(new Error("boom"), { route: "/x" })).not.toThrow();
  });

  it("a malformed DSN does not crash the app — it degrades to disabled", async () => {
    process.env.SENTRY_DSN = "not-a-valid-dsn";
    const { initSentry, captureServerError } = await import("./sentryServer");
    expect(() => initSentry()).not.toThrow();
    expect(() => captureServerError(new Error("boom"))).not.toThrow();
  });
});

describe("scrubEvent — nothing sensitive leaves the process", () => {
  beforeEach(() => vi.resetModules());

  it("redacts emails in the exception value, drops headers/cookies and the user", async () => {
    const { scrubEvent } = await import("./sentryServer");

    const event = scrubEvent({
      message: "failed for kaanari@mac.com",
      exception: { values: [{ value: "no user kaanari@mac.com" }] },
      request: {
        url: "https://app.test/x?token=abc123secret&email=a@b.com",
        headers: { authorization: "Bearer abc123", cookie: "sid=xyz" },
        cookies: { sid: "xyz" },
        data: { password: "hunter2" },
        query_string: "token=abc123secret",
      },
      user: { email: "kaanari@mac.com", id: "u1" },
    });

    const flat = JSON.stringify(event);
    expect(flat).not.toMatch(/kaanari@mac\.com/);
    expect(flat).not.toMatch(/abc123/);
    expect(flat).not.toMatch(/hunter2/);
    expect(flat).not.toMatch(/sid=xyz/);
    expect(event.request.headers).toBeUndefined();
    expect(event.request.cookies).toBeUndefined();
    expect(event.request.data).toBeUndefined();
    expect(event.user).toBeUndefined();
    expect(event.request.url).toBe("https://app.test/x");
  });

  it("drops the event entirely rather than risk leaking on an unexpected shape", async () => {
    const { scrubEvent } = await import("./sentryServer");
    const hostile: any = {};
    Object.defineProperty(hostile, "message", {
      get() { throw new Error("boom"); },
      enumerable: true,
    });
    expect(scrubEvent(hostile)).toBeNull(); // fail closed
  });
});

describe("piiScrub", () => {
  it("redacts email addresses", () => {
    expect(scrubText("login failed for kaanari@mac.com")).toBe(`login failed for ${REDACTED}`);
  });

  it("redacts JWTs", () => {
    const s = scrubText("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.SflKxwRJSMeKKF2QT4");
    expect(s).not.toMatch(/eyJ/);
    expect(s).toMatch(/\[redacted\]/);
  });

  it("redacts bearer tokens", () => {
    expect(scrubText("Authorization: Bearer sk-abc123def456")).not.toMatch(/abc123def456/);
  });

  it("redacts the password out of a connection string", () => {
    const s = scrubText("postgres://neondb_owner:npg_SuperSecret99@ep-x.neon.tech/neondb");
    expect(s).not.toMatch(/npg_SuperSecret99/);
    expect(s).toMatch(/neondb_owner/); // the non-secret part survives — still debuggable
  });

  it("redacts api-key style key/value pairs", () => {
    expect(scrubText('api_key="gsk_liveKey123456"')).not.toMatch(/gsk_liveKey123456/);
    expect(scrubText("password: hunter2xyz")).not.toMatch(/hunter2xyz/);
  });

  it("keeps ordinary error text intact — a scrub that eats everything is useless", () => {
    const s = scrubText("TypeError: cannot read properties of undefined (reading 'id')");
    expect(s).toBe("TypeError: cannot read properties of undefined (reading 'id')");
  });

  it("scrubUrl drops the query string and fragment", () => {
    expect(scrubUrl("/api/x?email=a@b.com&token=abc123def#frag")).toBe("/api/x");
  });

  it("scrubDeep redacts sensitive KEYS regardless of their value", () => {
    const out: any = scrubDeep({
      authorization: "whatever",
      user_email: "a@b.com",
      nested: { api_key: "k", safe: "keep-me" },
    });
    expect(out.authorization).toBe(REDACTED);
    expect(out.user_email).toBe(REDACTED);
    expect(out.nested.api_key).toBe(REDACTED);
    expect(out.nested.safe).toBe("keep-me");
  });

  it("scrubDeep terminates on a cyclic object instead of hanging", () => {
    const a: any = { name: "x" };
    a.self = a;
    expect(() => scrubDeep(a)).not.toThrow();
  });

  it("handles null/undefined without producing the string 'undefined'", () => {
    expect(scrubText(null)).toBe("");
    expect(scrubText(undefined)).toBe("");
  });
});
