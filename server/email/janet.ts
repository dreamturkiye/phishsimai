import { Resend } from "resend";
import { captureServerError } from "../os/sentryServer";
const resend = new Resend(process.env.RESEND_API_KEY);
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
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });
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
  const html = '<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden"><div style="background:#6366f1;padding:28px 32px"><h1 style="margin:0;font-size:22px;color:#fff;font-weight:700">Welcome to PhishSim AI</h1><p style="margin:8px 0 0;color:#c7d2fe;font-size:14px">Your 14-day free trial is active</p></div><div style="padding:32px"><p style="color:#e2e8f0;font-size:15px;line-height:1.7">Hi ' + orgName + ' team, you are all set. Run your first campaign in 10 minutes: (1) Add employees under Targets, (2) Pick a template or generate one with AI, (3) Click Launch.</p><a href="' + APP_URL + '/dashboard" style="display:inline-block;background:#6366f1;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Launch Your First Campaign</a><p style="color:#64748b;font-size:13px;margin-top:28px">Janet, PhishSim AI Customer Success</p></div></div>';
  await sendLifecycle('D0', to, 'Your first phishing campaign in 10 minutes', html);
}

export async function sendInsurancePackEmail(to: string, orgName: string): Promise<void> {
  const html = '<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden"><div style="background:#0f172a;padding:28px 32px;border-bottom:1px solid #1e293b"><h1 style="margin:0;font-size:20px;color:#fff;font-weight:700">Your Cyber Insurance Renewal Pack is waiting</h1></div><div style="padding:32px"><p style="color:#e2e8f0;font-size:15px;line-height:1.7">Hi ' + orgName + ' team, Coalition At-Bay Travelers and Chubb now require documented phishing simulation data at every renewal. Run one campaign and we generate the 5-page broker-ready PDF automatically.</p><div style="background:#1e293b;border-radius:10px;padding:20px;margin:24px 0;border:1px solid #334155"><p style="margin:0 0 8px;color:#e2e8f0;font-size:14px">Carrier supplemental checklist - all 5 controls PASS</p><p style="margin:0 0 8px;color:#e2e8f0;font-size:14px">Timestamped campaign history log</p><p style="margin:0;color:#e2e8f0;font-size:14px">Attestation page with signature line for broker</p></div><a href="' + APP_URL + '/dashboard" style="display:inline-block;background:#6366f1;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Generate My Evidence Pack</a><p style="color:#64748b;font-size:13px;margin-top:28px">Janet, PhishSim AI Customer Success</p></div></div>';
  await sendLifecycle('D3', to, 'Your cyber insurance renewal pack is ready to generate', html);
}

export async function sendTrialEndingEmail(to: string, orgName: string, daysLeft: number): Promise<void> {
  const html = '<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden"><div style="background:#dc2626;padding:28px 32px"><h1 style="margin:0;font-size:20px;color:#fff;font-weight:700">Your trial ends in ' + daysLeft + ' days</h1></div><div style="padding:32px"><p style="color:#e2e8f0;font-size:15px;line-height:1.7">Hi ' + orgName + ' team, upgrade to keep all campaign history, employee risk scores, the Insurance Readiness Pack, 100 templates, 20 training modules, and MSP white-label. Plans from /user/month - 3x cheaper than KnowBe4.</p><a href="' + APP_URL + '/settings?tab=billing" style="display:inline-block;background:#6366f1;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Upgrade Now</a><p style="color:#64748b;font-size:13px;margin-top:28px">Janet, PhishSim AI Customer Success</p></div></div>';
  await sendLifecycle('D7', to, 'Your PhishSim AI trial ends in ' + daysLeft + ' days', html);
}
