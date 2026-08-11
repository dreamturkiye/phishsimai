// ─────────────────────────────────────────────────────────────────────────────
//  PS-PSA-01 — simulation-only go-live acceptance. This is the sandbox smoke test done with mocks:
//  the REAL ConnectWise and Halo adapters are wired THROUGH routePhishReport, with global fetch
//  mocked at the network boundary (no traffic to *.myconnectwise.net or *.halopsa.com). It proves,
//  end to end, that a non-sim report drives exactly one createTicket, stores the real-shaped
//  { externalId, url } the provider returned, and NEVER stores/returns a fabricated id on failure —
//  the same acceptance rules a live sandbox run would check.
//
//  Rules 1 (sim → no ticket), 4 (unmapped → honest), 5 (failure → no id) at the router level, 6
//  (authz) and 7 (crypto) are covered in reportRouting/authz/crypto tests; this file closes 2 and 3
//  with the real adapters in the loop and prints the full pass/fail table (the optional dry-run).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { routePhishReport } from "./reportRouting";
import type { RoutePhishReportDeps } from "./reportRouting";
import { buildAdapterFromPlain } from "./index";
import type { ConnectwiseConfig, ConnectwiseSecret, HaloConfig, HaloSecret } from "./types";

// Sandbox-shaped but entirely fake — never real tenants, never logged as secrets.
const CW_CFG: ConnectwiseConfig = { baseUrl: "https://api-na.myconnectwise.net", companyId: "sandbox", serviceBoardId: 12, priorityId: 3, ticketType: "Phishing" };
const CW_SECRET: ConnectwiseSecret = { publicKey: "PUB", privateKey: "PRIV", clientId: "CID" };
const HALO_CFG: HaloConfig = { baseUrl: "https://sandbox.halopsa.com", ticketTypeId: 21, teamId: 4 };
const HALO_SECRET: HaloSecret = { clientId: "HCID", clientSecret: "HSECRET" };

const NON_SIM_INPUT = {
  subject: "Payroll update required", senderDisplay: "HR", senderAddress: "hr@evil.example",
  reporterEmail: "user@testorg.example", reporterName: "Test User", messageId: "<e2e@mail>", source: "outlook-addin",
};
const SIM_INPUT = { ...NON_SIM_INPUT, token: "sim-tracking-token-abcdef123456" };

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

// Deps whose resolveTicketTarget hands back a REAL adapter; persist/record are spied.
function depsWith(target: any, classification?: any): { deps: RoutePhishReportDeps; spies: any } {
  const spies = {
    recordSimReport: vi.fn(async () => {}),
    persistReport: vi.fn(async () => ({ id: 77, deduped: false })),
    resolveTicketTarget: vi.fn(async () => target),
    markTicketCreated: vi.fn(async () => {}),
    markTicketError: vi.fn(async () => {}),
  };
  const deps: RoutePhishReportDeps = {
    classify: async () => classification ?? { classification: "non_sim", orgId: 1, mspTenantId: 9, simToken: null },
    recordSimReport: spies.recordSimReport,
    persistReport: spies.persistReport,
    resolveTicketTarget: spies.resolveTicketTarget,
    markTicketCreated: spies.markTicketCreated,
    markTicketError: spies.markTicketError,
  };
  return { deps, spies };
}

const results: Array<{ rule: string; scenario: string; pass: boolean }> = [];
function record(rule: string, scenario: string, fn: () => void) {
  let pass = false;
  try { fn(); pass = true; } finally { results.push({ rule, scenario, pass }); }
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

function cwTarget() {
  return { kind: "ready", target: { connectionId: 5, provider: "connectwise_manage", externalCompanyId: "250", adapter: buildAdapterFromPlain("connectwise_manage", CW_CFG, CW_SECRET) } };
}
function haloTarget() {
  return { kind: "ready", target: { connectionId: 8, provider: "halo", externalCompanyId: "77", adapter: buildAdapterFromPlain("halo", HALO_CFG, HALO_SECRET) } };
}

describe("E2E: ConnectWise adapter through the router (mocked fetch)", () => {
  it("non-sim → exactly one createTicket → real { externalId, url } stored on the report", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 5001, _info: { self: "https://api-na.myconnectwise.net/tickets/5001" } }, true, 201));
    const { deps, spies } = depsWith(cwTarget());
    const r = await routePhishReport(NON_SIM_INPUT, deps);

    const ticketPosts = fetchMock.mock.calls.filter(([u, i]) => String(u).endsWith("/service/tickets") && i?.method === "POST");
    record("2-CW", "exactly one createTicket", () => expect(ticketPosts).toHaveLength(1));
    record("2-CW", "real externalId+url stored on report", () =>
      expect(spies.markTicketCreated).toHaveBeenCalledWith(5, 77, "5001", "https://api-na.myconnectwise.net/tickets/5001"));
    record("2-CW", "no error path taken", () => expect(spies.markTicketError).not.toHaveBeenCalled());
    expect(r.ticket).toEqual({ status: "created", provider: "connectwise_manage", externalId: "5001", url: "https://api-na.myconnectwise.net/tickets/5001" });
  });

  it("non-sim + CW 401 → report saved, error stored, NO fabricated id", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: "Unauthorized" }, false, 401));
    const { deps, spies } = depsWith(cwTarget());
    const r = await routePhishReport(NON_SIM_INPUT, deps);

    record("5-CW", "report persisted despite failure", () => expect(spies.persistReport).toHaveBeenCalledTimes(1));
    record("5-CW", "error stored", () => expect(spies.markTicketError).toHaveBeenCalledWith(5, 77, expect.stringMatching(/401/)));
    record("5-CW", "no ticket id claimed", () => { expect(spies.markTicketCreated).not.toHaveBeenCalled(); expect(r.ticket).not.toHaveProperty("externalId"); });
    expect(r.ticket.status).toBe("error");
  });
});

