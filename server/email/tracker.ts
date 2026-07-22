import type { Express } from "express";
import { trackEvent } from "../db";
import { captureServerError } from "../os/sentryServer";

// PS-TRACK-01 (2026-07-22): these writes were wrapped in `catch(e){}` — a failed open/click
// write was discarded in total silence while the user still got a 200 and a redirect, so the
// event simply never happened as far as the product was concerned. Log AND capture; still
// never fail the response (a broken tracking write must not break the recipient's experience).
function trackFailed(event: string, token: string, e: unknown): void {
  console.error(`[tracker] ${event} write FAILED for token ${token.slice(0, 8)}…:`, e);
  captureServerError(e, { scope: "tracker", event });
}

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7","base64");

// SECURITY (D3): tracking tokens are nanoid(32) from the URL-safe alphabet.
// Validate the :token route param against that alphabet to prevent reflected XSS /
// path injection via crafted /landing/:token URLs. Anything else is rejected.
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

// PS-LANDING-COPY-01 (Option A): the old page read "explanation -> (orphan button) -> tips" and
// said "no harm was done", which reads as "you're done" \u2014 so users never pressed the one button
// the whole product exists to train. Reframed to: you clicked -> DO THIS NOW (report) -> spot it
// next time. The report form is the unmistakable primary action; the tips are demoted below it.
function landingHtml(token: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Security Awareness Training</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px;max-width:540px;width:100%;border:1px solid #334155;text-align:center}.icon{font-size:64px;margin-bottom:16px}h1{font-size:24px;font-weight:700;color:#f8fafc;margin-bottom:12px}p{font-size:15px;line-height:1.7;color:#94a3b8;margin-bottom:16px}.badge{display:inline-block;background:#6366f1;color:#fff;padding:6px 16px;border-radius:9999px;font-size:13px;font-weight:600;margin-bottom:24px}.cta{background:#0b1220;border:1px solid #3b4a63;border-radius:12px;padding:22px;margin:24px 0}.cta .step{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#818cf8;margin-bottom:8px}.cta .ask{font-size:15px;line-height:1.6;color:#e2e8f0;margin-bottom:18px}.btn{display:inline-block;background:#dc2626;color:#fff;border:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer;text-decoration:none}.tips{border-top:1px solid #334155;padding-top:20px;margin-top:28px;text-align:left}.tips h3{font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}.tips ul{list-style:none}.tips li{font-size:12px;color:#64748b;padding:3px 0 3px 18px;position:relative}.tips li::before{content:"\u2192";position:absolute;left:0;color:#475569}.footer{margin-top:20px;font-size:12px;color:#475569}</style></head><body><div class="card"><div class="icon">\u26a0\ufe0f</div><div class="badge">Security Awareness Training</div><h1>This Was a Simulated Phishing Test</h1><p>You clicked a link in a <strong style="color:#f8fafc">simulated phishing email</strong> from your security team. No real data was collected \u2014 but a real attacker would have had you.</p><div class="cta"><div class="step">One more step</div><div class="ask">Report it. Click below to report this email as phishing \u2014 exactly what you'd do with a real one.</div><form method="POST" action="/api/report/${token}" style="margin:0"><button type="submit" class="btn">Report This Email \u2192</button></form></div><div class="tips"><h3>How to spot the next one</h3><ul><li>Check the sender's email address carefully</li><li>Hover links before clicking to see the real URL</li><li>Be suspicious of urgency or unusual requests</li><li>Verify unexpected requests by phone before acting</li><li>Use your company phish-report button in Outlook</li></ul></div><p class="footer">Powered by <a href="https://phishsimai.com" style="color:#6366f1">PhishSim AI</a></p></div></body></html>`;
}

// Confirmation page after the report form posts. `ok=false` says so plainly rather than
// thanking the user for something we failed to record.
function reportHtml(ok: boolean): string {
  const icon = ok ? "✅" : "⚠️";
  const title = ok ? "Thank You — Report Received" : "We Could Not Record Your Report";
  const body = ok
    ? "You correctly identified a simulated phishing email and reported it. That is exactly the right response — doing the same with a real attack protects your whole organization."
    : "Something went wrong saving your report. You did the right thing by reporting it — please tell your security team directly so it still gets logged.";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px;max-width:540px;width:100%;border:1px solid #334155;text-align:center}.icon{font-size:64px;margin-bottom:16px}h1{font-size:24px;font-weight:700;color:#f8fafc;margin-bottom:12px}p{font-size:15px;line-height:1.7;color:#94a3b8}.footer{margin-top:24px;font-size:12px;color:#475569}</style></head><body><div class="card"><div class="icon">${icon}</div><h1>${title}</h1><p>${body}</p><p class="footer">Powered by <a href="https://phishsimai.com" style="color:#6366f1">PhishSim AI</a></p></div></body></html>`;
}

export function registerTrackingRoutes(app: Express): void {
  app.get("/t/:token", async (req, res) => {
    try { if (TOKEN_RE.test(req.params.token)) await trackEvent(req.params.token,"open",{ip:req.ip??"" ,ua:req.headers["user-agent"]??""}); } catch(e){ trackFailed("open", req.params.token, e); }
    res.set("Content-Type","image/gif").set("Cache-Control","no-store").send(GIF);
  });
  app.get("/c/:token", async (req, res) => {
    if (!TOKEN_RE.test(req.params.token)) { res.status(404).send("Not found"); return; }
    try { await trackEvent(req.params.token,"click",{ip:req.ip??"" ,ua:req.headers["user-agent"]??""}); } catch(e){ trackFailed("click", req.params.token, e); }
    res.redirect(302, "/landing/"+req.params.token);
  });
  app.get("/landing/:token", (req, res) => {
    if (!TOKEN_RE.test(req.params.token)) { res.status(404).send("Not found"); return; }
    res.set("Content-Type","text/html").send(landingHtml(req.params.token));
  });
  // PS-TRACK-01: the landing page's "Report" control renders as a FORM POST, not an <a href>.
  // It used to be an anchor (a GET) pointed at this POST-only route, so the one positive
  // behaviour the product exists to train — reporting the phish — answered 404 and could never
  // set reportedAt. Kept POST-only deliberately: GET is prefetched by mail clients and security
  // scanners, which would silently mark targets as having reported when they never did.
  app.post("/api/report/:token", async (req, res) => {
    if (!TOKEN_RE.test(req.params.token)) { res.status(400).send(reportHtml(false)); return; }
    let ok = true;
    try { await trackEvent(req.params.token,"report"); } catch(e){ ok = false; trackFailed("report", req.params.token, e); }
    // Answer in the content type the caller asked for: a browser form post wants a page,
    // an API/XHR caller wants JSON. Never report success when the write failed.
    if ((req.headers.accept ?? "").includes("application/json")) {
      res.status(ok ? 200 : 500).json(ok
        ? { success: true, message: "Report submitted. Thank you for protecting your organization!" }
        : { success: false, message: "We could not record your report. Please tell your security team directly." });
      return;
    }
    res.status(ok ? 200 : 500).set("Content-Type","text/html").send(reportHtml(ok));
  });
}
