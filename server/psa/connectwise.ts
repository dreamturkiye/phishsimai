// ─────────────────────────────────────────────────────────────────────────────
//  PS-PSA-01 — ConnectWise Manage Service Desk adapter.
//
//  Official REST API only: {baseUrl}/v4_6_release/apis/3.0/. Auth is HTTP Basic with the member
//  public/private key pair, username "<companyId>+<publicKey>", plus the required clientId header.
//  Docs: https://developer.connectwise.com/Products/Manage/REST
//
//  Endpoints used:
//    GET  /system/info                          — testConnection (unauthenticated-safe probe of the site)
//    GET  /company/companies?fields=id,name...  — listCompanies (mapping UI)
//    POST /service/tickets                       — createTicket
// ─────────────────────────────────────────────────────────────────────────────
import type {
  PsaTicketAdapter, PsaCreateTicketInput, PsaCompany, PsaTicketResult, PsaTestResult,
  ConnectwiseConfig, ConnectwiseSecret,
} from "./types";

const API_PATH = "/v4_6_release/apis/3.0";
const CW_SUMMARY_MAX = 100; // CW Manage ticket summary hard limit
const DEFAULT_TIMEOUT_MS = 20_000;

export class ConnectwiseAdapter implements PsaTicketAdapter {
  readonly provider = "connectwise_manage" as const;
  constructor(private cfg: ConnectwiseConfig, private secret: ConnectwiseSecret) {}

  private base(): string {
    return this.cfg.baseUrl.replace(/\/+$/, "") + API_PATH;
  }

  private headers(): Record<string, string> {
    const user = `${this.cfg.companyId}+${this.secret.publicKey}`;
    const auth = Buffer.from(`${user}:${this.secret.privateKey}`).toString("base64");
    return {
      Authorization: `Basic ${auth}`,
      clientId: this.secret.clientId,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  private async call(method: string, path: string, body?: unknown): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
    try {
      return await fetch(this.base() + path, {
        method,
        headers: this.headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(): Promise<PsaTestResult> {
    try {
      // /company/companies with a tiny page exercises auth AND the board scope more honestly than
      // /system/info (which some sites serve without auth). A 200 here means the key pair works.
      const res = await this.call("GET", "/company/companies?pageSize=1&fields=id,name");
      if (res.ok) return { ok: true, detail: "Authenticated against ConnectWise Manage." };
      const text = await safeText(res);
      return { ok: false, detail: `ConnectWise returned ${res.status}: ${text}` };
    } catch (e) {
      return { ok: false, detail: `Could not reach ConnectWise: ${(e as Error).message}` };
    }
  }

  async listCompanies(): Promise<PsaCompany[]> {
    const res = await this.call("GET", "/company/companies?pageSize=1000&fields=id,name&orderBy=name");
    if (!res.ok) throw new Error(`ConnectWise listCompanies failed (${res.status}): ${await safeText(res)}`);
    const rows = (await res.json()) as Array<{ id: number; name: string }>;
    return rows.map((r) => ({ id: String(r.id), name: r.name }));
  }

  async createTicket(input: PsaCreateTicketInput): Promise<PsaTicketResult> {
    const payload: Record<string, unknown> = {
      summary: truncate(input.summary || "Reported phishing email", CW_SUMMARY_MAX),
      company: { id: Number(input.externalCompanyId) },
      board: { id: this.cfg.serviceBoardId },
      initialDescription: input.body,
    };
    if (this.cfg.priorityId) payload.priority = { id: this.cfg.priorityId };
    if (this.cfg.ticketType) payload.type = { name: this.cfg.ticketType };

    const res = await this.call("POST", "/service/tickets", payload);
    if (!res.ok) throw new Error(`ConnectWise createTicket failed (${res.status}): ${await safeText(res)}`);
    const ticket = (await res.json()) as { id: number; _info?: { self?: string } };
    if (!ticket?.id) throw new Error("ConnectWise createTicket returned no ticket id");
    return { externalId: String(ticket.id), url: ticket._info?.self };
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

async function safeText(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 500); } catch { return "<no body>"; }
}
