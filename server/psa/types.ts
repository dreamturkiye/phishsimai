// ─────────────────────────────────────────────────────────────────────────────
//  PS-PSA-01 — the one internal PSA adapter interface. Two implementations
//  (ConnectWise Manage, Halo) live behind it. The report router selects an adapter and calls it;
//  it holds NO provider-specific logic itself.
// ─────────────────────────────────────────────────────────────────────────────

export type PsaProvider = "connectwise_manage" | "halo";

/** The fields we send to a PSA when creating a ticket from a non-sim phishing report. */
export interface PsaCreateTicketInput {
  /** External company id in the PSA — the mapped company for this PhishSim org. Ticket is scoped here. */
  externalCompanyId: string;
  /** Ticket summary/title. Falls back to "Reported phishing email" upstream when subject is absent. */
  summary: string;
  /** Full ticket body: reporter, sender, received time, body excerpt, headers, PhishSim metadata. */
  body: string;
  /** Reporter identity, for PSA contact fields when the provider supports them. */
  reporterEmail?: string | null;
  reporterName?: string | null;
}

/** A company in the PSA, for the mapping UI. */
export interface PsaCompany {
  id: string;
  name: string;
}

export interface PsaTicketResult {
  externalId: string;
  url?: string;
}

export interface PsaTestResult {
  ok: boolean;
  detail?: string;
}

export interface PsaTicketAdapter {
  provider: PsaProvider;
  testConnection(): Promise<PsaTestResult>;
  listCompanies(): Promise<PsaCompany[]>;
  createTicket(input: PsaCreateTicketInput): Promise<PsaTicketResult>;
}

/** Non-secret config shapes, provider-keyed. Stored in psa_connections.config (JSON). */
export interface ConnectwiseConfig {
  baseUrl: string;         // regional API base, e.g. https://api-na.myconnectwise.net
  companyId: string;       // CW company identifier (the MSP's own CW company id, for auth)
  serviceBoardId: number;  // Service Desk board tickets land on
  priorityId?: number;
  ticketType?: string;
}

export interface HaloConfig {
  baseUrl: string;         // https://<tenant>.halopsa.com
  ticketTypeId?: number;
  teamId?: number;
}

/** Secret shapes, provider-keyed. Stored ENCRYPTED in psa_connections.secretEnc. Never client-visible. */
export interface ConnectwiseSecret {
  publicKey: string;
  privateKey: string;
  clientId: string;        // CW REST requires a clientId header on every call
}

export interface HaloSecret {
  clientId: string;
  clientSecret: string;
}
