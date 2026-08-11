// ─────────────────────────────────────────────────────────────────────────────
//  PS-PSA-01 — the report router's classification + ticketing rules, exercised over fake deps so no
//  DB or live PSA is touched. These are the acceptance guarantees:
//    • a valid sim token never creates a ticket (score only)
//    • a non-sim + enabled + mapped connection creates exactly one ticket with the expected fields
//    • a non-sim that is not mapped saves the report and creates NO ticket (honest status)
//    • a PSA API failure saves the report + stores the error and NEVER claims a ticket id
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { routePhishReport, buildTicketBody } from "./reportRouting";
import type { RoutePhishReportDeps, Classification, TicketTarget } from "./reportRouting";
import type { PsaTicketAdapter } from "./types";

function fakeAdapter(over: Partial<PsaTicketAdapter> = {}): PsaTicketAdapter {
  return {
    provider: "connectwise_manage",
    testConnection: vi.fn(async () => ({ ok: true })),
    listCompanies: vi.fn(async () => []),
    createTicket: vi.fn(async () => ({ externalId: "CW-100", url: "https://cw/tickets/100" })),
    ...over,
  };
}

function makeDeps(over: Partial<RoutePhishReportDeps> & { classification: Classification; target?: ReturnType<RoutePhishReportDeps["resolveTicketTarget"]> extends Promise<infer T> ? T : never }): { deps: RoutePhishReportDeps; spies: any } {
  const spies = {
    recordSimReport: vi.fn(async () => {}),
    persistReport: vi.fn(async () => ({ id: 42, deduped: false })),
    resolveTicketTarget: vi.fn(async () => over.target ?? ({ kind: "not_configured", reason: "not configured" } as any)),
    markTicketCreated: vi.fn(async () => {}),
    markTicketError: vi.fn(async () => {}),
  };
  const deps: RoutePhishReportDeps = {
    classify: async () => over.classification,
    recordSimReport: spies.recordSimReport,
    persistReport: over.persistReport ?? spies.persistReport,
    resolveTicketTarget: spies.resolveTicketTarget,
    markTicketCreated: spies.markTicketCreated,
    markTicketError: spies.markTicketError,
  };
  return { deps, spies };
}

const INPUT = {
  token: "tok", subject: "Invoice overdue — pay now", senderDisplay: "Accounts",
  senderAddress: "ap@evil.example", reporterEmail: "user@acme.com", reporterName: "Dana User",
  messageId: "<abc@mail>", source: "outlook-addin",
};

