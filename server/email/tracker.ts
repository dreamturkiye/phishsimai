import type { Express } from "express";
import { momentFor, lessonHtml } from './learningMoments';
import { trackEvent, getAttackTypeForToken, assignTrainingForToken, completeTrainingForToken } from "../db";
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
function landingHtml(token: string, lessonBlock: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Security Awareness Training</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px;max-width:540px;width:100%;border:1px solid #334155;text-align:center}.icon{font-size:64px;margin-bottom:16px}h1{font-size:24px;font-weight:700;color:#f8fafc;margin-bottom:12px}p{font-size:15px;line-height:1.7;color:#94a3b8;margin-bottom:16px}.badge{display:inline-block;background:#6366f1;color:#fff;padding:6px 16px;border-radius:9999px;font-size:13px;font-weight:600;margin-bottom:24px}.cta{background:#0b1220;border:1px solid #3b4a63;border-radius:12px;padding:22px;margin:24px 0}.cta .step{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#818cf8;margin-bottom:8px}.cta .ask{font-size:15px;line-height:1.6;color:#e2e8f0;margin-bottom:18px}.btn{display:inline-block;background:#dc2626;color:#fff;border:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer;text-decoration:none}.tips{border-top:1px solid #334155;padding-top:20px;margin-top:28px;text-align:left}.tips h3{font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}.tips ul{list-style:none}.tips li{font-size:12px;color:#64748b;padding:3px 0 3px 18px;position:relative}.tips li::before{content:"\u2192";position:absolute;left:0;color:#475569}.footer{margin-top:20px;font-size:12px;color:#475569}.lm-frame{font-size:15px;line-height:1.6;color:#e2e8f0;margin:18px 0}.lm-email{background:#0b1220;border:1px solid #3b4a63;border-radius:8px;padding:12px 14px;margin:0 0 8px;text-align:left}.lm-meta{font-size:12px;color:#94a3b8;padding:2px 0}.lm-habit{border-top:1px solid #334155;margin-top:18px;padding-top:14px;font-size:13px;color:#cbd5e1;text-align:left;line-height:1.6}</style></head><body><div class="card"><div class="icon">\u26a0\ufe0f</div><div class="badge">Security Awareness Training</div><h1>This Was a Simulated Phishing Test</h1><p>You clicked a link in a <strong style="color:#f8fafc">simulated phishing email</strong> from your security team. No real data was collected \u2014 but a real attacker would have had you.</p><div class="cta"><div class="step">One more step</div><div class="ask">Report it. Click below to report this email as phishing \u2014 exactly what you'd do with a real one.</div><form method="POST" action="/api/report/${token}" style="margin:0"><button type="submit" class="btn">Report This Email \u2192</button></form><form method="POST" action="/api/training-complete/${token}" style="margin:14px 0 0"><button type="submit" style="background:#334155;color:#e2e8f0;border:1px solid #475569;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">I have reviewed this training \u2192</button></form></div>${lessonBlock}<p class="footer">Powered by <a href="https://phishsimai.com" style="color:#6366f1">PhishSim AI</a></p></div></body></html>`;
}

