import { Resend } from "resend";

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

export async function sendCampaignEmail(params: {
  to: string; fromName: string; fromEmail: string;
  subject: string; htmlBody: string; trackingToken: string; appBaseUrl: string;
}): Promise<void> {
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
    const { error } = await resend.emails.send({ from: fromName+' <'+safeFromEmail+'>', to, subject, html: h });
    if (error) console.error('[EmailSender] Failed:', error);
  } catch(err) { console.error('[EmailSender] Exception:', err); }
}
