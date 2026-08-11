// ─────────────────────────────────────────────────────────────────────────────
//  PS-PSA-01 — adapter factory. Given a psa_connections row, decrypt its credentials and return
//  the right PsaTicketAdapter. This is the ONLY place a provider string maps to an implementation;
//  the report router never branches on provider.
// ─────────────────────────────────────────────────────────────────────────────
import type { PsaConnection } from "../../drizzle/schema";
import type { PsaTicketAdapter, ConnectwiseConfig, ConnectwiseSecret, HaloConfig, HaloSecret } from "./types";
import { ConnectwiseAdapter } from "./connectwise";
import { HaloAdapter } from "./halo";
import { decryptSecret } from "./crypto";

export function buildAdapter(conn: Pick<PsaConnection, "provider" | "config" | "secretEnc">): PsaTicketAdapter {
  if (!conn.secretEnc) throw new Error("PSA connection has no stored credentials");
  const secretJson = decryptSecret(conn.secretEnc);
  const secret = JSON.parse(secretJson);
  return buildAdapterFromPlain(conn.provider, conn.config, secret);
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
      return new HaloAdapter(config as HaloConfig, secret as HaloSecret);
    default:
      throw new Error(`Unknown PSA provider: ${provider}`);
  }
}

export * from "./types";
