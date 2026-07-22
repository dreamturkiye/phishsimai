import { Resend } from "resend";
import { captureServerError } from "../os/sentryServer";

// SECURITY (A3): restrict the From domain to an allowlist so a tenant cannot send as an
// arbitrary external domain (brand impersonation). Defaults to phishsimai.com; extend via
// ALLOWED_SENDER_DOMAINS (comma-separated). Disallowed domains fall back to DEFAULT_FROM_EMAIL.
const ALLOWED_SENDER_DOMAINS = (process.env.ALLOWED_SENDER_DOMAINS ?? "phishsimai.com")
  .split(",").map(d => d.trim().toLowerCase()).filter(Boolean);
const DEFAULT_FROM_EMAIL = process.env.DEFAULT_FROM_EMAIL ?? "no-reply@phishsimai.com";

function isAllowedSender(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const dom = email.slice(at + 1).toLowerCase();
  return ALLOWED_SENDER_DOMAINS.some(d => dom === d || dom.endsWith("." + d));
}

export type SendEmailResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * PS-SEND-01 (2026-07-22): this used to return void and swallow every failure into
 * console.error. The launch loop did `await sendCampaignEmail(...); sent++;`, so a campaign
 * reported "1 sent" when Resend had rejected it — and the campaign_results row had already
 * been written claiming emailSentAt. Now it RETURNS the outcome; the caller decides. It still
 * never throws (one bad recipient must not abort a whole campaign), but it can no longer lie.
 */
export async function sendCampaignEmail(params: {
  to: string; fromName: string; fromEmail: string;
  subject: string; htmlBody: string; trackingToken: string; appBaseUrl: string;
}): Promise<SendEmailResult> {
  const { to, fromName, fromEmail, subject, htmlBody, trackingToken, appBaseUrl } = params;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const safeFromEmail = isAllowedSender(fromEmail) ? fromEmail : DEFAULT_FROM_EMAIL;
  if (safeFromEmail !== fromEmail) console.warn('[EmailSender] From domain not in allowlist, overriding:', fromEmail, '->', safeFromEmail);
  const clickUrl = appBaseUrl+'/c/'+trackingToken;
  const pixelUrl = appBaseUrl+'/t/'+trackingToken;
  let h = htmlBody.replace(/{{TRACKING_LINK}}/g, clickUrl);
  const px = '<img src="'+pixelUrl+'" width="1" height="1" alt="" style="display:none" />';
  h = h.includes('</body>') ? h.replace('</body>', px+'</body>') : h+px;
  try {
    const { data, error } = await resend.emails.send({ from: fromName+' <'+safeFromEmail+'>', to, subject, html: h });
    if (error) {
      const msg = (error as any)?.message ? String((error as any).message) : JSON.stringify(error);
      console.error('[EmailSender] Failed:', error);
      captureServerError(new Error('Resend rejected campaign email: ' + msg), { scope: 'sendCampaignEmail' });
      return { ok: false, error: msg };
    }
    if (!data?.id) {
      // No provider id means we have no evidence it was accepted. Do not call that a send.
      captureServerError(new Error('Resend returned no message id'), { scope: 'sendCampaignEmail' });
      return { ok: false, error: 'provider returned no message id' };
    }
    return { ok: true, id: data.id };
  } catch(err) {
    console.error('[EmailSender] Exception:', err);
    captureServerError(err, { scope: 'sendCampaignEmail' });
    return { ok: false, error: (err as Error)?.message ?? String(err) };
  }
}
