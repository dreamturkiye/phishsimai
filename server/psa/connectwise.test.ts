// ─────────────────────────────────────────────────────────────────────────────
//  PS-PSA-01 — ConnectWise Manage adapter contract, with global fetch mocked (no live CW in CI).
//  Asserts the REST endpoint, HTTP Basic auth (companyId+publicKey / privateKey), the clientId
//  header, the createTicket payload shape, and the summary length cap.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectwiseAdapter } from "./connectwise";
import type { ConnectwiseConfig, ConnectwiseSecret } from "./types";

const cfg: ConnectwiseConfig = {
  baseUrl: "https://api-na.myconnectwise.net/",
  companyId: "acme",
  serviceBoardId: 12,
  priorityId: 3,
  ticketType: "Phishing",
};
const secret: ConnectwiseSecret = { publicKey: "PUB", privateKey: "PRIV", clientId: "CID-123" };

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

describe("ConnectwiseAdapter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("createTicket POSTs the expected payload to the Service Desk endpoint", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 5001, _info: { self: "https://cw/tickets/5001" } }, true, 201));
    const adapter = new ConnectwiseAdapter(cfg, secret);
    const res = await adapter.createTicket({ externalCompanyId: "250", summary: "Reported phish", body: "details", reporterEmail: "u@acme.com" });

    expect(res).toEqual({ externalId: "5001", url: "https://cw/tickets/5001" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api-na.myconnectwise.net/v4_6_release/apis/3.0/service/tickets");
    expect(init.method).toBe("POST");
    const payload = JSON.parse(init.body);
    expect(payload).toMatchObject({
      summary: "Reported phish",
      company: { id: 250 },
      board: { id: 12 },
      initialDescription: "details",
      priority: { id: 3 },
      type: { name: "Phishing" },
    });
  });

  it("uses HTTP Basic auth with companyId+publicKey and sends the clientId header", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1 }, true, 201));
    await new ConnectwiseAdapter(cfg, secret).createTicket({ externalCompanyId: "1", summary: "s", body: "b" });
    const init = fetchMock.mock.calls[0][1];
    const expected = "Basic " + Buffer.from("acme+PUB:PRIV").toString("base64");
    expect(init.headers.Authorization).toBe(expected);
    expect(init.headers.clientId).toBe("CID-123");
  });

  it("truncates the summary to the CW 100-char limit", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 2 }, true, 201));
    const long = "x".repeat(200);
    await new ConnectwiseAdapter(cfg, secret).createTicket({ externalCompanyId: "1", summary: long, body: "b" });
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.summary.length).toBe(100);
  });

  it("createTicket throws (never a fabricated id) on a non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: "Unauthorized" }, false, 401));
    await expect(new ConnectwiseAdapter(cfg, secret).createTicket({ externalCompanyId: "1", summary: "s", body: "b" }))
      .rejects.toThrow(/401/);
  });

  it("listCompanies maps id/name for the mapping UI", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 250, name: "Acme Co" }, { id: 251, name: "Beta LLC" }]));
    const rows = await new ConnectwiseAdapter(cfg, secret).listCompanies();
    expect(rows).toEqual([{ id: "250", name: "Acme Co" }, { id: "251", name: "Beta LLC" }]);
  });

  it("testConnection reports ok:false honestly on an auth failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: "Unauthorized" }, false, 401));
    const res = await new ConnectwiseAdapter(cfg, secret).testConnection();
    expect(res.ok).toBe(false);
    expect(res.detail).toMatch(/401/);
  });
});
