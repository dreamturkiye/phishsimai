// Marcus heartbeat: detects silent death or repeated failure and raises a GitHub issue
// (GitHub emails you on new issues). Self-clears the alert when Marcus is healthy again.
// Runs on its own schedule so it can catch the case where marcus.yml itself stops firing.
// Env: GH_REPO, GH_TOKEN
const REPO = process.env.GH_REPO, TOKEN = process.env.GH_TOKEN;
const api = (p, init) => fetch(`https://api.github.com/repos/${REPO}/${p}`, {
  ...init,
  headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...(init?.headers || {}) },
});

const TITLE = 'Marcus health alert';
const STALE_HOURS = 2;       // quiet long enough to poke an empty marcus.yml dispatch
const ALERT_STALE_HOURS = 6; // overnight Actions skip is ~4h; page the founder only after 6h
const FAIL_WINDOW = 5, FAIL_MIN = 4;   // 4 of last 5 runs failed = unhealthy

const runs = ((await (await api('actions/workflows/marcus.yml/runs?per_page=10')).json()).workflow_runs) || [];
const lastRunMs = runs[0] ? new Date(runs[0].created_at).getTime() : 0;
const hoursSince = lastRunMs ? (Date.now() - lastRunMs) / 3.6e6 : 999;
const fin = runs.filter(r => r.conclusion).slice(0, FAIL_WINDOW);
const failed = fin.filter(r => r.conclusion === 'failure').length;

const stale = hoursSince > STALE_HOURS;
const failing = fin.length >= FAIL_MIN && failed >= FAIL_MIN;

// GitHub may delay or skip `*/30` overnight. Empty workflow_dispatch is now legal
// (marcus.yml task input is optional; resolve-task falls through to the picker).
if (stale) {
  const poke = await api('actions/workflows/marcus.yml/dispatches', {
    method: 'POST',
    body: JSON.stringify({ ref: 'main' }),
  });
  if (!poke.ok) {
    console.log('poke failed:', poke.status, await poke.text());
  } else {
    console.log(`poked marcus.yml (stale ${hoursSince.toFixed(1)}h)`);
  }
}

const alertStale = hoursSince > ALERT_STALE_HOURS;
const unhealthy = alertStale || failing;

// find an existing open alert issue (match by title; ignore PRs)
const issues = await (await api('issues?state=open&per_page=50')).json();
const existing = Array.isArray(issues) ? issues.find(i => i.title === TITLE && !i.pull_request) : null;

if (unhealthy) {
  const reasons = [alertStale ? `no Marcus run in ${hoursSince.toFixed(1)}h (expected every ~30 min)` : null,
                   failing ? `${failed}/${fin.length} most recent runs failed` : null].filter(Boolean).join('; ');
  const body = `**Marcus may be down.** ${reasons}.\n\nChecked ${new Date().toISOString()}. Open the Actions tab -> Marcus to investigate. If a bad task is jamming it, set that task's status to \`cancelled\`; to pause entirely, disable the Marcus workflow.`;
  if (existing) {
    await api(`issues/${existing.number}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    console.log('ALERT: updated existing issue #' + existing.number, '-', reasons);
  } else {
    const r = await (await api('issues', { method: 'POST', body: JSON.stringify({ title: TITLE, body }) })).json();
    console.log('ALERT: opened issue #' + r.number, '-', reasons);
  }
  process.exit(0);
}

if (stale) {
  console.log(`stale ${hoursSince.toFixed(1)}h but under ${ALERT_STALE_HOURS}h alert floor — poked, not paging`);
}

// healthy: clear any open alert
if (existing) {
  await api(`issues/${existing.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `Recovered: last run ${hoursSince.toFixed(1)}h ago, ${failed}/${fin.length} recent failures. Closing.` }) });
  await api(`issues/${existing.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
  console.log('recovered; closed alert #' + existing.number);
} else {
  console.log(`healthy: last run ${hoursSince.toFixed(1)}h ago, ${failed}/${fin.length} recent failures`);
}
