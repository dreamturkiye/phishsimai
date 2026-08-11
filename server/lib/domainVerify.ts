// Domain-ownership verification via DNS TXT. Makes org_verified_domains trustworthy so
// the compliance floor (Batch 2) can be relied on. Uses Node's built-in dns.promises —
// no new dependency. The DNS resolver is injectable so the logic is unit-testable and so
// verifyDomainTxt NEVER throws into a pass (a lookup failure fails closed).
import { promises as dns } from "node:dns";
import { nanoid } from "nanoid";

export type DnsVerifyResult = "verified" | "txt_not_found" | "token_mismatch" | "dns_lookup_failed";

export type TxtResolver = (domain: string) => Promise<string[][]>;

const PREFIX = "phishsim-verify=";

/** The full TXT value an org must publish. Stored as verification_token. */
export function buildVerificationToken(): string {
  return `${PREFIX}${nanoid(24)}`;
}

/** Flatten a resolveTxt() result (each record is chunk[]) to trimmed strings. */
export function flattenTxt(records: string[][]): string[] {
  return records.map((chunks) => chunks.join("").trim());
}

/** True iff some published TXT record exactly equals the expected token value. */
export function txtMatches(records: string[][], expectedToken: string): boolean {
  return flattenTxt(records).includes(expectedToken);
}

/**
 * Look up `domain`'s TXT records and grade against the expected token.
 * Order matters: an unresolvable domain is 'dns_lookup_failed' (fail closed); a domain
 * with no phishsim-verify record is 'txt_not_found'; a phishsim record that doesn't match
 * is 'token_mismatch'. Only an exact match is 'verified'. Never throws.
 */
export async function verifyDomainTxt(
  domain: string,
  expectedToken: string,
  resolveTxt: TxtResolver = dns.resolveTxt,
): Promise<DnsVerifyResult> {
  let records: string[][];
  try {
    records = await resolveTxt(domain);
  } catch (e) {
    // PS-VERIFY-01 (2026-07-22): node's resolveTxt THROWS ENODATA when the domain resolves but
    // publishes no TXT records at all — which is the single most common onboarding state ("I
    // haven't added the record yet"). Reporting that as 'dns_lookup_failed' told customers their
    // DNS was broken when they had simply not finished. Measured: phishsimai.com itself has zero
    // apex TXT records and returned ENODATA. Only a domain that genuinely does not resolve
    // (NXDOMAIN / ENOTFOUND) is a lookup failure.
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENODATA") return "txt_not_found";
    return "dns_lookup_failed";
  }
  const flat = flattenTxt(records);
  const ours = flat.filter((v) => v.startsWith(PREFIX));
  if (ours.length === 0) return "txt_not_found";
  return ours.includes(expectedToken) ? "verified" : "token_mismatch";
}

/** Pure guard: keep only verified domains. getVerifiedDomains() defends with this too. */
export function onlyVerifiedDomains(rows: { domain: string; verified: boolean }[]): string[] {
  return rows.filter((r) => r.verified === true).map((r) => r.domain.toLowerCase());
}
