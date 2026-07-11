import { describe, it, expect } from "vitest";
import {
  buildVerificationToken,
  txtMatches,
  verifyDomainTxt,
  onlyVerifiedDomains,
} from "./domainVerify";
import { checkSendAllowed } from "./complianceGuard";

describe("domain ownership verification (DNS TXT)", () => {
  it("token has the phishsim-verify prefix and is unique-ish", () => {
    const a = buildVerificationToken();
    const b = buildVerificationToken();
    expect(a.startsWith("phishsim-verify=")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("txtMatches: exact record matches, others do not", () => {
    const tok = "phishsim-verify=abc123";
    expect(txtMatches([["phishsim-verify=abc123"]], tok)).toBe(true);
    expect(txtMatches([["v=spf1 -all"], ["phishsim-verify=abc123"]], tok)).toBe(true); // multi-chunk record
    expect(txtMatches([["phishsim-verify=WRONG"]], tok)).toBe(false);
    expect(txtMatches([], tok)).toBe(false);
  });

  const resolver = (records: string[][]) => async (_d: string) => records;
  const throwing = async (_d: string): Promise<string[][]> => {
    throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
  };

  it("verified: a published record exactly matches the token", async () => {
    const r = await verifyDomainTxt("corp.com", "phishsim-verify=tok", resolver([["phishsim-verify=tok"]]));
    expect(r).toBe("verified");
  });

  it("token_mismatch: a phishsim record exists but with a different token", async () => {
    const r = await verifyDomainTxt("corp.com", "phishsim-verify=tok", resolver([["phishsim-verify=other"]]));
    expect(r).toBe("token_mismatch");
  });

  it("txt_not_found: no phishsim-verify record present", async () => {
    const r = await verifyDomainTxt("corp.com", "phishsim-verify=tok", resolver([["v=spf1 -all"], ["google-site-verification=x"]]));
    expect(r).toBe("txt_not_found");
  });

  it("dns_lookup_failed: a lookup error FAILS CLOSED (never returns verified)", async () => {
    const r = await verifyDomainTxt("nope.invalid", "phishsim-verify=tok", throwing);
    expect(r).toBe("dns_lookup_failed");
    expect(r).not.toBe("verified");
  });
});

describe("the floor trusts ONLY verified domains", () => {
  const rows = [
    { domain: "verified.com", verified: true },
    { domain: "pending.com", verified: false },
  ];

  it("onlyVerifiedDomains drops unverified rows", () => {
    expect(onlyVerifiedDomains(rows)).toEqual(["verified.com"]);
  });

  it("enrolled + VERIFIED passes the send floor", () => {
    const verified = onlyVerifiedDomains(rows);
    expect(checkSendAllowed(1, "a@verified.com", verified).allowed).toBe(true);
  });

  it("enrolled but UNVERIFIED rejects (domain_not_enrolled) — never returned to the floor", () => {
    const verified = onlyVerifiedDomains(rows); // pending.com filtered out
    const v = checkSendAllowed(1, "a@pending.com", verified);
    expect(!v.allowed && v.reason).toBe("domain_not_enrolled");
  });
});