// ─── PS-CREDPAGE-01: the fake login page ─────────────────────────────────────
//
// PhishSim is sold as phishing SIMULATION and credential_harvest is the core measured behaviour,
// but the click path terminated at a training page with no form — so credentialSubmittedAt was
// structurally always NULL and a template labelled "credential_harvest" harvested nothing. This
// closes that gap the only defensible way, the way KnowBe4/Proofpoint do it.
//
// THE HARD CONSTRAINT, and how the CODE enforces it (not a comment promising to):
//   The password <input> has NO `name` attribute. A browser only submits fields that HAVE a
//   name, so the typed password is never placed in the request body — there is nothing for the
//   server to read because nothing was sent. The form posts a single fixed marker field and
//   nothing else. This is stronger than "the server chooses not to log it": the value does not
//   leave the browser at all. The submit handler (below) reads ONLY req.params.token and never
//   touches req.body, and a test asserts a posted password value is absent server-side.
//
// The email field keeps its name so the page looks real and the recipient sees their own address
// pre-filled — an email address in a phishing sim is not a secret we are avoiding capturing; a
// PASSWORD is. We record the same three facts KnowBe4 records: that a submission occurred, on
// which target, in which campaign — via the existing campaign_results row keyed by the token.
function loginHtml(token: string): string {
  // Note the password input: type=password, NO name= — deliberately un-submittable.
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',-apple-system,sans-serif;background:#f3f2f1;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.box{background:#fff;width:100%;max-width:440px;padding:44px;box-shadow:0 2px 6px rgba(0,0,0,.12)}.logo{display:flex;align-items:center;gap:6px;margin-bottom:20px}.logo span{width:22px;height:22px;display:inline-block}.logo .r{background:#f25022}.logo .g{background:#7fba00}.logo .b{background:#00a4ef}.logo .y{background:#ffb900}.logo b{font-size:15px;color:#5e5e5e;margin-left:4px}h1{font-size:24px;font-weight:600;color:#1b1b1b;margin-bottom:20px}label{display:block;font-size:13px;color:#1b1b1b;margin:14px 0 4px}input{width:100%;border:none;border-bottom:1px solid #666;padding:6px 0;font-size:15px;outline:none}input:focus{border-bottom:2px solid #0067b8}.row{display:flex;justify-content:flex-end;margin-top:28px}button{background:#0067b8;color:#fff;border:none;padding:8px 28px;font-size:15px;cursor:pointer}.foot{margin-top:22px;font-size:13px;color:#0067b8}</style></head><body><div class="box"><div class="logo"><span class="r"></span><span class="g"></span><span class="b"></span><span class="y"></span><b>Microsoft</b></div><h1>Sign in</h1><form method="POST" action="/submit/${token}" autocomplete="off"><label>Email or phone</label><input type="email" name="email" value="" autofocus><label>Password</label><input type="password"><input type="hidden" name="submitted" value="1"><div class="row"><button type="submit">Sign in</button></div></form><div class="foot">Can't access your account?</div></div></body></html>`;
}

// Confirmation page after the report form posts. `ok=false` says so plainly rather than
// thanking the user for something we failed to record.
function simplePage(icon: string, title: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px;max-width:540px;width:100%;border:1px solid #334155;text-align:center}.icon{font-size:64px;margin-bottom:16px}h1{font-size:24px;font-weight:700;color:#f8fafc;margin-bottom:12px}p{font-size:15px;line-height:1.7;color:#94a3b8}.footer{margin-top:24px;font-size:12px;color:#475569}</style></head><body><div class="card"><div class="icon">${icon}</div><h1>${title}</h1><p>${body}</p><p class="footer">Powered by <a href="https://phishsimai.com" style="color:#6366f1">PhishSim AI</a></p></div></body></html>`;
}

function reportHtml(ok: boolean, reportCount?: number | null): string {
  if (!ok) {
    return simplePage("\u26a0\ufe0f", "We Could Not Record Your Report",
      "Something went wrong saving your report. You did the right thing by reporting it — please tell your security team directly so it still gets logged.");
  }
  // PS-REPORT-UX-01 — positive reinforcement. Reporting is the ONE behaviour the product exists to
  // build, so the success page celebrates it. The count shown is the REAL running reportCount from
  // gamification, never a fabricated points number; it is omitted when not resolvable.
  const streak = typeof reportCount === "number" && reportCount > 0
    ? `<div class="rp-count">\ud83c\udfc5 That's <strong>${reportCount}</strong> phishing ${reportCount === 1 ? "email" : "emails"} you've reported</div>`
    : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nice catch!</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;overflow:hidden}.card{background:#1e293b;border-radius:16px;padding:44px 40px;max-width:520px;width:100%;border:1px solid #334155;text-align:center;position:relative}.pop{font-size:72px;margin-bottom:8px;animation:pop .5s ease-out}@keyframes pop{0%{transform:scale(0)}70%{transform:scale(1.2)}100%{transform:scale(1)}}h1{font-size:26px;font-weight:800;color:#f8fafc;margin-bottom:10px}.sub{font-size:15px;line-height:1.7;color:#cbd5e1;margin-bottom:18px}.rp-count{display:inline-block;background:#065f46;color:#d1fae5;padding:10px 20px;border-radius:9999px;font-size:14px;margin:6px 0 4px}.why{border-top:1px solid #334155;margin-top:22px;padding-top:16px;font-size:13px;color:#94a3b8;line-height:1.6}.footer{margin-top:18px;font-size:12px;color:#475569}.confetti{position:absolute;top:-10px;width:8px;height:8px;opacity:.9;animation:fall 2.2s linear forwards}@keyframes fall{to{transform:translateY(320px) rotate(360deg);opacity:0}}</style></head><body><div class="card">${[..."0123456789"].map((n,i)=>`<span class="confetti" style="left:${8+i*9}%;background:${["#6366f1","#22c55e","#f59e0b","#ec4899"][i%4]};animation-delay:${i*0.12}s"></span>`).join("")}<div class="pop">\ud83c\udf89</div><h1>Nice catch!</h1><p class="sub">You reported a simulated phishing email — <strong style="color:#f8fafc">exactly the right move</strong>. Doing this with a real attack protects your whole organization.</p>${streak}<div class="why">Reporting is the single most valuable habit in security awareness. Every report you send helps your security team spot real attacks faster.</div><p class="footer">Powered by <a href="https://phishsimai.com" style="color:#6366f1">PhishSim AI</a></p></div></body></html>`;
}

