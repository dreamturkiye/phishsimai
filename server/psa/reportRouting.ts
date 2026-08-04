// ─────────────────────────────────────────────────────────────────────────────
//  PS-PSA-01 — the report router. This is the architecture the epic mandates, as pure orchestration
//  over an injectable deps interface so the classification/ticketing rules are testable without a
//  DB or a live PSA:
//
//     report ──► persist row (ALWAYS)
//            ├─ valid sim token? ──YES──► score only (trackEvent), NO ticket
//            NO (non-sim)
//            ├─ org attributed?         ──NO──► saved, unattributed (admin can still see it)
//            ├─ connection enabled+mapped? ──NO──► saved, "PSA not configured" (honest)
//            └─ YES ──► adapter.createTicket ──► success: store ticket id · failure: store error
//
//  HONESTY: the end user always gets a truthful "report received" (the row is saved). We NEVER
//  surface a ticket id that the PSA did not return, and a create failure is stored verbatim for the
//  MSP admin — the report is never dropped because the PSA was down.
// ─────────────────────────────────────────────────────────────────────────────
import type { PsaProvider, PsaTicketAdapter } from "./types";

export interface RawPhishReportInput {
  token?: string | null;          // tracking token if the add-in found one in the message
  subject?: string | null;
  senderDisplay?: string | null;
  senderAddress?: string | null;
  reporterEmail?: string | null;
  reporterName?: string | null;
  receivedAt?: Date | null;
  bodyExcerpt?: string | null;
  headers?: Record<string, string> | null;
  messageId?: string | null;
  source?: string | null;         // 'outlook-addin' | 'api'
}

export interface Classification {
  classification: "sim" | "non_sim";
  orgId: number | null;
  mspTenantId: number | null;
  simToken: string | null;
}

export interface TicketTarget {
  connectionId: number;
  provider: PsaProvider;
  externalCompanyId: string;
  adapter: PsaTicketAdapter;
}

export interface PersistedRow {
  id: number;
  deduped: boolean;
}

export interface RoutePhishReportDeps {
  /** Authoritative, server-side: a report is a sim iff its token maps to a real campaign_results row. */
  classify(input: RawPhishReportInput): Promise<Classification>;
  /** Record the sim report event (trackEvent → reportedAt). Only called for sims. */
  recordSimReport(token: string): Promise<void>;
  /** Persist the report row FIRST, always. Idempotent on the idempotency key (deduped=true on repeat). */
  persistReport(row: PersistReportRow): Promise<PersistedRow>;
  /** Resolve an enabled+mapped PSA target for this org, or an honest reason it is not configured. */
  resolveTicketTarget(orgId: number): Promise<{ kind: "ready"; target: TicketTarget } | { kind: "not_configured"; reason: string }>;
  markTicketCreated(connectionId: number, reportId: number, ticketId: string, url: string | undefined): Promise<void>;
  markTicketError(connectionId: number, reportId: number, error: string): Promise<void>;
}

export interface PersistReportRow {
  orgId: number | null;
  mspTenantId: number | null;
  classification: "sim" | "non_sim";
  simToken: string | null;
  reporterEmail: string | null;
  reporterName: string | null;
  subject: string | null;
  senderDisplay: string | null;
  senderAddress: string | null;
  receivedAt: Date | null;
  bodyExcerpt: string | null;
  headers: Record<string, string> | null;
  source: string;
  idempotencyKey: string | null;
}

export type TicketOutcome =
  | { status: "skipped_sim" }
  | { status: "duplicate" }
  | { status: "unattributed"; detail: string }
  | { status: "not_configured"; detail: string }
  | { status: "created"; provider: PsaProvider; externalId: string; url?: string }
  | { status: "error"; detail: string };

export interface RoutePhishReportResult {
  ok: boolean;
  reportId: number;
  classification: "sim" | "non_sim";
  ticket: TicketOutcome;
}

const EXCERPT_CAP = 4_000; // characters persisted; the raw MIME size cap is enforced at the edge

