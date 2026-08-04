// ─────────────────────────────────────────────────────────────────────────────
//  PS-PSA-01 — adapter factory. Given a psa_connections row, decrypt its credentials and return
//  the right PsaTicketAdapter. This is the ONLY place a provider string maps to an implementation;
//  the report router never branches on provider.
// ─────────────────────────────────────────────────────────────────────────────
import type { PsaConnection } from "../../drizzle/schema";
import type { PsaTicketAdapter, ConnectwiseConfig, ConnectwiseSecret } from "./types";
import { ConnectwiseAdapter } from "./connectwise";
import { decryptSecret } from "./crypto";

export function buildAdapter(conn: Pick<PsaConnection, "provider" | "config" | "secretEnc">): PsaTicketAdapter {
  if (!conn.secretEnc) throw new Error("PSA connection has no stored credentials");
  const secretJson = decryptSecret(conn.secretEnc);
  const secret = JSON.parse(secretJson);
  switch (conn.provider) {
    case "connectwise_manage":
      return new ConnectwiseAdapter(conn.config as unknown as ConnectwiseConfig, secret as ConnectwiseSecret);
    case "halo":
      // PR2. Until the Halo adapter ships, selecting it is an honest error, not a silent no-op.
      throw new Error("Halo PSA adapter is not implemented yet (shipping in PR2).");
    default:
      throw new Error(`Unknown PSA provider: ${conn.provider}`);
  }
}

/** Build an adapter from a plaintext secret object (used by testConnection before persisting). */
export function buildAdapterFromPlain(
  provider: PsaConnection["provider"],
  config: unknown,
  secret: unknown,
): PsaTicketAdapter {
  switch (provider) {
    case "connectwise_manage":
      return new ConnectwiseAdapter(config as ConnectwiseConfig, secret as ConnectwiseSecret);
    case "halo":
      throw new Error("Halo PSA adapter is not implemented yet (shipping in PR2).");
    default:
      throw new Error(`Unknown PSA provider: ${provider}`);
  }
}

export * from "./types";
