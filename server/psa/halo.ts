// ─────────────────────────────────────────────────────────────────────────────
//  PS-PSA-01 (PR2) — Halo PSA adapter. Cloud tenants only (on-prem is unsupported and documented).
//
//  Auth is OAuth2 client-credentials: POST {baseUrl}/auth/token (form-encoded) → bearer token, then
//  the REST API under {baseUrl}/api. Docs: https://halopsa.com/apidoc/. In Halo a customer company
//  is a "Client" and POST /api/Tickets takes an ARRAY of ticket objects.
//
//  Endpoints used:
//    POST {baseUrl}/auth/token          — client-credentials token
//    GET  /api/Client?count=...         — testConnection / listCompanies (Clients)
//    POST /api/Tickets                   — createTicket (body is a one-element array)
// ─────────────────────────────────────────────────────────────────────────────
import type {
  PsaTicketAdapter, PsaCreateTicketInput, PsaCompany, PsaTicketResult, PsaTestResult,
  HaloConfig, HaloSecret,
} from "./types";

const DEFAULT_TIMEOUT_MS = 20_000;

export class HaloAdapter implements PsaTicketAdapter {
  readonly provider = "halo" as const;
  constructor(private cfg: HaloConfig, private secret: HaloSecret) {}

  private base(): string {
    return this.cfg.baseUrl.replace(/\/+$/, "");
  }

  private async token(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.secret.clientId,
      client_secret: this.secret.clientSecret,
      scope: "all",
    });
    const res = await withTimeout((signal) =>
      fetch(this.base() + "/auth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal }));
    if (!res.ok) throw new Error(`Halo auth failed (${res.status}): ${await safeText(res)}`);
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) throw new Error("Halo auth returned no access_token");
    return json.access_token;
  }

  private async api(method: string, path: string, token: string, body?: unknown): Promise<Response> {
    return withTimeout((signal) =>
      fetch(this.base() + "/api" + path, {
        method,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      }));
  }

  async testConnection(): Promise<PsaTestResult> {
    try {
      const token = await this.token();
      const res = await this.api("GET", "/Client?count=1", token);
      if (res.ok) return { ok: true, detail: "Authenticated against Halo PSA." };
      return { ok: false, detail: `Halo returned ${res.status}: ${await safeText(res)}` };
    } catch (e) {
      return { ok: false, detail: `Could not reach Halo: ${(e as Error).message}` };
    }
  }

  async listCompanies(): Promise<PsaCompany[]> {
    const token = await this.token();
    const res = await this.api("GET", "/Client?count=1000", token);
    if (!res.ok) throw new Error(`Halo listCompanies failed (${res.status}): ${await safeText(res)}`);
    const json = (await res.json()) as unknown;
    // Halo returns either { clients: [...] } or a bare array depending on the endpoint/version.
    const rows: Array<{ id: number; name: string }> = Array.isArray(json)
      ? (json as any)
      : ((json as any)?.clients ?? []);
    return rows.map((r) => ({ id: String(r.id), name: r.name }));
  }

  async createTicket(input: PsaCreateTicketInput): Promise<PsaTicketResult> {
    const token = await this.token();
    const ticket: Record<string, unknown> = {
      summary: input.summary || "Reported phishing email",
      details: input.body,
      client_id: Number(input.externalCompanyId),
    };
    if (this.cfg.ticketTypeId) ticket.tickettype_id = this.cfg.ticketTypeId;
    if (this.cfg.teamId) ticket.team_id = this.cfg.teamId;

    // POST /api/Tickets expects an array of tickets.
    const res = await this.api("POST", "/Tickets", token, [ticket]);
    if (!res.ok) throw new Error(`Halo createTicket failed (${res.status}): ${await safeText(res)}`);
    const json = (await res.json()) as unknown;
    const created = (Array.isArray(json) ? (json as any)[0] : json) as { id?: number };
    if (!created?.id) throw new Error("Halo createTicket returned no ticket id");
    return { externalId: String(created.id), url: `${this.base()}/tickets?id=${created.id}` };
  }
}

async function withTimeout(fn: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  try { return await fn(ctrl.signal); } finally { clearTimeout(timer); }
}

async function safeText(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 500); } catch { return "<no body>"; }
}
