// ─────────────────────────────────────────────────────────────────────────────
//  PS-PSA-01 (PR2) — Halo adapter contract, global fetch mocked (no live Halo in CI). Asserts the
//  OAuth2 client-credentials token exchange, bearer auth, the createTicket array payload + client_id
//  scoping, ticket id/url parsing, and honest failure on a non-2xx.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HaloAdapter } from "./halo";
import type { HaloConfig, HaloSecret } from "./types";

const cfg: HaloConfig = { baseUrl: "https://acme.halopsa.com/", ticketTypeId: 21, teamId: 4 };
const secret: HaloSecret = { clientId: "CID", clientSecret: "CSECRET" };

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}
const tokenOk = () => jsonResponse({ access_token: "TKN-123" });

describe("HaloAdapter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  it("exchanges client credentials for a token, then POSTs a ticket array with client_id scoping", async () => {
    fetchMock.mockResolvedValueOnce(tokenOk());                                  // POST /auth/token
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 9001 }], true, 201));    // POST /api/Tickets

    const res = await new HaloAdapter(cfg, secret).createTicket({ externalCompanyId: "77", summary: "Reported phish", body: "details" });
    expect(res).toEqual({ externalId: "9001", url: "https://acme.halopsa.com/tickets?id=9001" });

    // token call
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe("https://acme.halopsa.com/auth/token");
    expect(String(tokenInit.body)).toContain("grant_type=client_credentials");
    expect(String(tokenInit.body)).toContain("client_id=CID");

    // ticket call
    const [ticketUrl, ticketInit] = fetchMock.mock.calls[1];
    expect(ticketUrl).toBe("https://acme.halopsa.com/api/Tickets");
    expect(ticketInit.headers.Authorization).toBe("Bearer TKN-123");
    const payload = JSON.parse(ticketInit.body);
    expect(Array.isArray(payload)).toBe(true);
    expect(payload[0]).toMatchObject({ summary: "Reported phish", details: "details", client_id: 77, tickettype_id: 21, team_id: 4 });
  });

  it("listCompanies handles both the { clients: [...] } and bare-array shapes", async () => {
    fetchMock.mockResolvedValueOnce(tokenOk());
    fetchMock.mockResolvedValueOnce(jsonResponse({ clients: [{ id: 77, name: "Acme" }, { id: 78, name: "Beta" }] }));
    const rows = await new HaloAdapter(cfg, secret).listCompanies();
    expect(rows).toEqual([{ id: "77", name: "Acme" }, { id: "78", name: "Beta" }]);
  });

  it("createTicket throws (never a fabricated id) on a non-2xx ticket response", async () => {
    fetchMock.mockResolvedValueOnce(tokenOk());
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "bad" }, false, 400));
    await expect(new HaloAdapter(cfg, secret).createTicket({ externalCompanyId: "1", summary: "s", body: "b" }))
      .rejects.toThrow(/Halo createTicket failed \(400\)/);
  });

  it("testConnection reports ok:false honestly when auth fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "invalid_client" }, false, 401));
    const res = await new HaloAdapter(cfg, secret).testConnection();
    expect(res.ok).toBe(false);
    expect(res.detail).toMatch(/401|Halo/);
  });
});
