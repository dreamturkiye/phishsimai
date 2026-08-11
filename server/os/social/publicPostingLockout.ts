// PS-SOCIAL-LOCKOUT-01 (2026-07-25) — ONE structural lockout on public community/social posting.
//
// Requirement: no code path may publish to a public community or social channel under any
// identity. This module is the single enforcement point; every outbound publish call site calls
// assertPublicPostingDisabled() BEFORE its network request, so the capability is absent by
// construction rather than by configuration.
//
// WHY THIS EXISTS — what the audit found on 2026-07-25:
//
//  · Reddit (server/os/social/redditClient.ts): the twice-daily /api/os/sarah-social cron
//    LLM-drafts comments/posts and publishes them to r/msp, r/MSSP, r/sysadmin, r/cybersecurity
//    and r/compliance under a "Sarah Mitchell" persona. processSarahSocialQueue() selects on
//    status='queued' — there is NO approved state in the publish predicate. The only thing
//    stopping it was the ABSENCE of SARAH_REDDIT_USERNAME / SARAH_REDDIT_PASSWORD in Vercel.
//    Two env vars away from live, unreviewed, persona-authored posting.
//
//  · LinkedIn (server/os/social/publishSarahLinkedIn.ts): its "approval" check was
//        if (item.review_status !== 'approved') await submitSocialReview(token, 'approved', ...)
//    — i.e. an unapproved item APPROVES ITSELF and proceeds. A rubber stamp, not a gate.
//
//  · LinkedIn (server/os/social/linkedInPublisher.ts): genuinely flag-gated on
//    janet_memory.linkedin_autopost_enabled, but a DB row is founder-flippable without review,
//    so it is not a structural guard either.
//
// Empirically nothing has ever been published: os_social_queue was EMPTY at audit time (zero
// queued, zero posted, on ep-spring-leaf). This lockout preserves that state deliberately instead
// of by luck.
//
// SCOPE — blocked vs allowed:
//    BLOCKED: any outbound POST that creates public content (Reddit submit/comment, LinkedIn
//             publish via PostForMe).
//    ALLOWED: read/monitor paths (Reddit hot.json, /api/v1/me, login/session), drafting, queueing,
//             preview rendering, and founder-facing review UI. Monitoring and drafting are safe and
//             stay on; only the publish step is severed.
//
// TO RE-ENABLE deliberately: flip the constant below in a reviewed commit AND add a real
// founder-approval predicate to the publish selectors (status='queued' is not approval, and a
// self-approving check is not approval). Do NOT re-enable by deleting call sites.
export const PUBLIC_SOCIAL_POSTING_ENABLED = false

/** Throws before any network call when the lockout is active. `channel` names the blocked target. */
export function assertPublicPostingDisabled(channel: string): void {
  if (PUBLIC_SOCIAL_POSTING_ENABLED) return
  throw new Error(
    `PS-SOCIAL-LOCKOUT-01: public social posting is disabled at the source — refusing to publish to ${channel}. ` +
    'No code path may post to a public community channel under any identity. ' +
    'Drafting, queueing, monitoring and preview still work; only the publish step is blocked.',
  )
}
