import { Resend } from "resend";

export async function sendCampaignEmail(params: {
  to: string; fromName: string; fromEmail: string;
  subject: string; htmlBody: string; trackingToken: string; appBaseUrl: string;
}): Promise<void> {
  const { to, fromName, fromEmail, subject, htmlBody, trackingToken, appBaseUrl } = params;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const clickUrl = appBaseUrl+'/c/'+trackingToken;
  const pixelUrl = appBaseUrl+'/t/'+trackingToken;
  let h = htmlBody.replace(/{{TRACKING_LINK}}/g, clickUrl);
  const px = '<img src="'+pixelUrl+'" width="1" height="1" alt="" style="display:none" />';
  h = h.includes('</body>') ? h.replace('</body>', px+'</body>') : h+px;
  try {
    const { error } = await resend.emails.send({ from: fromName+' <'+fromEmail+'>', to, subject, html: h });
    if (error) console.error('[EmailSender] Failed:', error);
  } catch(err) { console.error('[EmailSender] Exception:', err); }
}
