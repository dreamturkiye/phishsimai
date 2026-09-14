// GitHub Actions sidecar for marcus.yml — NOT the 7.10 Marcus daemon.
//
// KAAN AI OS 7.10 §0 decision 1 / O.22: One Marcus = Mac launchd
// `com.kaanos.architect` (`/Users/kaan/HQ/marcus_watcher.py`). PhishSim records
// that daemon on GET /api/os/architect/pending via `watcher_heartbeat`.
// Overnight `*/30` skip of THIS workflow is expected and must not page the
// founder (issues #312, #308, #307, …) and must not workflow_dispatch a cloud
// duplicate into existence.
//
// This script only pages when the in-repo Actions workflow is JAMMED
// (4 of last 5 runs failed). Quiet ≠ down.
// Env: GH_REPO, GH_TOKEN
const REPO = process.env.GH_REPO, TOKEN = process.env.GH_TOKEN;
const api = (p, init) => fetch(`https://api.github.com/repos/${REPO}/${p}`, {
  ...init,
  headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...(init?.headers || {}) },
});

const TITLE = 'Marcus health alert';
const FAIL_WINDOW = 5, FAIL_MIN = 4;   // 4 of last 5 runs failed = jammed Actions sidecar

const runs = ((await (await api('actions/workflows/marcus.yml/runs?per_page=10')).json()).workflow_runs) || [];
const lastRunMs = runs[0] ? new Date(runs[0].created_at).getTime() : 0;
const hoursSince = lastRunMs ? (Date.now() - lastRunMs) / 3.6e6 : 999;
const fin = runs.filter(r => r.conclusion).slice(0, FAIL_WINDOW);
const failed = fin.filter(r => r.conclusion === 'failure').length;
const failing = fin.length >= FAIL_MIN && failed >= FAIL_MIN;

const issues = await (await api('issues?state=open&per_page=50')).json();
const existing = Array.isArray(issues) ? issues.find(i => i.title === TITLE && !i.pull_request) : null;

if (failing) {
  const reasons = `${failed}/${fin.length} most recent GitHub Actions marcus.yml runs failed`;
  const body = [
    `**GitHub Actions CI-Marcus is jammed.** ${reasons}.`,
    '',
    `This is NOT the KAAN AI OS 7.10 Marcus daemon. Canonical Marcus is Mac launchd \`com.kaanos.architect\` (\`/Users/kaan/HQ/marcus_watcher.py\`), which heartbeats PhishSim on \`GET /api/os/architect/pending\` (\`watcher_heartbeat\`).`,
    '',
    `Checked ${new Date().toISOString()}. Open the Actions tab → Marcus. If a bad task is jamming it, set that task's status to \`cancelled\`; to pause the sidecar, disable the Marcus workflow.`,
  ].join('\n');
  if (existing) {
    await api(`issues/${existing.number}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    console.log('ALERT: updated existing issue #' + existing.number, '-', reasons);
  } else {
    const r = await (await api('issues', { method: 'POST', body: JSON.stringify({ title: TITLE, body }) })).json();
    console.log('ALERT: opened issue #' + r.number, '-', reasons);
  }
  process.exit(0);
}

console.log(`Actions sidecar idle ${hoursSince.toFixed(1)}h, ${failed}/${fin.length} recent failures — not paging (7.10 Mac Marcus is canonical)`);

if (existing) {
  await api(`issues/${existing.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `Recovered / clarified: GitHub Actions marcus.yml last run ${hoursSince.toFixed(1)}h ago, ${failed}/${fin.length} recent failures. Overnight schedule skip is not Mac Marcus down (KAAN AI OS 7.10 §0). Closing.` }) });
  await api(`issues/${existing.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
  console.log('recovered; closed alert #' + existing.number);
}
