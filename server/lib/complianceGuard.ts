// PhishSimAI compliance floor — the send-boundary predicate (Genesis §2.4, §2.6).
// PURE and DB-free: the IDENTICAL check runs at campaign-build time AND at enqueue/send
// time (both doors). Callers pass the org's verified domains; this function never touches
// the DB, so it is trivially testable and cannot drift between the two doors.

export type SendRejectReason = "domain_not_enrolled" | "target_inactive" | "invalid_email";

export type SendVerdict =
  | { allowed: true }
  | { allowed: false; reason: SendRejectReason; detail: string };

// Deliberately strict-but-simple: exactly one @, non-empty local part, a dotted domain.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercased registered domain of an email, or null if unparseable. */
export function emailDomain(email: string): string | null {
  if (typeof email !== "string") return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const dom = email.slice(at + 1).trim().toLowerCase();
  return dom.length > 0 ? dom : null;
}

/** True iff `domain` equals, or is a subdomain of, some enrolled domain. */
export function domainEnrolled(domain: string, verifiedDomains: string[]): boolean {
  const d = domain.trim().toLowerCase();
  if (!d) return false;
  return verifiedDomains.some((v) => {
    const vd = String(v).trim().toLowerCase().replace(/^@/, "");
    if (!vd) return false;
    return d === vd || d.endsWith("." + vd);
  });
}

/**
 * The compliance floor. Allowed ONLY if the recipient's domain is enrolled for the org.
 * `opts.targetActive === false` yields `target_inactive`. Anything unparseable is
 * `invalid_email`. Fails closed: an empty verified-domains list rejects every recipient.
 *
 * NOTE: the stated 3-arg signature is preserved; `opts.targetActive` is an optional 4th
 * arg so the one pure function can also produce `target_inactive` (which the recipient
 * string alone cannot express) — keeping "identical check at both doors" literally true.
 */
export function checkSendAllowed(
  orgId: number,
  recipientEmail: string,
  verifiedDomains: string[],
  opts?: { targetActive?: boolean },
): SendVerdict {
  if (typeof recipientEmail !== "string" || !EMAIL_RE.test(recipientEmail.trim())) {
    return {
      allowed: false,
      reason: "invalid_email",
      detail: `org ${orgId}: unparseable recipient "${String(recipientEmail).slice(0, 120)}"`,
    };
  }
  if (opts && opts.targetActive === false) {
    return { allowed: false, reason: "target_inactive", detail: `org ${orgId}: ${recipientEmail}` };
  }
  const dom = emailDomain(recipientEmail);
  if (!dom) {
    return { allowed: false, reason: "invalid_email", detail: `org ${orgId}: no domain in "${recipientEmail}"` };
  }
  if (!domainEnrolled(dom, verifiedDomains)) {
    return {
      allowed: false,
      reason: "domain_not_enrolled",
      detail: `org ${orgId}: ${dom} not in enrolled [${verifiedDomains.join(", ") || "(none)"}]`,
    };
  }
  return { allowed: true };
}
