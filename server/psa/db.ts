// ─────────────────────────────────────────────────────────────────────────────
//  PS-PSA-01 — DB-backed PSA helpers: connection/mapping CRUD for the admin router, and the live
//  RoutePhishReportDeps implementation. All queries are partner-scoped (mspTenantId) so there is no
//  cross-tenant leakage.
// ─────────────────────────────────────────────────────────────────────────────
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  psaConnections, psaCompanyMappings, phishReports, campaignResults, orgVerifiedDomains, mspCustomerOrgs,
  type PsaConnection, type PsaCompanyMapping,
} from "../../drizzle/schema";
import { buildAdapter } from "./index";
import type {
  RoutePhishReportDeps, Classification, PersistReportRow, PersistedRow, RawPhishReportInput, TicketTarget,
} from "./reportRouting";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

function emailDomain(email?: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).trim().toLowerCase() || null;
}

/** The MSP tenant that manages this org, if any. */
export async function resolveMspForOrg(orgId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({ mspTenantId: mspCustomerOrgs.mspTenantId })
    .from(mspCustomerOrgs).where(eq(mspCustomerOrgs.orgId, orgId)).limit(1);
  return row?.mspTenantId ?? null;
}

// ─── Connection CRUD (all callers pass the caller's own mspTenantId — never client input) ────────

export async function getConnections(mspTenantId: number): Promise<PsaConnection[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(psaConnections).where(eq(psaConnections.mspTenantId, mspTenantId));
}

export async function getConnection(mspTenantId: number, provider: PsaConnection["provider"]): Promise<PsaConnection | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(psaConnections)
    .where(and(eq(psaConnections.mspTenantId, mspTenantId), eq(psaConnections.provider, provider))).limit(1);
  return row;
}

export async function upsertConnection(input: {
  mspTenantId: number;
  provider: PsaConnection["provider"];
  enabled: boolean;
  config: unknown;
  secretEnc?: string | null;   // only set when new credentials were supplied
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await getConnection(input.mspTenantId, input.provider);
  if (existing) {
    await db.update(psaConnections).set({
      enabled: input.enabled,
      config: input.config as any,
      // Keep the stored secret if none was supplied this time (editing config without re-entering keys).
      ...(input.secretEnc !== undefined && input.secretEnc !== null ? { secretEnc: input.secretEnc } : {}),
    }).where(eq(psaConnections.id, existing.id));
  } else {
    await db.insert(psaConnections).values({
      mspTenantId: input.mspTenantId,
      provider: input.provider,
      enabled: input.enabled,
      config: input.config as any,
      secretEnc: input.secretEnc ?? null,
    });
  }
}

export async function recordConnectionTest(connectionId: number, ok: boolean, detail: string | undefined): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(psaConnections).set({
    lastTestOk: ok, lastTestAt: new Date(), lastError: ok ? null : (detail ?? "Connection test failed"),
  }).where(eq(psaConnections.id, connectionId));
}

// ─── Mapping CRUD ────────────────────────────────────────────────────────────────────────────

export async function getMappings(mspTenantId: number): Promise<PsaCompanyMapping[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(psaCompanyMappings)
    .where(eq(psaCompanyMappings.mspTenantId, mspTenantId)).orderBy(desc(psaCompanyMappings.updatedAt));
}

/** Upsert a mapping. AUTHZ: the connection must belong to the caller's MSP, and the org must be a
 *  customer of that same MSP — enforced here so a partner can never map another partner's org. */
