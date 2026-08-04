// ─────────────────────────────────────────────────────────────────────────────
//  PS-DELIVER-ALLOWLIST-01 — the allowlist onboarding gate, and the instructions it hands out.
//
//  THE PROBLEM IT SOLVES
//    Simulated phishing is phishing-shaped by design, so it lands in spam even with authentication
//    fully passing (verified 2026-07-22: DKIM aligned, SPF healthy, DMARC passing, real send still
//    Junked). Customer-side allowlisting is the industry fix and every competitor gates onboarding
//    on it. A trial whose first simulation is invisible concludes the product is broken.
//
//  WHY THERE IS NO "VERIFIED" STATE
//    Neither Microsoft nor Google exposes an API for a third party to read whether a customer
//    tenant has configured Advanced Delivery or a spam-bypass rule. We cannot check it, so we do
//    not claim to. An admin's tick is evidence of intent, recorded as 'confirmed_by_admin' and
//    rendered as "admin confirmed - not verified by us".
//
//    This is the same rule as a scan verdict over zero units and a posture score over zero data:
//    the honest label for something we did not measure is never a tick.
//
//  PURE BY DESIGN
//    checkAllowlistGate takes state and returns a verdict; the caller does the I/O. Same shape as
//    checkSendAllowed in complianceGuard.ts, so the gate is fully testable and both doors read the
//    same way.
// ─────────────────────────────────────────────────────────────────────────────

/** No 'verified' member exists on purpose — nothing can produce one honestly. */
export type AllowlistState = 'not_started' | 'confirmed_by_admin' | 'skipped'

export type AllowlistGateVerdict =
  | { allowed: true; state: AllowlistState; note: string }
  | { allowed: false; state: AllowlistState; reason: 'allowlist_not_started'; detail: string }

/**
 * The exact wording an admin must acknowledge to skip. Stored verbatim on the row, so a later copy
 * change cannot rewrite what a given customer was actually told.
 */
export const SKIP_WARNING =
  'I understand that without allowlisting, my simulated phishing emails may be filtered to spam ' +
  'or quarantine and my employees may never see them. I want to proceed anyway.'

/**
 * THE GATE. Blocks the first campaign launch until the admin has either configured allowlisting or
 * knowingly declined.
 *
 * Skip is a CHOICE, not a wall — but an unacknowledged skip is not a skip. A row claiming 'skipped'
 * without the acknowledgement text is treated as not_started and blocks, because the whole value of
 * the skip path is the informed-consent record it leaves behind.
 */
export function checkAllowlistGate(row: {
  state?: AllowlistState | null
  skipAckText?: string | null
} | null | undefined): AllowlistGateVerdict {
  const state = (row?.state ?? 'not_started') as AllowlistState

  if (state === 'confirmed_by_admin') {
    return {
      allowed: true,
      state,
      // Carried into the audit line so the record never hardens into "we verified it".
      note: 'admin confirmed allowlisting — NOT verified by us (no vendor API exposes tenant policy)',
    }
  }

  if (state === 'skipped') {
    const ack = (row?.skipAckText ?? '').trim()
    if (!ack) {
      return {
        allowed: false,
        state: 'not_started',
        reason: 'allowlist_not_started',
        detail: 'row claims skipped but carries no acknowledgement — treated as not started',
      }
    }
    return { allowed: true, state, note: 'allowlisting skipped knowingly — simulations may be filtered to spam' }
  }

  return {
    allowed: false,
    state: 'not_started',
    reason: 'allowlist_not_started',
    detail:
      'Complete the allowlist step, or explicitly skip it, before launching your first campaign. ' +
      'Without it your simulations are likely to be filtered to spam.',
  }
}

// ─── The instructions the admin pastes in ────────────────────────────────────

/**
 * CONFIRMED EMPIRICALLY 2026-08-04, not read from config: a live simulation delivered to
 * kaan@phishsimai.com arrived with From = security@sim.phishsimai.com. Prod honours
 * CAMPAIGN_DEFAULT_SENDER and simulations send from the reputation-isolated subdomain, never the
 * apex that cold outreach depends on (PS-SIM-ISOLATION-01, routers.ts:856-861).
 *
 * The wizard states THIS domain because that is the one an admin must allowlist. Naming the apex
 * would be worse than naming nothing: their sims would still be filtered and the wizard would have
 * caused it.
 */
export const SIM_SENDING_DOMAIN = 'sim.phishsimai.com'

/**
 * Simulation URLs an admin allowlists so links are not rewritten or detonated. Real routes, taken
 * from tracker.ts:69,84,109 and the rewrites in vercel.json:45-53 — not invented examples.
 */
export const SIM_URL_PATTERNS = [
  'https://phishsimai.com/c/*',        // tracked click  -> tracker.ts:69
  'https://phishsimai.com/landing/*',  // teaching page  -> tracker.ts:84
  'https://phishsimai.com/t/*',        // open pixel     -> vercel.json:45
  'https://phishsimai.com/api/report/*', // report-a-phish -> tracker.ts:109
] as const

export type AllowlistInstructions = {
  platform: 'microsoft365' | 'google_workspace'
  available: boolean
  path: string[]
  sendingDomain: string
  urls: readonly string[]
  /**
   * Fields we CANNOT supply, with the reason. Rendering an empty box with no explanation invites an
   * admin to invent a value; stating the gap is the honest alternative.
   */
  unavailable: { field: string; why: string }[]
  notes: string[]
}

export function microsoft365Instructions(): AllowlistInstructions {
  return {
    platform: 'microsoft365',
    available: true,
    path: [
      'Microsoft Defender portal (security.microsoft.com)',
      'Email & collaboration → Policies & rules',
      'Threat policies → Advanced delivery',
      'Phishing simulation tab → Edit',
    ],
    sendingDomain: SIM_SENDING_DOMAIN,
    urls: SIM_URL_PATTERNS,
    unavailable: [
      {
        field: 'Sending IPs',
        why:
          'We send through a shared provider pool, so our egress IPs are not fixed and any list we ' +
          'published would go stale. Advanced Delivery accepts domain + URLs without IPs — leave the ' +
          'IP field empty.',
      },
    ],
    notes: [
      'Advanced Delivery is purpose-built for third-party phishing simulations: it delivers to the inbox, does not strip links, and does not count these as real threats.',
      'This does not weaken protection against genuine phishing — the exemption is scoped to the domain and URLs above.',
    ],
  }
}

/**
 * HELD, and the reason is recorded rather than hidden. Google's documented pattern for third-party
 * simulations is an Email allowlist keyed on SENDING IPs plus a content-compliance rule. We cannot
 * supply the IPs (shared pool), so half the instruction would be unfillable. Shipping the other
 * half alone would look complete and quietly fail.
 */
export function googleWorkspaceInstructions(): AllowlistInstructions {
  return {
    platform: 'google_workspace',
    available: false,
    path: [],
    sendingDomain: SIM_SENDING_DOMAIN,
    urls: SIM_URL_PATTERNS,
    unavailable: [
      {
        field: 'Email allowlist (sending IPs)',
        why:
          'Google keys its inbound allowlist on sending IPs. We send from a shared provider pool with ' +
          'no fixed egress IPs, so this step cannot be completed accurately yet. Pending a dedicated ' +
          'sending IP.',
      },
    ],
    notes: [
      'Google Workspace instructions are not published yet. Publishing the content-compliance half alone would read as complete while leaving simulations filtered.',
    ],
  }
}
