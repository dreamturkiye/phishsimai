"""PS-MARCUS-GATES-01 — the five deploy safety gates, as PURE decisions.

No network, no git, no filesystem (except an injectable old-content getter), so every gate is
unit-testable in isolation. marcus_watcher.py imports these and does the I/O around them; the
DECISION — the thing that must be right — lives here where a test can pin it.

Gates: (1) circuit breaker destructive-diff tripwire + open rule, (2) CI check-runs green,
(3) deploy-verify, (4) protected paths, (5) autonomy gate (watcher_audit + level).
"""
import difflib

# ── Gate 4: protected paths — Marcus refuses to touch these at apply time ────────────────────────
PROTECTED_PATTERNS = [
    'stripe', 'payment', 'billing/checkout', '.env', 'vercel.json', 'package.json',
    'auth/options', 'middleware', 'webhook',
    # PS-MARCUS-GATES-01 additions (founder O.5): CI config, pricing bands, escalation logic.
    '.github/workflows', 'pricing', 'escalation',
        # PS-MARCUS-GATES-02: the three files named in the 2026-07-26 halt notice were never
        # actually covered by the substring patterns above ('billing/checkout' != 'checkout.ts',
        # 'auth/options' != 'auth.ts'). Closing that gap explicitly before re-enabling.
        'checkout', 'server/auth.ts', 'campaignsend',
]


def is_protected(path, patterns=PROTECTED_PATTERNS):
    p = path.lower()
    return any(pat in p for pat in patterns)


# ── Gate 1: destructive-diff tripwire + breaker open rule ────────────────────────────────────────
_EXCLUDE = ('node_modules/', 'dist/', '.next/', 'build/', '.git/', 'coverage/')
_GENERATED = ('package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', '.min.js', '.min.css')


def _counts_toward_impact(path):
    p = path.lower()
    if any(x in p for x in _EXCLUDE):
        return False
    if any(p.endswith(g) for g in _GENERATED):
        return False
    return True


def net_line_change(new_content, old_content=''):
    """Net changed lines (added + removed) between old and new content."""
    diff = difflib.ndiff((old_content or '').splitlines(), (new_content or '').splitlines())
    return sum(1 for line in diff if line[:1] in ('+', '-'))


def is_destructive_diff(files, old_getter=None, max_files=10, max_net_lines=500):
    """files: {path: new_content}. Returns (destructive: bool, reason: str, stats: dict).
    A destructive diff is REFUSED, discarded, and opens the breaker. Generated/vendored paths do
    not count toward the impact so a lockfile churn can't trip it."""
    impactful = [p for p in files if _counts_toward_impact(p)]
    if len(impactful) > max_files:
        return True, f'{len(impactful)} files changed (> {max_files})', {'files': len(impactful), 'net_lines': None}
    net = 0
    for p in impactful:
        old = (old_getter(p) if old_getter else '') or ''
        net += net_line_change(files[p], old)
    if net > max_net_lines:
        return True, f'{net} net lines changed (> {max_net_lines})', {'files': len(impactful), 'net_lines': net}
    return False, 'within limits', {'files': len(impactful), 'net_lines': net}


def breaker_should_open(consecutive_failures, threshold=3):
    """Mirrors circuitBreaker.ts: the fingerprint quarantines at 3 consecutive failures."""
    return consecutive_failures >= threshold


# ── Gate 2: CI check-runs green ──────────────────────────────────────────────────────────────────
_CI_BAD = {'failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure'}


def ci_is_green(check_runs, required=None):
    """check_runs: list of {name, status, conclusion} (GitHub check-runs shape). Green iff every run
    is completed with no bad conclusion. Empty/incomplete/failed => NOT green (fail closed).
    Returns (green: bool, reason: str)."""
    if not check_runs:
        return False, 'no check-runs reported — cannot confirm green (fail closed)'
    incomplete = [c['name'] for c in check_runs if c.get('status') != 'completed']
    if incomplete:
        return False, 'checks still running: ' + ', '.join(incomplete)
    bad = [c for c in check_runs if (c.get('conclusion') or '').lower() in _CI_BAD]
    if bad:
        return False, 'FAILED checks: ' + '; '.join(f"{c['name']}={c.get('conclusion')}" for c in bad)
    if required:
        names = {c['name'] for c in check_runs}
        missing = [r for r in required if r not in names]
        if missing:
            return False, 'required checks missing: ' + ', '.join(missing)
    return True, 'all checks green'


# ── Gate 3: deploy-verify (Vercel project↔domain) ────────────────────────────────────────────────
def deploy_verify_ok(verdict):
    """verdict from the deploy-verify probe: {measured: bool, match: bool|None}. OK ONLY on a
    measured match. A transient/unmeasured result is NOT a pass (fail closed)."""
    return bool(verdict.get('measured')) and verdict.get('match') is True


def deploy_verify_is_mismatch(verdict):
    """A measured mismatch — the running prod origin is NOT our app. Abort + open breaker."""
    return bool(verdict.get('measured')) and verdict.get('match') is False


# ── Gate 5: autonomy gate (watcher_audit + earned level) ─────────────────────────────────────────
_ORDER = ['manual', 'l2', 'l3', 'l4', 'l5']
DEPLOY_MIN_LEVEL = 'l5'  # mirrors autonomyGate MIN_LEVEL.deploy


def _rank(level):
    try:
        return _ORDER.index(str(level))
    except ValueError:
        return 0


def deploy_allowed(watcher_audit, level):
    """The HANDS are trusted only when the external watcher audit is a genuine 'passed' record AND
    the earned enforcement level is at the deploy floor (l5). Anything else — including
    watcher_audit='outstanding' — blocks the deploy. This is what makes the founder's watcher_audit
    record actually gate the hands, not just the promotion ladder."""
    return str(watcher_audit).strip().lower() == 'passed' and _rank(level) >= _rank(DEPLOY_MIN_LEVEL)