export async function upsertMapping(input: {
  mspTenantId: number;
  connectionId: number;
  orgId: number;
  externalCompanyId: string;
  externalCompanyName?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // The connection must be owned by this MSP.
  const [conn] = await db.select().from(psaConnections)
    .where(and(eq(psaConnections.id, input.connectionId), eq(psaConnections.mspTenantId, input.mspTenantId))).limit(1);
  if (!conn) throw new Error("Connection not found for this MSP");
  // The org must be a customer of this MSP.
  const [customer] = await db.select().from(mspCustomerOrgs)
    .where(and(eq(mspCustomerOrgs.orgId, input.orgId), eq(mspCustomerOrgs.mspTenantId, input.mspTenantId))).limit(1);
  if (!customer) throw new Error("Organization is not a customer of this MSP");

  const [existing] = await db.select().from(psaCompanyMappings)
    .where(and(eq(psaCompanyMappings.connectionId, input.connectionId), eq(psaCompanyMappings.orgId, input.orgId))).limit(1);
  if (existing) {
    await db.update(psaCompanyMappings).set({
      externalCompanyId: input.externalCompanyId,
      externalCompanyName: input.externalCompanyName ?? null,
    }).where(eq(psaCompanyMappings.id, existing.id));
  } else {
    await db.insert(psaCompanyMappings).values({
      connectionId: input.connectionId,
      mspTenantId: input.mspTenantId,
      orgId: input.orgId,
      externalCompanyId: input.externalCompanyId,
      externalCompanyName: input.externalCompanyName ?? null,
    });
  }
}

export async function deleteMapping(mspTenantId: number, mappingId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(psaCompanyMappings)
    .where(and(eq(psaCompanyMappings.id, mappingId), eq(psaCompanyMappings.mspTenantId, mspTenantId)));
}

// ─── Live report deps ────────────────────────────────────────────────────────────────────────

export function liveReportDeps(): RoutePhishReportDeps {
  return {
    async classify(input: RawPhishReportInput): Promise<Classification> {
      const db = await getDb();
      const token = input.token?.trim();
      // Sim iff the token maps to a real campaign_results row — server-authoritative, never trusts
      // the client's claim.
      if (db && token && TOKEN_RE.test(token)) {
        const [res] = await db.select({ orgId: campaignResults.orgId })
          .from(campaignResults).where(eq(campaignResults.trackingToken, token)).limit(1);
        if (res) {
          const mspTenantId = await resolveMspForOrg(res.orgId);
          return { classification: "sim", orgId: res.orgId, mspTenantId, simToken: token };
        }
      }
      // Non-sim: attribute by the reporter's verified email domain.
      let orgId: number | null = null;
      const domain = emailDomain(input.reporterEmail);
      if (db && domain) {
        const [vd] = await db.select({ orgId: orgVerifiedDomains.orgId })
          .from(orgVerifiedDomains)
          .where(and(eq(orgVerifiedDomains.domain, domain), eq(orgVerifiedDomains.verified, true)))
          .limit(1);
        orgId = vd?.orgId ?? null;
      }
      const mspTenantId = orgId != null ? await resolveMspForOrg(orgId) : null;
      return { classification: "non_sim", orgId, mspTenantId, simToken: null };
    },

    async recordSimReport(token: string): Promise<void> {
      const { trackEvent } = await import("../db");
      await trackEvent(token, "report");
    },

    async persistReport(row: PersistReportRow): Promise<PersistedRow> {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // Idempotent insert on the unique idempotency key. A repeat returns the original row, deduped.
      if (row.idempotencyKey) {
        const inserted = await db.insert(phishReports).values(row as any)
          .onConflictDoNothing({ target: phishReports.idempotencyKey }).returning({ id: phishReports.id });
        if (inserted[0]) return { id: inserted[0].id, deduped: false };
        const [existing] = await db.select({ id: phishReports.id }).from(phishReports)
          .where(eq(phishReports.idempotencyKey, row.idempotencyKey)).limit(1);
        return { id: existing?.id ?? 0, deduped: true };
      }
      const [inserted] = await db.insert(phishReports).values(row as any).returning({ id: phishReports.id });
      return { id: inserted.id, deduped: false };
    },

    async resolveTicketTarget(orgId: number): Promise<{ kind: "ready"; target: TicketTarget } | { kind: "not_configured"; reason: string }> {
      const db = await getDb();
      if (!db) return { kind: "not_configured", reason: "Database unavailable" };
      const mspTenantId = await resolveMspForOrg(orgId);
      if (mspTenantId == null) return { kind: "not_configured", reason: "This organization is not managed by an MSP with a PSA integration." };
      const [conn] = await db.select().from(psaConnections)
        .where(and(eq(psaConnections.mspTenantId, mspTenantId), eq(psaConnections.enabled, true))).limit(1);
      if (!conn) return { kind: "not_configured", reason: "No PSA connection is enabled for this MSP." };
      const [mapping] = await db.select().from(psaCompanyMappings)
        .where(and(eq(psaCompanyMappings.connectionId, conn.id), eq(psaCompanyMappings.orgId, orgId))).limit(1);
      if (!mapping) return { kind: "not_configured", reason: "This organization is not mapped to a PSA company. Configure the mapping in Integrations → PSA." };
      let adapter;
      try {
        adapter = buildAdapter(conn);
      } catch (e) {
        return { kind: "not_configured", reason: (e as Error).message };
      }
      return { kind: "ready", target: { connectionId: conn.id, provider: conn.provider, externalCompanyId: mapping.externalCompanyId, adapter } };
    },

    async markTicketCreated(connectionId: number, reportId: number, ticketId: string, url: string | undefined): Promise<void> {
      const db = await getDb();
      if (!db) return;
      const [conn] = await db.select({ provider: psaConnections.provider, n: psaConnections.ticketsCreated })
        .from(psaConnections).where(eq(psaConnections.id, connectionId)).limit(1);
      await db.update(phishReports).set({
        psaProvider: conn?.provider ?? null, psaTicketId: ticketId, psaTicketUrl: url ?? null, psaError: null,
      }).where(eq(phishReports.id, reportId));
      await db.update(psaConnections).set({
        lastSuccessAt: new Date(), lastError: null, ticketsCreated: (conn?.n ?? 0) + 1,
      }).where(eq(psaConnections.id, connectionId));
    },

    async markTicketError(connectionId: number, reportId: number, error: string): Promise<void> {
      const db = await getDb();
      if (!db) return;
      await db.update(phishReports).set({ psaError: error }).where(eq(phishReports.id, reportId));
      await db.update(psaConnections).set({ lastError: error }).where(eq(psaConnections.id, connectionId));
    },
  };
}
