// ─────────────────────────────────────────────────────────────────────────────
//  EXPRESS ERROR MIDDLEWARE — the capture path for errors that escape a route.
//
//  Before this existed, tRPC / auth / tracking / preview routes had NO top-level
//  error handling at all: a throw there produced an unhandled rejection and no bug
//  report. This middleware is what closes that gap, so its behaviour matters.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  bridged: [] as any[],
  captured: [] as any[],
  bridgeThrows: false,
}));

vi.mock("./sentryBridge", () => ({
  captureErrorToBugReport: async (input: any) => {
    if (h.bridgeThrows) throw new Error("bridge exploded");
    h.bridged.push(input);
    return { bugId: "bug-1", fingerprint: "fp", duplicate: false, occurrenceCount: 1, diagnosed: true };
  },
}));

vi.mock("./sentryServer", () => ({
  captureServerError: (err: unknown, ctx: any) => { h.captured.push({ err, ctx }); },
  flushSentry: async () => {},
  isSentryEnabled: () => false,
}));

import { sentryErrorMiddleware } from "./sentryExpress";

function mockRes() {
  const r: any = { statusCode: 200, body: null, headersSent: false };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  return r;
}
const req = (path: string, method = "GET") => ({ path, url: path, method });

beforeEach(() => {
  h.bridged.length = 0;
  h.captured.length = 0;
  h.bridgeThrows = false;
});

describe("server faults (5xx) are captured and bridged", () => {
  it("responds 500 and creates a bug report", async () => {
    const res = mockRes();
    await sentryErrorMiddleware(new Error("kaboom"), req("/api/trpc/orgs.list") as any, res, vi.fn());

    expect(res.statusCode).toBe(500);
    expect(h.captured.length).toBe(1);
    expect(h.bridged.length).toBe(1);
    expect(h.bridged[0].message).toBe("kaboom");
    expect(h.bridged[0].route).toBe("/api/trpc/orgs.list");
  });

  it("never echoes the raw error back to the client (it may carry PII)", async () => {
    const res = mockRes();
    await sentryErrorMiddleware(
      new Error("db failed for kaanari@mac.com"),
      req("/api/trpc/x") as any, res, vi.fn(),
    );

    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/kaanari@mac\.com/);
    expect(body).not.toMatch(/db failed/);
    expect(res.body.error).toBe("Internal Server Error");
  });

  it("strips the query string from the recorded route", async () => {
    const res = mockRes();
    await sentryErrorMiddleware(
      new Error("x"), req("/api/track?email=a@b.com&token=abc123def") as any, res, vi.fn(),
    );
    expect(h.bridged[0].route).toBe("/api/track");
  });
});

describe("client faults (4xx) are NOT treated as production bugs", () => {
  it("a 404 is not bridged and not captured", async () => {
    const res = mockRes();
    const err: any = new Error("not found");
    err.status = 404;

    await sentryErrorMiddleware(err, req("/api/x") as any, res, vi.fn());

    expect(res.statusCode).toBe(404);
    expect(h.bridged).toEqual([]);
    expect(h.captured).toEqual([]);
  });

  it("a 400 is not bridged", async () => {
    const res = mockRes();
    const err: any = new Error("bad request");
    err.statusCode = 400;
    await sentryErrorMiddleware(err, req("/api/x") as any, res, vi.fn());
    expect(h.bridged).toEqual([]);
  });
});

describe("recursion guard", () => {
  it("an error in /api/os/bug-report does NOT bridge back into a bug report", async () => {
    const res = mockRes();
    await sentryErrorMiddleware(new Error("boom"), req("/api/os/bug-report", "POST") as any, res, vi.fn());

    expect(h.bridged).toEqual([]); // would otherwise be an infinite loop
    expect(h.captured.length).toBe(1); // still goes to Sentry
    expect(res.statusCode).toBe(500);
  });

  it("an error in /api/os/architect/* does NOT bridge (Marcus's own path)", async () => {
    const res = mockRes();
    await sentryErrorMiddleware(new Error("boom"), req("/api/os/architect/code", "POST") as any, res, vi.fn());
    expect(h.bridged).toEqual([]);
  });
});

describe("the middleware itself is fail-safe", () => {
  it("still returns 500 when the bridge throws", async () => {
    h.bridgeThrows = true;
    const res = mockRes();

    await sentryErrorMiddleware(new Error("boom"), req("/api/trpc/x") as any, res, vi.fn());

    expect(res.statusCode).toBe(500); // capture failure is not the caller's problem
    expect(res.body.error).toBe("Internal Server Error");
  });

  it("delegates to Express when headers were already sent", async () => {
    const res = mockRes();
    res.headersSent = true;
    const next = vi.fn();

    await sentryErrorMiddleware(new Error("boom"), req("/api/x") as any, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(h.bridged).toEqual([]);
  });

  it("handles a non-Error throw (a bare string)", async () => {
    const res = mockRes();
    await sentryErrorMiddleware("just a string" as any, req("/api/x") as any, res, vi.fn());
    expect(res.statusCode).toBe(500);
    expect(h.bridged[0].message).toBe("just a string");
  });
});