export function registerTrackingRoutes(app: Express): void {
  app.get("/t/:token", async (req, res) => {
    try { if (TOKEN_RE.test(req.params.token)) await trackEvent(req.params.token,"open",{ip:req.ip??"" ,ua:req.headers["user-agent"]??""}); } catch(e){ trackFailed("open", req.params.token, e); }
    res.set("Content-Type","image/gif").set("Cache-Control","no-store").send(GIF);
  });
  app.get("/c/:token", async (req, res) => {
    if (!TOKEN_RE.test(req.params.token)) { res.status(404).send("Not found"); return; }
    try { await trackEvent(req.params.token,"click",{ip:req.ip??"" ,ua:req.headers["user-agent"]??""}); } catch(e){ trackFailed("click", req.params.token, e); }
    // PS-REMEDIATION-01: a click IS the failure — auto-enroll the target in the matching module.
    // Best-effort: assignTrainingForToken never throws and never blocks the recipient response.
    assignTrainingForToken(req.params.token, "sim_click").catch(() => {});
    // PS-CREDPAGE-01: a credential_harvest simulation shows the fake login page — the behaviour
    // this product measures. Everything else (link_click, attachment, …) goes straight to
    // training, exactly as before. A lookup failure defaults to training: we never show a
    // recipient a login form because a DB read hiccuped.
    let attackType: string | null = null;
    try { attackType = await getAttackTypeForToken(req.params.token); } catch(e){ trackFailed("attacktype", req.params.token, e); }
    if (attackType === "credential_harvest") {
      res.set("Content-Type","text/html").set("Cache-Control","no-store").send(loginHtml(req.params.token));
      return;
    }
    res.redirect(302, "/landing/"+req.params.token);
  });
  app.get("/landing/:token", async (req, res) => {
    if (!TOKEN_RE.test(req.params.token)) { res.status(404).send("Not found"); return; }
    // PS-LEARNING-CONTENT-01: render the lesson for the SPECIFIC lure this token belongs to — the
    // attack-type red flags + the real sender/subject the recipient received — not generic tips.
    let block: string;
    try {
      const { getLessonContextForToken } = await import("../db");
      const ctx = await getLessonContextForToken(req.params.token);
      block = lessonHtml(momentFor(ctx.attackType), { senderName: ctx.senderName, subject: ctx.subject });
    } catch {
      block = lessonHtml(momentFor(null), {}); // fail to the safe default, never a broken page
    }
    res.set("Content-Type","text/html").send(landingHtml(req.params.token, block));
  });
  // PS-CREDPAGE-01: the fake login "Sign in" posts here. This handler is the enforcement point
  // for the no-credential-capture constraint, and it is deliberately tiny:
  //   • it reads req.params.token and NOTHING from req.body — the password has no name attribute
  //     so it was never in the body to begin with, but we also structurally never look;
  //   • it records the SAME event a real submit would (credentialSubmittedAt on the token's row),
  //     which is the fact the product needs: a submission occurred, for this target, this campaign;
  //   • then it sends the recipient to the identical training page the report flow uses, so the
  //     teachable moment is the same whether they clicked or "logged in".
  // No password field value is read, logged, or persisted — asserted by credPage.test.ts.
  app.post("/submit/:token", async (req, res) => {
    if (!TOKEN_RE.test(req.params.token)) { res.status(404).send("Not found"); return; }
    try { await trackEvent(req.params.token,"submit",{ip:req.ip??"" ,ua:req.headers["user-agent"]??""}); } catch(e){ trackFailed("submit", req.params.token, e); }
    // PS-REMEDIATION-01: a credential submit is the worst failure — enroll (idempotent with the
    // click enroll: the 0023 open-unique index makes the second call inert).
    assignTrainingForToken(req.params.token, "sim_submit").catch(() => {});
    // A GET would be prefetched by mail scanners; this is only ever reached by a real form POST,
    // and it redirects to training so the recipient lands where a clicker lands.
    res.redirect(302, "/landing/"+req.params.token);
  });
  // PS-TRACK-01: the landing page's "Report" control renders as a FORM POST, not an <a href>.
  // It used to be an anchor (a GET) pointed at this POST-only route, so the one positive
  // behaviour the product exists to train — reporting the phish — answered 404 and could never
  // set reportedAt. Kept POST-only deliberately: GET is prefetched by mail clients and security
  // scanners, which would silently mark targets as having reported when they never did.
  // PS-LEARNING-COMPLETE-01 — the on-click micro-lesson's DELIBERATE completion action. POST-only,
  // exactly like report: a GET would be prefetched by mail scanners and would mark targets complete
  // who never acknowledged the training. Stamps their open training_assignment complete.
  app.post("/api/training-complete/:token", async (req, res) => {
    if (!TOKEN_RE.test(req.params.token)) { res.status(400).json({ ok: false }); return; }
    let done = false;
    try { done = await completeTrainingForToken(req.params.token); } catch(e){ trackFailed("training_complete", req.params.token, e); }
    // Honest response: only "complete" when a real assignment was stamped. No open assignment (they
    // reached the lesson without an enrollment) is reported as such, never as a false completion.
    const wantsJson = (req.headers["accept"] || "").includes("application/json");
    if (wantsJson) { res.json({ ok: true, completed: done }); return; }
    res.set("Content-Type","text/html").send(simplePage(
      done ? "\u2705" : "\u2139\ufe0f",
      done ? "Training complete" : "Recorded",
      done ? "Thanks — this awareness training is now marked complete for you." : "Thanks for reviewing. There was no open training assignment to complete.",
    ));
  });

  app.post("/api/report/:token", async (req, res) => {
    if (!TOKEN_RE.test(req.params.token)) { res.status(400).send(reportHtml(false)); return; }
    let ok = true;
    let reportCount: number | null = null;
    // The report SUCCEEDS on trackEvent alone. ok reflects only whether the report was recorded.
    try { await trackEvent(req.params.token,"report"); } catch(e){ ok = false; trackFailed("report", req.params.token, e); }
    // The gamification credit + the celebration count are a best-effort BONUS — a failure here must
    // never turn a recorded report into a failure, and never blocks the response.
    if (ok) {
      try {
        const { creditReportForToken } = await import("../db");
        reportCount = (await creditReportForToken(req.params.token))?.reportCount ?? null;
      } catch { /* count omitted; the report still stands */ }
    }
    // Answer in the content type the caller asked for: a browser form post wants a page,
    // an API/XHR caller wants JSON. Never report success when the write failed.
    if ((req.headers.accept ?? "").includes("application/json")) {
      res.status(ok ? 200 : 500).json(ok
        ? { success: true, message: "Report submitted. Thank you for protecting your organization!" }
        : { success: false, message: "We could not record your report. Please tell your security team directly." });
      return;
    }
    res.status(ok ? 200 : 500).set("Content-Type","text/html").send(reportHtml(ok, reportCount));
  });
}
