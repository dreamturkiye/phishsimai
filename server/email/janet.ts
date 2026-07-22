import { Resend } from "resend";
import { captureServerError } from "../os/sentryServer";
// PS-NUDGE-01: lazy so importing this module (e.g. in tests) never throws on a missing key.
let _resend: Resend | null = null;
function resend(): Resend { return (_resend ??= new Resend(process.env.RESEND_API_KEY ?? "re_missing")); }
const FROM = "Janet from PhishSim AI <janet@phishsimai.com>";
const APP_URL = process.env.VITE_APP_URL ?? "https://phishsimai.com";

/**
 * PS-SEND-01 (2026-07-22): each of these three sends caught exceptions into console.error and
 * NEVER inspected the `error` field Resend returns on a non-throwing API rejection — so the
 * most common failure mode was not merely unlogged, it was unobserved. These stay fire-and-
 * forget (a failed lifecycle email must not break signup), but a failure is now logged AND
 * captured rather than discarded. Returns whether it was accepted, for callers that care.
 */
async function sendLifecycle(tag: string, to: string, subject: string, html: string): Promise<boolean> {
  try {
    const { data, error } = await resend().emails.send({ from: FROM, to, subject, html });
    if (error) {
      console.error(`[Janet ${tag}] Resend rejected:`, error);
      captureServerError(new Error(`Janet ${tag} rejected: ${(error as any)?.message ?? JSON.stringify(error)}`), { scope: "janet", tag });
      return false;
    }
    if (!data?.id) {
      captureServerError(new Error(`Janet ${tag}: no message id returned`), { scope: "janet", tag });
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[Janet ${tag}]`, e);
    captureServerError(e, { scope: "janet", tag });
    return false;
  }
}

export async function sendWelcomeEmail(to: string, orgName: string): Promise<void> {
  const html = '<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden"><div style="background:#6366f1;padding:28px 32px"><h1 style="margin:0;font-size:22px;color:#fff;font-weight:700">Welcome to PhishSim AI</h1><p style="margin:8px 0 0;color:#c7d2fe;font-size:14px">Your 14-day free trial is active — full access, no card required</p></div><div style="padding:32px"><p style="color:#e2e8f0;font-size:15px;line-height:1.7">Hi ' + orgName + ' team, you are all set. Run your first campaign in 10 minutes: (1) Add employees under Targets, (2) Pick a template or generate one with AI, (3) Click Launch.</p><a href="' + APP_URL + '/dashboard" style="display:inline-block;background:#6366f1;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Launch Your First Campaign</a><p style="color:#64748b;font-size:13px;margin-top:28px">Janet, PhishSim AI Customer Success</p></div></div>';
  await sendLifecycle('D0', to, 'Your first phishing campaign in 10 minutes', html);
}

export async function sendInsurancePackEmail(to: string, orgName: string): Promise<void> {
  const html = '<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden"><div style="background:#0f172a;padding:28px 32px;border-bottom:1px solid #1e293b"><h1 style="margin:0;font-size:20px;color:#fff;font-weight:700">Your Cyber Insurance Renewal Pack is waiting</h1></div><div style="padding:32px"><p style="color:#e2e8f0;font-size:15px;line-height:1.7">Hi ' + orgName + ' team, Coalition At-Bay Travelers and Chubb now require documented phishing simulation data at every renewal. Run one campaign and we generate the 5-page broker-ready PDF automatically.</p><div style="background:#1e293b;border-radius:10px;padding:20px;margin:24px 0;border:1px solid #334155"><p style="margin:0 0 8px;color:#e2e8f0;font-size:14px">Carrier supplemental checklist - all 5 controls PASS</p><p style="margin:0 0 8px;color:#e2e8f0;font-size:14px">Timestamped campaign history log</p><p style="margin:0;color:#e2e8f0;font-size:14px">Attestation page with signature line for broker</p></div><a href="' + APP_URL + '/dashboard" style="display:inline-block;background:#6366f1;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Generate My Evidence Pack</a><p style="color:#64748b;font-size:13px;margin-top:28px">Janet, PhishSim AI Customer Success</p></div></div>';
  await sendLifecycle('D3', to, 'Your cyber insurance renewal pack is ready to generate', html);
}

// ── PS-NUDGE-01: trial-conversion sequence. Anchored to what they'd LOSE at day 14 (concrete:
// "drop to 1 campaign / 10 targets, recurring program stops") not "your trial is ending" (noise).
// D7/D12 pull REAL account numbers — "your team clicked 40% of simulated phishing links" sells
// harder than any copy. Wired to a daily cron (server/os/trialNudges.ts).
export interface TrialStats { sent: number; opened: number; clicked: number; reported: number }
const pctOf = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) + "%" : "—");

function nudgeHtml(headerBg: string, title: string, bodyInner: string, ctaLabel: string, ctaUrl: string): string {
  return `<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden"><div style="background:${headerBg};padding:28px 32px"><h1 style="margin:0;font-size:20px;color:#fff;font-weight:700">${title}</h1></div><div style="padding:32px;font-size:15px;line-height:1.7;color:#e2e8f0">${bodyInner}<a href="${ctaUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;margin-top:8px">${ctaLabel}</a><p style="color:#64748b;font-size:13px;margin-top:28px">Janet, PhishSim AI Customer Success</p></div></div>`;
}

// Day 7 — value recap (or activation nudge if they never launched).
export async function sendTrialDay7(to: string, orgName: string, s: TrialStats): Promise<boolean> {
  const body = s.sent > 0
    ? `<p>Hi ${orgName} team — a week in, here's what your phishing tests actually found:</p>
       <ul style="color:#e2e8f0;padding-left:18px">
         <li><b style="color:#f8fafc">${pctOf(s.opened, s.sent)}</b> of your team opened the simulated phishing email</li>
         <li><b style="color:#fca5a5">${pctOf(s.clicked, s.sent)}</b> clicked the link — ${s.clicked} ${s.clicked === 1 ? "person who" : "people who"} would have handed credentials to a real attacker</li>
         <li><b style="color:#86efac">${pctOf(s.reported, s.sent)}</b> reported it — the exact reflex you're training</li>
       </ul>
       <p>That's real risk data on your own team, in seven days. Keep the program running — every campaign sharpens the number that matters.</p>`
    : `<p>Hi ${orgName} team — you're a week into your trial and haven't launched your first sim yet. It takes 10 minutes: add your team, pick a template, click Launch. That first campaign shows you exactly who on your team would fall for a real attack.</p>`;
  return sendLifecycle("trial-d7", to, `${orgName}: your first week of phishing-test results`, nudgeHtml("#6366f1", "Your first week of results", body, s.sent > 0 ? "Open your dashboard" : "Launch your first campaign", APP_URL + "/dashboard"));
}

// Day 12 — specific loss + upgrade CTA.
export async function sendTrialDay12(to: string, orgName: string, s: TrialStats, daysLeft: number): Promise<boolean> {
  const recap = s.sent > 0 ? `<p style="background:#1e293b;border-radius:8px;padding:14px 16px;font-size:14px">So far: <b>${s.sent}</b> sims sent · <b style="color:#fca5a5">${pctOf(s.clicked, s.sent)}</b> clicked · <b style="color:#86efac">${pctOf(s.reported, s.sent)}</b> reported.</p>` : "";
  const body = `<p>Hi ${orgName} team — your trial ends in <b>${daysLeft} day${daysLeft === 1 ? "" : "s"}</b>. Here's exactly what changes when it does:</p>
     ${recap}
     <p><b style="color:#f8fafc">You'll drop to the free plan — 1 campaign and 10 targets.</b> Your recurring program stops, you can't test your full team, and analytics export + compliance certificates turn off. The risk data you've started building stops updating.</p>
     <p>Upgrade before ${daysLeft === 1 ? "tomorrow" : "then"} to keep it all running — plans start at $149/mo.</p>`;
  return sendLifecycle("trial-d12", to, `${orgName}: your program stops in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, nudgeHtml("#b45309", `${daysLeft} day${daysLeft === 1 ? "" : "s"} left — then you drop to 1 campaign`, body, "Keep my program running", APP_URL + "/settings?tab=billing"));
}

// Day 14 — what changed + how to restore.
export async function sendTrialDay14(to: string, orgName: string): Promise<boolean> {
  const body = `<p>Hi ${orgName} team — your 14-day trial has ended and your account is now on the <b>free plan</b>:</p>
     <ul style="color:#e2e8f0;padding-left:18px">
       <li>1 campaign · 10 targets · 1 template</li>
       <li>No scheduling / recurring campaigns</li>
       <li>No analytics export or compliance certificates</li>
     </ul>
     <p>Your recurring program is paused and you can't test your full team — but <b style="color:#86efac">nothing is deleted</b>. Upgrade any time and everything you built comes straight back, exactly where you left it. Plans start at $149/mo.</p>`;
  return sendLifecycle("trial-d14", to, `${orgName}: your trial ended — here's how to restore full access`, nudgeHtml("#dc2626", "Your trial has ended", body, "Restore full access", APP_URL + "/settings?tab=billing"));
}

// Legacy generic ender — kept for back-compat; superseded by the D7/D12/D14 sequence above.
export async function sendTrialEndingEmail(to: string, orgName: string, daysLeft: number): Promise<void> {
  await sendTrialDay12(to, orgName, { sent: 0, opened: 0, clicked: 0, reported: 0 }, daysLeft);
}
