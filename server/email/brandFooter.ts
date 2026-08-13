// PS-BRAND-SIG-01: branded logo footer for WARM + TRANSACTIONAL email only
// (welcome, trial nudges, insurance pack, and replies to prospects who wrote in).
//
// Deliberately NOT used on the cold first touch: see server/os/abTest.ts (PS-COPY-PRICE-01) —
// cold stays plain-text/no-HTML so it lands in the primary inbox; a logo block reads as bulk and
// tanks deliverability. This footer is appended at the two warm/transactional send chokepoints
// (sendLifecycle in email/janet.ts, sendEmail in os/replyParser.ts), so every future
// warm/transactional email gets the logo without editing individual templates.
//
// Uses the on-white logo variant because the footer renders on the email client's default
// (light) background, below the message card. Logo is 667x128; width 160 keeps the ratio.
export const BRAND_LOGO_FOOTER =
  '<div style="max-width:600px;margin:18px auto 0;padding:0 8px;text-align:center;' +
  'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif">' +
  '<img src="https://phishsimai.com/brand/phishsim-logo-on-white.png" alt="PhishSim AI" ' +
  'width="160" style="display:inline-block;border:0;max-width:160px;height:auto">' +
  '<p style="margin:8px 0 0;font-size:12px;color:#94a3b8;line-height:1.5">' +
  'Phishing simulation &amp; compliance, built for MSPs &middot; ' +
  '<a href="https://phishsimai.com" style="color:#6366f1;text-decoration:none">phishsimai.com</a>' +
  '</p></div>'
