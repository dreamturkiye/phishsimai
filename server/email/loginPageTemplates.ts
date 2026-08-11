// ─── PS-LOGINPAGE-TEMPLATES-01: Simulated Login Page Templates ───────────────
//
// Before this, the fake "sign in" page shown on a credential_harvest click (see PS-CREDPAGE-01 in
// tracker.ts) was a single hardcoded Microsoft-style page. Real customers run mixed environments
// (Google Workspace shops, Okta SSO, internal portals) where a Microsoft skin doesn't match what
// employees actually see, which undermines the simulation's realism. This adds a small library of
// brand skins a campaign can pick from — the same idea as the email `templates` table, but for the
// post-click landing page instead of the lure email.
//
// THE HARD CONSTRAINT FROM PS-CREDPAGE-01 STILL APPLIES TO EVERY BRAND HERE:
//   the password <input> has NO `name` attribute, so a browser never submits it — there is nothing
//   for the server to read because nothing was sent. Every renderer below is hand-written (not
//   admin-editable arbitrary HTML) specifically so this invariant can't be broken by template
//   content; credPage.test.ts pins it for the default brand.
export type LoginPageBrand = "microsoft365" | "google_workspace" | "okta" | "generic_it";

export const LOGIN_PAGE_BRANDS: LoginPageBrand[] = ["microsoft365", "google_workspace", "okta", "generic_it"];

export const LOGIN_PAGE_TEMPLATE_META: { brand: LoginPageBrand; name: string; description: string }[] = [
  { brand: "microsoft365", name: "Microsoft 365", description: "Classic Microsoft sign-in page." },
  { brand: "google_workspace", name: "Google Workspace", description: "Google Account sign-in page." },
  { brand: "okta", name: "Okta SSO", description: "Okta single sign-on portal." },
  { brand: "generic_it", name: "Generic IT Portal", description: "Unbranded internal login portal." },
];

export function isLoginPageBrand(value: string | null | undefined): value is LoginPageBrand {
  return !!value && (LOGIN_PAGE_BRANDS as string[]).includes(value);
}

// Note the password input in every renderer below: type=password, NO name= — deliberately
// un-submittable. The email field keeps its name so the page looks real and prefills the
// recipient's own address; an email address in a phishing sim is not the secret we're avoiding
// capturing, a PASSWORD is.
function microsoft365Html(token: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',-apple-system,sans-serif;background:#f3f2f1;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.box{background:#fff;width:100%;max-width:440px;padding:44px;box-shadow:0 2px 6px rgba(0,0,0,.12)}.logo{display:flex;align-items:center;gap:6px;margin-bottom:20px}.logo span{width:22px;height:22px;display:inline-block}.logo .r{background:#f25022}.logo .g{background:#7fba00}.logo .b{background:#00a4ef}.logo .y{background:#ffb900}.logo b{font-size:15px;color:#5e5e5e;margin-left:4px}h1{font-size:24px;font-weight:600;color:#1b1b1b;margin-bottom:20px}label{display:block;font-size:13px;color:#1b1b1b;margin:14px 0 4px}input{width:100%;border:none;border-bottom:1px solid #666;padding:6px 0;font-size:15px;outline:none}input:focus{border-bottom:2px solid #0067b8}.row{display:flex;justify-content:flex-end;margin-top:28px}button{background:#0067b8;color:#fff;border:none;padding:8px 28px;font-size:15px;cursor:pointer}.foot{margin-top:22px;font-size:13px;color:#0067b8}</style></head><body><div class="box"><div class="logo"><span class="r"></span><span class="g"></span><span class="b"></span><span class="y"></span><b>Microsoft</b></div><h1>Sign in</h1><form method="POST" action="/submit/${token}" autocomplete="off"><label>Email or phone</label><input type="email" name="email" value="" autofocus><label>Password</label><input type="password"><input type="hidden" name="submitted" value="1"><div class="row"><button type="submit">Sign in</button></div></form><div class="foot">Can't access your account?</div></div></body></html>`;
}

function googleWorkspaceHtml(token: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in - Google Accounts</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Roboto,-apple-system,sans-serif;background:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.box{background:#fff;width:100%;max-width:450px;padding:48px 40px;border:1px solid #dadce0;border-radius:8px}.logo{font-size:24px;font-weight:500;margin-bottom:16px}.logo .g1{color:#4285F4}.logo .g2{color:#EA4335}.logo .g3{color:#FBBC05}.logo .g4{color:#34A853}h1{font-size:24px;font-weight:400;color:#202124;margin-bottom:8px}p.sub{font-size:16px;color:#202124;margin-bottom:24px}label{display:block;font-size:13px;color:#5f6368;margin:16px 0 4px}input{width:100%;border:1px solid #dadce0;border-radius:4px;padding:12px;font-size:16px;outline:none}input:focus{border-color:#1a73e8;border-width:2px}.row{display:flex;justify-content:flex-end;margin-top:32px}button{background:#1a73e8;color:#fff;border:none;padding:10px 24px;border-radius:4px;font-size:14px;font-weight:500;cursor:pointer}.foot{margin-top:24px;font-size:13px;color:#1a73e8}</style></head><body><div class="box"><div class="logo"><span class="g1">G</span><span class="g2">o</span><span class="g3">o</span><span class="g4">g</span><span class="g1">l</span><span class="g2">e</span></div><h1>Sign in</h1><p class="sub">Use your Google Workspace Account</p><form method="POST" action="/submit/${token}" autocomplete="off"><label>Email or phone</label><input type="email" name="email" value="" autofocus><label>Enter your password</label><input type="password"><input type="hidden" name="submitted" value="1"><div class="row"><button type="submit">Next</button></div></form><div class="foot">Forgot email?</div></div></body></html>`;
}

