import { describe, it, expect } from "vitest";
import { checkSendAllowed } from "./complianceGuard";

describe("checkSendAllowed — the compliance floor", () => {
  const enrolled = ["corp.com", "acme.io"];

  it("enrolled domain passes", () => {
    expect(checkSendAllowed(1, "alice@corp.com", enrolled)).toEqual({ allowed: true });
  });

  it("non-enrolled domain rejects (domain_not_enrolled)", () => {
    const v = checkSendAllowed(1, "bob@evil.com", enrolled);
    expect(v.allowed).toBe(false);
    expect(!v.allowed && v.reason).toBe("domain_not_enrolled");
  });

  it("subdomain of an enrolled domain passes", () => {
    expect(checkSendAllowed(1, "carol@mail.corp.com", enrolled).allowed).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(checkSendAllowed(1, "DAVE@CORP.COM", enrolled).allowed).toBe(true);
  });

  it("look-alike suffix does NOT pass (corp.com.evil.com)", () => {
    const v = checkSendAllowed(1, "eve@corp.com.evil.com", enrolled);
    expect(!v.allowed && v.reason).toBe("domain_not_enrolled");
  });

  it("inactive target rejects (target_inactive), even on an enrolled domain", () => {
    const v = checkSendAllowed(1, "alice@corp.com", enrolled, { targetActive: false });
    expect(!v.allowed && v.reason).toBe("target_inactive");
  });

  it("active target on enrolled domain passes", () => {
    expect(checkSendAllowed(1, "alice@corp.com", enrolled, { targetActive: true }).allowed).toBe(true);
  });

  it("malformed email rejects (invalid_email)", () => {
    for (const bad of ["not-an-email", "a@b", "@corp.com", "alice@", "alice corp.com", ""]) {
      const v = checkSendAllowed(1, bad, enrolled);
      expect(!v.allowed && v.reason).toBe("invalid_email");
    }
  });

  it("fails closed: empty enrolled list rejects every recipient", () => {
    const v = checkSendAllowed(1, "alice@corp.com", []);
    expect(!v.allowed && v.reason).toBe("domain_not_enrolled");
  });

  it("second enrolled domain also passes", () => {
    expect(checkSendAllowed(1, "z@acme.io", enrolled).allowed).toBe(true);
  });
});
