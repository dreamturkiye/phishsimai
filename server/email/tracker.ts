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

function landingHtml(token: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Security Awareness Training</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px;max-width:540px;width:100%;border:1px solid #334155;text-align:center}.icon{font-size:64px;margin-bottom:16px}h1{font-size:24px;font-weight:700;color:#f8fafc;margin-bottom:12px}p{font-size:15px;line-height:1.7;color:#94a3b8;margin-bottom:16px}.badge{display:inline-block;background:#6366f1;color:#fff;padding:6px 16px;border-radius:9999px;font-size:13px;font-weight:600;margin-bottom:24px}.btn{display:inline-block;background:#dc2626;color:#fff;border:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none}.tips{background:#0f172a;border-radius:12px;padding:20px;margin-top:28px;text-align:left}.tips h3{font-size:14px;font-weight:600;color:#6366f1;margin-bottom:12px}.tips ul{list-style:none}.tips li{font-size:13px;color:#94a3b8;padding:4px 0 4px 20px;position:relative}.tips li::before{content:"\u2192";position:absolute;left:0;color:#6366f1}.footer{margin-top:24px;font-size:12px;color:#475569}</style></head><body><div class="card"><div class="icon">\u26a0\ufe0f</div><div class="badge">Security Awareness Training</div><h1>You Clicked a Simulated Phishing Link</h1><p>This was a <strong style="color:#f8fafc">simulated phishing test</strong> by your organization using PhishSim AI. No real data was collected and no harm was done.</p><p>Real phishing attacks look exactly like this. Your security team sent this to help you recognize the signs.</p><form method="POST" action="/api/report/${token}" style="margin:0"><button type="submit" class="btn">Report as Phishing Test</button></form><div class="tips"><h3>How to spot phishing emails:</h3><ul><li>Check the sender email address carefully</li><li>Hover links before clicking to see the real URL</li><li>Be suspicious of urgency or unusual requests</li><li>Verify unexpected requests by phone before acting</li><li>Use your company phish-report button in Outlook</li></ul></div><p class="footer">Powered by <a href="https://phishsimai.com" style="color:#6366f1">PhishSim AI</a></p></div></body></html>`;
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