describe("routePhishReport classification", () => {
  it("SIM token → scores only, never creates a ticket", async () => {
    const { deps, spies } = makeDeps({ classification: { classification: "sim", orgId: 1, mspTenantId: 9, simToken: "tok" } });
    const r = await routePhishReport(INPUT, deps);
    expect(spies.persistReport).toHaveBeenCalledTimes(1);
    expect(spies.recordSimReport).toHaveBeenCalledWith("tok");
    expect(spies.resolveTicketTarget).not.toHaveBeenCalled();
    expect(r.ticket).toEqual({ status: "skipped_sim" });
  });

  it("NON-SIM + enabled + mapped → creates exactly one ticket with the expected fields", async () => {
    const createTicket = vi.fn(async () => ({ externalId: "CW-777", url: "https://cw/777" }));
    const target: TicketTarget = { connectionId: 5, provider: "connectwise_manage", externalCompanyId: "250", adapter: fakeAdapter({ createTicket }) };
    const { deps, spies } = makeDeps({
      classification: { classification: "non_sim", orgId: 1, mspTenantId: 9, simToken: null },
      target: { kind: "ready", target },
    });
    const r = await routePhishReport(INPUT, deps);

    expect(createTicket).toHaveBeenCalledTimes(1);
    const arg = createTicket.mock.calls[0][0];
    expect(arg.externalCompanyId).toBe("250");
    expect(arg.summary).toBe("Invoice overdue — pay now");
    expect(arg.body).toContain("user@acme.com");         // reporter
    expect(arg.body).toContain("ap@evil.example");        // sender
    expect(arg.body).toContain("PSA company id: 250");    // scoped, metadata present
    expect(spies.markTicketCreated).toHaveBeenCalledWith(5, 42, "CW-777", "https://cw/777");
    expect(r.ticket).toEqual({ status: "created", provider: "connectwise_manage", externalId: "CW-777", url: "https://cw/777" });
  });

  it("NON-SIM + not mapped → report saved, NO ticket, honest status", async () => {
    const { deps, spies } = makeDeps({
      classification: { classification: "non_sim", orgId: 1, mspTenantId: 9, simToken: null },
      target: { kind: "not_configured", reason: "This organization is not mapped to a PSA company." },
    });
    const r = await routePhishReport(INPUT, deps);
    expect(spies.persistReport).toHaveBeenCalledTimes(1);
    expect(spies.markTicketCreated).not.toHaveBeenCalled();
    expect(r.ticket.status).toBe("not_configured");
    expect((r.ticket as any).detail).toMatch(/not mapped/i);
  });

  it("PSA API failure → report saved, error stored, NEVER a claimed ticket id", async () => {
    const createTicket = vi.fn(async () => { throw new Error("ConnectWise createTicket failed (401): bad key"); });
    const target: TicketTarget = { connectionId: 5, provider: "connectwise_manage", externalCompanyId: "250", adapter: fakeAdapter({ createTicket }) };
    const { deps, spies } = makeDeps({
      classification: { classification: "non_sim", orgId: 1, mspTenantId: 9, simToken: null },
      target: { kind: "ready", target },
    });
    const r = await routePhishReport(INPUT, deps);
    expect(spies.persistReport).toHaveBeenCalledTimes(1);       // report saved despite the failure
    expect(spies.markTicketError).toHaveBeenCalledWith(5, 42, "ConnectWise createTicket failed (401): bad key");
    expect(spies.markTicketCreated).not.toHaveBeenCalled();
    expect(r.ticket.status).toBe("error");
    expect(r.ticket).not.toHaveProperty("externalId");         // no fabricated id
  });

  it("NON-SIM unattributed (no org) → saved, not ticketed, honest status", async () => {
    const { deps, spies } = makeDeps({ classification: { classification: "non_sim", orgId: null, mspTenantId: null, simToken: null } });
    const r = await routePhishReport(INPUT, deps);
    expect(spies.persistReport).toHaveBeenCalledTimes(1);
    expect(spies.resolveTicketTarget).not.toHaveBeenCalled();
    expect(r.ticket.status).toBe("unattributed");
  });

  it("duplicate (idempotency) → no second ticket, status duplicate", async () => {
    const { deps, spies } = makeDeps({
      classification: { classification: "non_sim", orgId: 1, mspTenantId: 9, simToken: null },
      persistReport: vi.fn(async () => ({ id: 42, deduped: true })),
      target: { kind: "ready", target: { connectionId: 5, provider: "connectwise_manage", externalCompanyId: "250", adapter: fakeAdapter() } },
    });
    const r = await routePhishReport(INPUT, deps);
    expect(spies.resolveTicketTarget).not.toHaveBeenCalled();
    expect(r.ticket.status).toBe("duplicate");
  });
});

describe("buildTicketBody", () => {
  it("includes reporter, sender, subject, headers and PhishSim metadata", () => {
    const body = buildTicketBody(
      { ...INPUT, headers: { "Return-Path": "<bounce@evil.example>", "Authentication-Results": "spf=fail" } },
      { orgId: 1, reportId: 42, mspTenantId: 9, externalCompanyId: "250" },
    );
    expect(body).toContain("Dana User");
    expect(body).toContain("Return-Path: <bounce@evil.example>");
    expect(body).toContain("Authentication-Results: spf=fail");
    expect(body).toContain("Report id: 42");
    expect(body).toContain("Classification: non_sim");
  });
});
