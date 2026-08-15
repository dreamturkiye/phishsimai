/**
 * Mobile optimization helpers for transactional + simulation email HTML.
 * Ensures templates render cleanly on iOS Mail, Gmail app, Outlook mobile.
 * Used by the verified deploy pipeline email template build step.
 */

export interface MobileEmailOptions {
  /** Max content width on desktop; fluid below this (default 600) */
  maxWidthPx?: number;
  /** Minimum tap target size in px (default 44, Apple HIG) */
  minTapTargetPx?: number;
  /** Prefers dark-mode aware meta + color-scheme */
  supportDarkMode?: boolean;
  /** Optional preheader text (hidden inbox preview) */
  preheader?: string;
}

const DEFAULTS: Required<Omit<MobileEmailOptions, "preheader">> & {
  preheader: string;
} = {
  maxWidthPx: 600,
  minTapTargetPx: 44,
  supportDarkMode: true,
  preheader: "",
};

/** Critical CSS inlined into every mobile-safe wrapper */
export function mobileCriticalCss(options: MobileEmailOptions = {}): string {
  const opts = { ...DEFAULTS, ...options };
  const w = opts.maxWidthPx;
  const tap = opts.minTapTargetPx;

  return `
/* reset */
body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; max-width: 100%; display: block; }
body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f4f4f5; }
a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }

/* fluid container */
.email-wrapper { width: 100% !important; background-color: #f4f4f5; }
.email-container { width: 100% !important; max-width: ${w}px !important; margin: 0 auto !important; background-color: #ffffff; }
.email-body { padding: 24px 20px !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.5; color: #18181b; }
.email-footer { padding: 16px 20px !important; font-size: 12px; line-height: 1.4; color: #71717a; text-align: center; }

/* typography */
.email-h1 { font-size: 24px !important; line-height: 1.3 !important; margin: 0 0 12px 0 !important; font-weight: 700; color: #09090b; }
.email-h2 { font-size: 18px !important; line-height: 1.35 !important; margin: 0 0 10px 0 !important; font-weight: 600; color: #18181b; }
.email-p { font-size: 16px !important; line-height: 1.5 !important; margin: 0 0 16px 0 !important; }
.email-small { font-size: 13px !important; line-height: 1.4 !important; color: #52525b; }

/* CTA — full-width on small screens via media query */
.email-btn { display: inline-block !important; padding: 14px 28px !important; min-height: ${tap}px; min-width: ${tap}px; font-size: 16px !important; font-weight: 600; line-height: 1.25 !important; text-align: center; text-decoration: none !important; border-radius: 8px; background-color: #2563eb; color: #ffffff !important; mso-padding-alt: 0; }
.email-btn-secondary { background-color: #e4e4e7; color: #18181b !important; }
.email-btn-wrap { margin: 24px 0 !important; }

/* stacks */
.email-stack { width: 100% !important; }
.email-stack-col { display: block !important; width: 100% !important; max-width: 100% !important; }

/* preheader (inbox preview, hidden in body) */
.email-preheader { display: none !important; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; max-height: 0; max-width: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; }

/* mobile breakpoints */
@media only screen and (max-width: 620px) {
  .email-container { width: 100% !important; max-width: 100% !important; }
  .email-body { padding: 20px 16px !important; }
  .email-footer { padding: 14px 16px !important; }
  .email-h1 { font-size: 22px !important; }
  .email-h2 { font-size: 17px !important; }
  .email-btn { display: block !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; padding: 16px 20px !important; }
  .email-btn-wrap { margin: 20px 0 !important; }
  .email-stack-col { display: block !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
  .email-hide-mobile { display: none !important; max-height: 0 !important; overflow: hidden !important; }
  u + .body .email-container { width: 100% !important; }
}

@media only screen and (max-width: 380px) {
  .email-body { padding: 16px 12px !important; }
  .email-h1 { font-size: 20px !important; }
  .email-p, .email-btn { font-size: 15px !important; }
}

${
  opts.supportDarkMode
    ? `
@media (prefers-color-scheme: dark) {
  body, .email-wrapper { background-color: #09090b !important; }
  .email-container { background-color: #18181b !important; }
  .email-body, .email-p, .email-h2 { color: #e4e4e7 !important; }
  .email-h1 { color: #fafafa !important; }
  .email-footer, .email-small { color: #a1a1aa !important; }
  .email-btn-secondary { background-color: #27272a !important; color: #fafafa !important; }
}
`
    : ""
}
`.trim();
}

/** Escape text for safe HTML insertion */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface WrapMobileEmailInput {
  /** Inner HTML (already built body content, no outer html/body) */
  bodyHtml: string;
  /** <title> and accessible label */
  title: string;
  options?: MobileEmailOptions;
  /** Extra head tags (e.g. og meta) */
  extraHead?: string;
  /** Footer HTML slot */
  footerHtml?: string;
}

/**
 * Wraps body HTML in a mobile-safe multipart-friendly document shell.
 * Tables + inline-friendly classes; MSO conditionals for Outlook desktop.
 */
export function wrapMobileEmail(input: WrapMobileEmailInput): string {
  const opts = { ...DEFAULTS, ...input.options };
  const title = escapeHtml(input.title);
  const preheader = opts.preheader ? escapeHtml(opts.preheader) : "";
  const css = mobileCriticalCss(opts);
  const footer =
    input.footerHtml ??
    `<p class="email-small" style="margin:0;">This message was sent by PhishSim AI. You are receiving it because of your organization&rsquo;s security awareness program.</p>`;

  const colorSchemeMeta = opts.supportDarkMode
    ? `<meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
  ${colorSchemeMeta}
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style>
    table { border-collapse: collapse; }
    td { font-family: Arial, Helvetica, sans-serif; }
  </style>
  <![endif]-->
  <style type="text/css">
${css}
  </style>
  ${input.extraHead ?? ""}
</head>
<body class="body" style="margin:0;padding:0;background-color:#f4f4f5;width:100%;">
  ${preheader ? `<div class="email-preheader">${preheader}</div>` : ""}
  <table role="presentation" class="email-wrapper" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:16px 8px;">
        <!--[if mso]>
        <table role="presentation" width="${opts.maxWidthPx}" cellpadding="0" cellspacing="0" border="0"><tr><td>
        <![endif]-->
        <table role="presentation" class="email-container" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${opts.maxWidthPx}px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td class="email-body" style="padding:24px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#18181b;">
              ${input.bodyHtml}
            </td>
          </tr>
          <tr>
            <td class="email-footer" style="padding:16px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.4;color:#71717a;text-align:center;border-top:1px solid #e4e4e7;">
              ${footer}
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

export interface CtaButtonInput {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
  /** MSO solid-button background (Outlook) */
  msoBg?: string;
}

/** Mobile-friendly CTA with Outlook VML fallback */
export function renderCtaButton(input: CtaButtonInput): string {
  const href = escapeHtml(input.href);
  const label = escapeHtml(input.label);
  const isSecondary = input.variant === "secondary";
  const bg = input.msoBg ?? (isSecondary ? "#e4e4e7" : "#2563eb");
  const fg = isSecondary ? "#18181b" : "#ffffff";
  const cls = isSecondary ? "email-btn email-btn-secondary" : "email-btn";

  return `
<div class="email-btn-wrap" style="margin:24px 0;">
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="17%" stroke="f" fillcolor="${bg}">
    <w:anchorlock/>
    <center style="color:${fg};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">
      ${label}
    </center>
  </v:roundrect>
  <![endif]-->
  <!--[if !mso]><!-- -->
  <a class="${cls}" href="${href}" target="_blank" rel="noopener noreferrer"
     style="display:inline-block;padding:14px 28px;min-height:44px;font-size:16px;font-weight:600;line-height:1.25;text-align:center;text-decoration:none;border-radius:8px;background-color:${bg};color:${fg};">
    ${label}
  </a>
  <!--<![endif]-->
</div>`.trim();
}

/** Fluid image block — never overflows narrow viewports */
export function renderFluidImage(src: string, alt: string, width = 560): string {
  const safeSrc = escapeHtml(src);
  const safeAlt = escapeHtml(alt);
  return `<img src="${safeSrc}" alt="${safeAlt}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none;" />`;
}

/**
 * Pipeline entry: normalize raw template HTML for mobile.
 * - Injects viewport + disable-reformatting if missing
 * - Ensures images are fluid
 * - Bumps small tap targets on anchor.button patterns
 */
export function optimizeEmailHtmlForMobile(
  html: string,
  options: MobileEmailOptions = {},
): string {
  let out = html;

  if (!/name=["']viewport["']/i.test(out)) {
    out = out.replace(
      /<head([^>]*)>/i,
      `<head$1>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />`,
    );
  }

  if (!/x-apple-disable-message-reformatting/i.test(out)) {
    out = out.replace(
      /<head([^>]*)>/i,
      `<head$1>\n  <meta name="x-apple-disable-message-reformatting" />`,
    );
  }

  // Fluid images: add max-width/height auto when missing
  out = out.replace(/<img\b([^>]*)>/gi, (full, attrs: string) => {
    if (/max-width\s*:/i.test(attrs) || /style\s*=/i.test(attrs) === false) {
      if (!/style\s*=/i.test(attrs)) {
        return `<img${attrs} style="display:block;max-width:100%;height:auto;border:0;" />`;
      }
    }
    if (/style\s*=\s*(["'])([\s\S]*?)\1/i.test(attrs)) {
      return full.replace(
        /style\s*=\s*(["'])([\s\S]*?)\1/i,
        (_m, q: string, style: string) => {
          let next = style;
          if (!/max-width/i.test(next)) next += ";max-width:100%";
          if (!/height\s*:/i.test(next)) next += ";height:auto";
          if (!/display\s*:/i.test(next)) next += ";display:block";
          return `style=${q}${next}${q}`;
        },
      );
    }
    return full;
  });

  // Inject critical CSS once before </head>
  if (!/email-container/.test(out) && /<\/head>/i.test(out)) {
    const css = mobileCriticalCss(options);
    out = out.replace(
      /<\/head>/i,
      `<style type="text/css">\n${css}\n</style>\n</head>`,
    );
  }

  return out;
}

/** Deploy-pipeline marker — CI asserts this module is importable and pure */
export const MOBILE_EMAIL_OPTIMIZATION_VERSION = "1.0.0" as const;

export default {
  mobileCriticalCss,
  wrapMobileEmail,
  renderCtaButton,
  renderFluidImage,
  optimizeEmailHtmlForMobile,
  escapeHtml,
  MOBILE_EMAIL_OPTIMIZATION_VERSION,
};