/** Build the human-readable ticket body from the report + PhishSim metadata. Exported for tests. */
export function buildTicketBody(input: RawPhishReportInput, meta: { orgId: number | null; reportId: number; mspTenantId: number | null; externalCompanyId: string }): string {
  const lines: string[] = [];
  lines.push("A user reported a suspicious (non-simulation) email via PhishSim AI.");
  lines.push("");
  lines.push(`Reporter: ${input.reporterName ? `${input.reporterName} <${input.reporterEmail ?? "unknown"}>` : input.reporterEmail ?? "unknown"}`);
  lines.push(`Sender:   ${input.senderDisplay ? `${input.senderDisplay} ` : ""}${input.senderAddress ? `<${input.senderAddress}>` : ""}`.trim());
  lines.push(`Subject:  ${input.subject ?? "(none)"}`);
  if (input.receivedAt) lines.push(`Received: ${input.receivedAt.toISOString()}`);
  if (input.messageId) lines.push(`Message-ID: ${input.messageId}`);
  if (input.headers && Object.keys(input.headers).length) {
    lines.push("");
    lines.push("Key headers:");
    for (const [k, v] of Object.entries(input.headers)) lines.push(`  ${k}: ${v}`);
  }
  if (input.bodyExcerpt) {
    lines.push("");
    lines.push("Body excerpt:");
    lines.push(input.bodyExcerpt.slice(0, EXCERPT_CAP));
  }
  lines.push("");
  lines.push("— PhishSim metadata —");
  lines.push(`Classification: non_sim`);
  lines.push(`PhishSim org id: ${meta.orgId ?? "unknown"}`);
  lines.push(`MSP tenant id: ${meta.mspTenantId ?? "unknown"}`);
  lines.push(`Report id: ${meta.reportId}`);
  lines.push(`PSA company id: ${meta.externalCompanyId}`);
  // Link back to the admin report detail. TODO(PS-PSA-UI): once an admin report-detail route exists,
  // replace with the deep link. Kept as a stable, honest reference until then.
  lines.push(`PhishSim report: report #${meta.reportId} (admin detail route pending)`);
  return lines.join("\n");
}

function buildPersistRow(input: RawPhishReportInput, c: Classification, idempotencyKey: string | null): PersistReportRow {
  return {
    orgId: c.orgId,
    mspTenantId: c.mspTenantId,
    classification: c.classification,
    simToken: c.simToken,
    reporterEmail: input.reporterEmail ?? null,
    reporterName: input.reporterName ?? null,
    subject: input.subject ?? null,
    senderDisplay: input.senderDisplay ?? null,
    senderAddress: input.senderAddress ?? null,
    receivedAt: input.receivedAt ?? null,
    bodyExcerpt: input.bodyExcerpt ? input.bodyExcerpt.slice(0, EXCERPT_CAP) : null,
    headers: input.headers ?? null,
    source: input.source ?? "api",
    idempotencyKey,
  };
}

/** Deterministic idempotency key from message id + reporter + org. Null when there's nothing stable. */
export function idempotencyKeyFor(input: RawPhishReportInput, orgId: number | null): string | null {
  if (!input.messageId) return null;
  return [input.messageId, input.reporterEmail ?? "", orgId ?? ""].join("|").slice(0, 512);
}

export async function routePhishReport(input: RawPhishReportInput, deps: RoutePhishReportDeps): Promise<RoutePhishReportResult> {
  const c = await deps.classify(input);
  const idempotencyKey = idempotencyKeyFor(input, c.orgId);
  const { id: reportId, deduped } = await deps.persistReport(buildPersistRow(input, c, idempotencyKey));

  if (deduped) {
    return { ok: true, reportId, classification: c.classification, ticket: { status: "duplicate" } };
  }

  // Simulation → score only, never a ticket.
  if (c.classification === "sim") {
    if (c.simToken) await deps.recordSimReport(c.simToken);
    return { ok: true, reportId, classification: "sim", ticket: { status: "skipped_sim" } };
  }

  // Non-sim, but we could not attribute it to an org — saved, not ticketable yet.
  if (c.orgId == null) {
    return {
      ok: true, reportId, classification: "non_sim",
      ticket: { status: "unattributed", detail: "Report saved but could not be attributed to an organization (no verified-domain match). No ticket created." },
    };
  }

  const resolved = await deps.resolveTicketTarget(c.orgId);
  if (resolved.kind === "not_configured") {
    return { ok: true, reportId, classification: "non_sim", ticket: { status: "not_configured", detail: resolved.reason } };
  }

  const { target } = resolved;
  try {
    const result = await target.adapter.createTicket({
      externalCompanyId: target.externalCompanyId,
      summary: input.subject?.trim() || "Reported phishing email",
      body: buildTicketBody(input, { orgId: c.orgId, reportId, mspTenantId: c.mspTenantId, externalCompanyId: target.externalCompanyId }),
      reporterEmail: input.reporterEmail ?? null,
      reporterName: input.reporterName ?? null,
    });
    await deps.markTicketCreated(target.connectionId, reportId, result.externalId, result.url);
    return { ok: true, reportId, classification: "non_sim", ticket: { status: "created", provider: target.provider, externalId: result.externalId, url: result.url } };
  } catch (e) {
    const detail = (e as Error).message || "PSA ticket create failed";
    await deps.markTicketError(target.connectionId, reportId, detail);
    // The report is already saved. We return ok:true (the report was accepted) but with an honest
    // error status — never a fabricated ticket id.
    return { ok: true, reportId, classification: "non_sim", ticket: { status: "error", detail } };
  }
}
