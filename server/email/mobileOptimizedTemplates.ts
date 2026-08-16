/**
 * Mobile-optimized HTML email primitives for PhishSimAI transactional mail.
 * Inline CSS + table layout for Gmail / Apple Mail / Outlook mobile clients.
 * Viewport-friendly widths, 16px+ body type, 44px tap targets, dark-mode safe colors.
 */

export const EMAIL_MAX_WIDTH = 600;
export const EMAIL_CONTENT_PADDING_MOBILE = 20;
export const EMAIL_TAP_MIN_PX = 44;

/** Shared reset + mobile media queries injected into every template <head>. */
export const mobileEmailHeadStyles = `
  meta[name="viewport"] { /* marker for clients that parse style blocks */ }
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
  img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; max-width: 100%; display: block; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f4f6f8; }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
  u + #body a { color: inherit; text-decoration: none; font-size: inherit; font-family: inherit; font-weight: inherit; line-height: inherit; }
  #MessageViewBody a { color: inherit; text-decoration: none; font-size: inherit; font-family: inherit; font-weight: inherit; line-height: inherit; }

  @media only screen and (max-width: 620px) {
    .email-container { width: 100% !important; max-width: 100% !important; }
    .fluid { width: 100% !important; max-width: 100% !important; height: auto !important; }
    .stack-column { display: block !important; width: 100% !important; max-width: 100% !important; direction: ltr !important; }
    .stack-column-center { text-align: center !important; }
    .mobile-padding { padding-left: ${EMAIL_CONTENT_PADDING_MOBILE}px !important; padding-right: ${EMAIL_CONTENT_PADDING_MOBILE}px !important; }
    .mobile-padding-v { padding-top: 16px !important; padding-bottom: 16px !important; }
    .mobile-center { text-align: center !important; }
    .mobile-full-btn a { display: block !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; }
    .mobile-full-btn td { width: 100% !important; }
    .h1-mobile { font-size: 24px !important; line-height: 32px !important; }
    .h2-mobile { font-size: 18px !important; line-height: 26px !important; }
    .body-mobile { font-size: 16px !important; line-height: 24px !important; }
    .hide-mobile { display: none !important; max-height: 0 !important; overflow: hidden !important; mso-hide: all !important; }
    .show-mobile { display: block !important; max-height: none !important; overflow: visible !important; }
  }

  @media (prefers-color-scheme: dark) {
    .email-bg { background-color: #0f1419 !important; }
    .card-bg { background-color: #1a2332 !important; }
    .text-primary { color: #f0f4f8 !important; }
    .text-secondary { color: #a0aec0 !important; }
    .border-muted { border-color: #2d3748 !important; }
  }
`.trim();

export type EmailBrand = {
  productName: string;
  logoUrl?: string;
  supportEmail?: string;
  primaryColor?: string;
  footerAddress?: string;
  appBaseUrl?: string;
};

export const defaultBrand: EmailBrand = {
  productName: "PhishSimAI",
  primaryColor: "#2563eb",
  supportEmail: "support@phishsim.ai",
  appBaseUrl: "https://app.phishsim.ai",
};

export type CtaButton = {
  label: string;
  href: string;
  /** solid (default) | outline */
  variant?: "solid" | "outline";
};