function oktaHtml(token: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign In</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,'Helvetica Neue',sans-serif;background:#eff2f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.box{background:#fff;width:100%;max-width:400px;padding:40px 44px;border-radius:6px;box-shadow:0 2px 12px rgba(0,0,0,.1);text-align:center}.logo{font-size:20px;font-weight:700;color:#00297a;margin-bottom:24px}label{display:block;text-align:left;font-size:13px;color:#333;margin:14px 0 4px;font-weight:600}input{width:100%;border:1px solid #ccd3da;border-radius:4px;padding:10px 12px;font-size:14px;outline:none}input:focus{border-color:#007dc1}.row{margin-top:24px}button{width:100%;background:#007dc1;color:#fff;border:none;padding:11px;border-radius:4px;font-size:14px;font-weight:600;cursor:pointer}.foot{margin-top:20px;font-size:13px;color:#007dc1}</style></head><body><div class="box"><div class="logo">okta</div><form method="POST" action="/submit/${token}" autocomplete="off"><label>Username</label><input type="email" name="email" value="" autofocus><label>Password</label><input type="password"><input type="hidden" name="submitted" value="1"><div class="row"><button type="submit">Sign In</button></div></form><div class="foot">Need help signing in?</div></div></body></html>`;
}

function genericItHtml(token: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Employee Portal Login</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,'Segoe UI',sans-serif;background:#1f2937;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.box{background:#fff;width:100%;max-width:400px;padding:36px;border-radius:8px}.logo{font-size:18px;font-weight:700;color:#111827;margin-bottom:4px}.sub{font-size:13px;color:#6b7280;margin-bottom:24px}label{display:block;font-size:13px;color:#374151;margin:14px 0 4px;font-weight:500}input{width:100%;border:1px solid #d1d5db;border-radius:6px;padding:10px 12px;font-size:14px;outline:none}input:focus{border-color:#2563eb}.row{margin-top:24px}button{width:100%;background:#2563eb;color:#fff;border:none;padding:11px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer}.foot{margin-top:18px;font-size:12px;color:#9ca3af;text-align:center}</style></head><body><div class="box"><div class="logo">Employee Portal</div><div class="sub">Sign in with your company account</div><form method="POST" action="/submit/${token}" autocomplete="off"><label>Email address</label><input type="email" name="email" value="" autofocus><label>Password</label><input type="password"><input type="hidden" name="submitted" value="1"><div class="row"><button type="submit">Log in</button></div></form><div class="foot">Trouble logging in? Contact IT support.</div></div></body></html>`;
}

const RENDERERS: Record<LoginPageBrand, (token: string) => string> = {
  microsoft365: microsoft365Html,
  google_workspace: googleWorkspaceHtml,
  okta: oktaHtml,
  generic_it: genericItHtml,
};

// Unknown/missing brand falls back to microsoft365 — the pre-existing default behavior, so a
// campaign that predates this feature (loginPageBrand not yet set) renders exactly as before.
export function renderLoginPage(brand: string | null | undefined, token: string): string {
  return (isLoginPageBrand(brand) ? RENDERERS[brand] : RENDERERS.microsoft365)(token);
}