describe("E2E: Halo adapter through the router (mocked fetch)", () => {
  it("non-sim → token exchange + exactly one createTicket → real { externalId, url } stored", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: "TKN" }));           // POST /auth/token
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 9001 }], true, 201));          // POST /api/Tickets
    const { deps, spies } = depsWith(haloTarget());
    const r = await routePhishReport(NON_SIM_INPUT, deps);

    const ticketPosts = fetchMock.mock.calls.filter(([u, i]) => String(u).endsWith("/api/Tickets") && i?.method === "POST");
    record("3-Halo", "exactly one createTicket", () => expect(ticketPosts).toHaveLength(1));
    record("3-Halo", "real externalId+url stored on report", () =>
      expect(spies.markTicketCreated).toHaveBeenCalledWith(8, 77, "9001", "https://sandbox.halopsa.com/tickets?id=9001"));
    record("3-Halo", "no error path taken", () => expect(spies.markTicketError).not.toHaveBeenCalled());
    expect(r.ticket).toEqual({ status: "created", provider: "halo", externalId: "9001", url: "https://sandbox.halopsa.com/tickets?id=9001" });
  });

  it("non-sim + Halo 400 → report saved, error stored, NO fabricated id", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: "TKN" }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "bad" }, false, 400));
    const { deps, spies } = depsWith(haloTarget());
    const r = await routePhishReport(NON_SIM_INPUT, deps);

    record("5-Halo", "report persisted despite failure", () => expect(spies.persistReport).toHaveBeenCalledTimes(1));
    record("5-Halo", "error stored", () => expect(spies.markTicketError).toHaveBeenCalledWith(8, 77, expect.stringMatching(/400/)));
    record("5-Halo", "no ticket id claimed", () => { expect(spies.markTicketCreated).not.toHaveBeenCalled(); expect(r.ticket).not.toHaveProperty("externalId"); });
    expect(r.ticket.status).toBe("error");
  });
});

describe("E2E: a SIM report never reaches either adapter", () => {
  it("valid sim token → scored, no fetch to any PSA, no createTicket", async () => {
    const { deps, spies } = depsWith(cwTarget(), { classification: "sim", orgId: 1, mspTenantId: 9, simToken: SIM_INPUT.token });
    const r = await routePhishReport(SIM_INPUT, deps);
    record("1", "sim scored (recordSimReport)", () => expect(spies.recordSimReport).toHaveBeenCalledWith(SIM_INPUT.token));
    record("1", "adapter never resolved", () => expect(spies.resolveTicketTarget).not.toHaveBeenCalled());
    record("1", "zero PSA fetches", () => expect(fetchMock).not.toHaveBeenCalled());
    expect(r.ticket).toEqual({ status: "skipped_sim" });
  });
});

// Optional dry-run: a compact pass/fail table for the go-live record (no external HTTP).
afterAll(() => {
  const width = Math.max(...results.map((r) => r.scenario.length), 10);
  const lines = results.map((r) => `  [${r.pass ? "PASS" : "FAIL"}] ${r.rule.padEnd(8)} ${r.scenario.padEnd(width)}`);
  // eslint-disable-next-line no-console
  console.log(["", "PSA simulation smoke — acceptance table", "─".repeat(40), ...lines, "─".repeat(40),
    `  ${results.filter((r) => r.pass).length}/${results.length} checks passed`, ""].join("\n"));
});