export type EmailTemplateInput = {
  preheader: string;
  title: string;
  greeting?: string;
  paragraphs: string[];
  cta?: CtaButton;
  secondaryCta?: CtaButton;
  /** Extra HTML rows already escaped / trusted server-side */
  extraRowsHtml?: string;
  footerNote?: string;
  brand?: EmailBrand;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderButton(cta: CtaButton, brand: EmailBrand): string {
  const bg = brand.primaryColor ?? defaultBrand.primaryColor!;
  const isOutline = cta.variant === "outline";
  const bgColor = isOutline ? "#ffffff" : bg;
  const textColor = isOutline ? bg : "#ffffff";
  const border = isOutline ? `border: 2px solid ${bg};` : `border: 2px solid ${bg};`;

  // Bulletproof button: VML-ish padding via nested table + large tap target
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" class="mobile-full-btn" style="margin: 0 auto;">
      <tr>
        <td align="center" bgcolor="${bgColor}" style="border-radius: 8px; ${border}">
          <a href="${escapeHtml(cta.href)}" target="_blank" rel="noopener noreferrer"
             style="display: inline-block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 600; line-height: 24px; color: ${textColor}; text-decoration: none; padding: 14px 28px; min-height: ${EMAIL_TAP_MIN_PX}px; box-sizing: border-box; border-radius: 8px;">
            ${escapeHtml(cta.label)}
          </a>
        </td>
      </tr>
    </table>`.trim();
}

/**
 * Builds a full multipart-ready HTML document optimized for mobile clients.
 * Use with text alternative from `buildPlainTextEmail`.
 */
export function buildMobileOptimizedEmail(input: EmailTemplateInput): string {
  const brand = { ...defaultBrand, ...input.brand };
  const primary = brand.primaryColor ?? defaultBrand.primaryColor!;
  const greeting = input.greeting ?? "Hi,";
  const paragraphsHtml = input.paragraphs
    .map(
      (p) => `
        <tr>
          <td class="body-mobile text-secondary mobile-padding" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; line-height: 24px; color: #4a5568; padding: 0 32px 16px 32px;">
            ${escapeHtml(p)}
          </td>
        </tr>`
    )
    .join("\n");

  const ctaBlock = input.cta
    ? `
        <tr>
          <td align="center" class="mobile-padding mobile-padding-v" style="padding: 8px 32px 8px 32px;">
            ${renderButton(input.cta, brand)}
          </td>
        </tr>`
    : "";

  const secondaryCtaBlock = input.secondaryCta
    ? `
        <tr>
          <td align="center" class="mobile-padding" style="padding: 8px 32px 24px 32px;">
            ${renderButton(input.secondaryCta, brand)}
          </td>
        </tr>`
    : `
        <tr>
          <td style="padding-bottom: 16px; font-size: 0; line-height: 0;">&nbsp;</td>
        </tr>`;

  const logoBlock = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" width="140" alt="${escapeHtml(brand.productName)}" class="fluid" style="width: 140px; max-width: 140px; height: auto;" />`
    : `<span class="text-primary" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 700; color: ${primary};">${escapeHtml(brand.productName)}</span>`;

  const footerNote = input.footerNote
    ? escapeHtml(input.footerNote)
    : `You received this email because of activity on your ${escapeHtml(brand.productName)} account.`;

  const support = brand.supportEmail
    ? `<a href="mailto:${escapeHtml(brand.supportEmail)}" style="color: ${primary}; text-decoration: underline;">${escapeHtml(brand.supportEmail)}</a>`
    : "";

  // Preheader: hidden preview text (mobile inbox)
  const preheader = `
    <div style="display: none; font-size: 1px; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all;">
      ${escapeHtml(input.preheader)}
      ${"&nbsp;&zwnj;".repeat(30)}
    </div>`.trim();

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escapeHtml(input.title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style>
    table { border-collapse: collapse; }
    td, th, div, p, a, h1, h2, h3, h4, h5, h6 { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
  <style type="text/css">
${mobileEmailHeadStyles}
  </style>
</head>
<body id="body" class="email-bg" style="margin: 0; padding: 0; width: 100%; background-color: #f4f6f8;">
  ${preheader}
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="email-bg" style="background-color: #f4f6f8;">
    <tr>
      <td align="center" valign="top" style="padding: 24px 12px;">
        <!--[if mso]>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${EMAIL_MAX_WIDTH}" align="center"><tr><td>
        <![endif]-->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${EMAIL_MAX_WIDTH}" class="email-container card-bg" style="margin: 0 auto; width: 100%; max-width: ${EMAIL_MAX_WIDTH}px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;" >
          <!-- Header -->
          <tr>
            <td align="left" class="mobile-padding" style="padding: 28px 32px 12px 32px;">
              ${logoBlock}
            </td>
          </tr>
          <!-- Title -->
          <tr>
            <td class="h1-mobile text-primary mobile-padding" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 26px; line-height: 34px; font-weight: 700; color: #1a202c; padding: 12px 32px 8px 32px;">
              ${escapeHtml(input.title)}
            </td>
          </tr>
          <!-- Greeting -->
          <tr>
            <td class="body-mobile text-primary mobile-padding" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; line-height: 24px; color: #1a202c; padding: 8px 32px 8px 32px;">
              ${escapeHtml(greeting)}
            </td>
          </tr>
          ${paragraphsHtml}
          ${ctaBlock}
          ${secondaryCtaBlock}
          ${input.extraRowsHtml ?? ""}
          <!-- Divider -->
          <tr>
            <td class="mobile-padding border-muted" style="padding: 0 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="border-top: 1px solid #e2e8f0; height: 1px; font-size: 0; line-height: 0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="mobile-padding text-secondary" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 20px; color: #718096; padding: 20px 32px 28px 32px;">
              <p style="margin: 0 0 8px 0;">${footerNote}</p>
              ${support ? `<p style="margin: 0 0 8px 0;">Need help? ${support}</p>` : ""}
              ${brand.footerAddress ? `<p style="margin: 0; color: #a0aec0;">${escapeHtml(brand.footerAddress)}</p>` : ""}
              <p style="margin: 12px 0 0 0; color: #a0aec0;">&copy; ${new Date().getFullYear()} ${escapeHtml(brand.productName)}. All rights reserved.</p>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildPlainTextEmail(input: EmailTemplateInput): string {
  const brand = { ...defaultBrand, ...input.brand };
  const lines: string[] = [
    input.title,
    "",
    input.greeting ?? "Hi,",
    "",
    ...input.paragraphs,
  ];
  if (input.cta) {
    lines.push("", `${input.cta.label}: ${input.cta.href}`);
  }
  if (input.secondaryCta) {
    lines.push(`${input.secondaryCta.label}: ${input.secondaryCta.href}`);
  }
  lines.push(
    "",
    input.footerNote ??
      `You received this email because of activity on your ${brand.productName} account.`,
    brand.supportEmail ? `Support: ${brand.supportEmail}` : "",
    "",
    `© ${new Date().getFullYear()} ${brand.productName}`
  );
  return lines.filter((l) => l !== undefined).join("\n");
}

/* -------------------------------------------------------------------------- */
/* Domain templates — mobile-optimized wrappers                                */
/* -------------------------------------------------------------------------- */

export function welcomeEmail(opts: {
  userName: string;
  verifyUrl: string;
  brand?: EmailBrand;
}): { subject: string; html: string; text: string } {
  const input: EmailTemplateInput = {
    preheader: "Confirm your email to activate your PhishSimAI workspace.",
    title: "Welcome aboard",
    greeting: `Hi ${opts.userName},`,
    paragraphs: [
      "Thanks for signing up. Confirm your email to activate your workspace and start running awareness simulations.",
      "This link expires in 24 hours. If you did not create an account, you can ignore this message.",
    ],
    cta: { label: "Verify email", href: opts.verifyUrl },
    brand: opts.brand,
  };
  return {
    subject: `Welcome to ${opts.brand?.productName ?? defaultBrand.productName}`,
    html: buildMobileOptimizedEmail(input),
    text: buildPlainTextEmail(input),
  };
}

export function passwordResetEmail(opts: {
  userName: string;
  resetUrl: string;
  brand?: EmailBrand;
}): { subject: string; html: string; text: string } {
  const input: EmailTemplateInput = {
    preheader: "Reset your password — link expires in 60 minutes.",
    title: "Reset your password",
    greeting: `Hi ${opts.userName},`,
    paragraphs: [
      "We received a request to reset your password. Tap the button below to choose a new one.",
      "The link expires in 60 minutes. If you did not request this, no action is needed — your password will stay the same.",
    ],
    cta: { label: "Reset password", href: opts.resetUrl },
    brand: opts.brand,
  };
  return {
    subject: "Reset your password",
    html: buildMobileOptimizedEmail(input),
    text: buildPlainTextEmail(input),
  };
}

export function campaignInviteEmail(opts: {
  recipientName: string;
  organizationName: string;
  campaignName: string;
  actionUrl: string;
  brand?: EmailBrand;
}): { subject: string; html: string; text: string } {
  const input: EmailTemplateInput = {
    preheader: `${opts.organizationName} invited you to a security awareness module.`,
    title: "Security awareness training",
    greeting: `Hi ${opts.recipientName},`,
    paragraphs: [
      `${opts.organizationName} assigned you “${opts.campaignName}”. Complete it on any device — it only takes a few minutes.`,
      "Your progress is saved automatically. Use the button below to open the module on your phone or desktop.",
    ],
    cta: { label: "Open training", href: opts.actionUrl },
    brand: opts.brand,
  };
  return {
    subject: `Action required: ${opts.campaignName}`,
    html: buildMobileOptimizedEmail(input),
    text: buildPlainTextEmail(input),
  };
}

export function invoiceReceiptEmail(opts: {
  userName: string;
  amountLabel: string;
  invoiceUrl: string;
  periodLabel: string;
  brand?: EmailBrand;
}): { subject: string; html: string; text: string } {
  const input: EmailTemplateInput = {
    preheader: `Receipt for ${opts.amountLabel} — ${opts.periodLabel}.`,
    title: "Payment received",
    greeting: `Hi ${opts.userName},`,
    paragraphs: [
      `We received your payment of ${opts.amountLabel} for ${opts.periodLabel}. Thank you for your business.`,
      "A PDF copy of your invoice is available from the link below. You can also find past invoices in Billing on mobile or desktop.",
    ],
    cta: { label: "View invoice", href: opts.invoiceUrl },
    brand: opts.brand,
  };
  return {
    subject: `Receipt — ${opts.amountLabel}`,
    html: buildMobileOptimizedEmail(input),
    text: buildPlainTextEmail(input),
  };
}

export function mspClientReportEmail(opts: {
  contactName: string;
  mspName: string;
  reportTitle: string;
  reportUrl: string;
  summaryLine: string;
  brand?: EmailBrand;
}): { subject: string; html: string; text: string } {
  const input: EmailTemplateInput = {
    preheader: opts.summaryLine,
    title: opts.reportTitle,
    greeting: `Hi ${opts.contactName},`,
    paragraphs: [
      `${opts.mspName} shared an updated security awareness report with you.`,
      opts.summaryLine,
      "Open the report on your phone or desktop. Charts reflow for narrow screens automatically.",
    ],
    cta: { label: "View report", href: opts.reportUrl },
    brand: opts.brand,
  };
  return {
    subject: opts.reportTitle,
    html: buildMobileOptimizedEmail(input),
    text: buildPlainTextEmail(input),
  };
}

/**
 * Helper for call sites that previously concatenated raw HTML.
 * Wraps arbitrary safe body HTML in the mobile shell (title + CTA optional).
 */
export function wrapInMobileShell(opts: {
  preheader: string;
  title: string;
  bodyHtml: string;
  cta?: CtaButton;
  brand?: EmailBrand;
}): string {
  return buildMobileOptimizedEmail({
    preheader: opts.preheader,
    title: opts.title,
    paragraphs: [],
    cta: opts.cta,
    extraRowsHtml: `
      <tr>
        <td class="body-mobile mobile-padding" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; line-height: 24px; color: #4a5568; padding: 0 32px 16px 32px;">
          ${opts.bodyHtml}
        </td>
      </tr>`,
    brand: opts.brand,
  });
}