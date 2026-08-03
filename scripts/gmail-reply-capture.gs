/**
 * PS-REPLY-CAPTURE-02 — Gmail → PhishSim reply capture (Option B).
 *
 * WHY THIS EXISTS
 *   phishsimai.com MX points at smtp.google.com. Resend never receives inbound mail, so the
 *   already-built handler at /api/os/webhooks/resend-inbound could never fire — which is the
 *   entire reason ps_outreach_leads.replied has 0 rows against a known real reply.
 *   sarah@phishsimai.com is a "send mail as" identity on the kaan@phishsimai.com mailbox, so the
 *   replies are sitting in kaan@'s inbox. This polls that inbox and POSTs them to the existing
 *   handler. No DNS change, no app deploy, no new infrastructure.
 *
 * WHAT IT DOES NOT DO
 *   It does not reply, label anything as read that it failed to deliver, or process a thread
 *   twice. A POST that does not return ok:true leaves the thread untouched so the next run
 *   retries it. Losing a real prospect reply to a swallowed error is the failure mode this whole
 *   subsystem exists to remove.
 *
 * INSTALL — 3 steps
 *   1. script.google.com → New project → paste this file → set INBOUND_PASS below.
 *   2. Run `installTrigger` once (authorise when prompted). That creates the 5-minute timer.
 *   3. Run `testOne` once to verify end-to-end against the newest matching thread.
 *
 * The account running this MUST be kaan@phishsimai.com — it reads that mailbox.
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────
var ENDPOINT      = 'https://phishsimai.com/api/os/webhooks/resend-inbound';
var INBOUND_USER  = 'phishsim-inbound';   // must equal INBOUND_WEBHOOK_USER in Vercel
var INBOUND_PASS  = 'PASTE_INBOUND_WEBHOOK_PASS_HERE'; // must equal INBOUND_WEBHOOK_PASS in Vercel

// Threads addressed to the Sarah identity, not yet captured. `to:` matches To/Cc/Bcc headers, so a
// reply to sarah@ is caught whether the prospect hit Reply or wrote fresh. -label: is the idempotency
// key: we tag on success, so a thread is never processed twice even if it stays unread.
var SEARCH        = 'to:sarah@phishsimai.com -label:phishsim-captured newer_than:14d';
var LABEL_DONE    = 'phishsim-captured';
var LABEL_FAILED  = 'phishsim-capture-failed';
var MAX_PER_RUN   = 25;   // a burst cap; the next run picks up the remainder

// ─── MAIN ────────────────────────────────────────────────────────────────────
function captureReplies() {
  var doneLabel   = getOrCreateLabel_(LABEL_DONE);
  var failedLabel = getOrCreateLabel_(LABEL_FAILED);
  var threads = GmailApp.search(SEARCH, 0, MAX_PER_RUN);
  if (!threads.length) return;

  var ok = 0, failed = 0;
  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var msgs = thread.getMessages();
    // The LAST inbound message is the actual reply. Skip messages we sent ourselves — a thread
    // contains our own outreach too, and POSTing that would mark the lead as having replied to us.
    var msg = null;
    for (var j = msgs.length - 1; j >= 0; j--) {
      var from = msgs[j].getFrom() || '';
      if (from.indexOf('sarah@phishsimai.com') === -1 && from.indexOf('kaan@phishsimai.com') === -1) {
        msg = msgs[j];
        break;
      }
    }
    if (!msg) { thread.addLabel(doneLabel); continue; } // our own thread, nothing inbound: retire it

    var payload = {
      from:    msg.getFrom(),
      subject: msg.getSubject() || '',
      text:    (msg.getPlainBody() || '').slice(0, 20000)
    };

    var result = post_(payload);
    if (result.ok) {
      thread.addLabel(doneLabel);
      thread.removeLabel(failedLabel);
      thread.markRead();
      ok++;
      console.log('captured ' + payload.from + ' matched=' + result.matched + ' drafted=' + result.drafted);
    } else {
      // Leave it UNLABELLED so the next run retries. The failed label is a visible breadcrumb only.
      thread.addLabel(failedLabel);
      failed++;
      console.error('FAILED ' + payload.from + ' — ' + result.error);
    }
  }
  console.log('run complete: ' + ok + ' captured, ' + failed + ' failed, ' + threads.length + ' seen');
}

function post_(payload) {
  var auth = Utilities.base64Encode(INBOUND_USER + ':' + INBOUND_PASS);
  try {
    var res = UrlFetchApp.fetch(ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Basic ' + auth },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var body = res.getContentText();
    if (code !== 200) return { ok: false, error: 'HTTP ' + code + ' ' + body.slice(0, 200) };
    var json = JSON.parse(body);
    // The handler always 200s so relays don't retry-storm — so success is the BODY saying ok:true,
    // never the status code. Treating 200 as success would silently discard every failed write.
    if (!json.ok) return { ok: false, error: 'handler returned ok:false — ' + body.slice(0, 200) };
    return { ok: true, matched: json.matched, drafted: json.drafted };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

// ─── SETUP / DIAGNOSTICS ─────────────────────────────────────────────────────
function installTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'captureReplies') ScriptApp.deleteTrigger(existing[i]);
  }
  ScriptApp.newTrigger('captureReplies').timeBased().everyMinutes(5).create();
  console.log('trigger installed: captureReplies every 5 minutes');
}

/** Dry-run the search without POSTing — confirms the filter matches what you expect. */
function previewSearch() {
  var threads = GmailApp.search(SEARCH, 0, 20);
  console.log(SEARCH + '  =>  ' + threads.length + ' thread(s)');
  for (var i = 0; i < threads.length; i++) {
    var m = threads[i].getMessages()[threads[i].getMessageCount() - 1];
    console.log('  ' + m.getDate() + '  ' + m.getFrom() + '  ' + m.getSubject());
  }
}

/** POST exactly one thread end-to-end. Use this once after install to prove the path. */
function testOne() {
  var threads = GmailApp.search(SEARCH, 0, 1);
  if (!threads.length) { console.log('no matching thread — send yourself a test to sarah@ first'); return; }
  var msgs = threads[0].getMessages();
  var msg = msgs[msgs.length - 1];
  var r = post_({ from: msg.getFrom(), subject: msg.getSubject() || '', text: (msg.getPlainBody() || '').slice(0, 20000) });
  console.log(JSON.stringify(r));
  if (r.ok) { threads[0].addLabel(getOrCreateLabel_(LABEL_DONE)); threads[0].markRead(); }
}
