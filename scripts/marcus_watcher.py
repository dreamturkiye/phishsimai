#!/usr/bin/env python3
"""
Kaan AI OS — Marcus Watcher v5 (multi-product)
ScrollFuel + PhishSimAI: Janet queues → Marcus codes → dev → QA → prod → complete.

Runs every 10 min via launchd (com.kaanos.architect).
"""
import urllib.request
import urllib.parse
import json
import subprocess
import time
import sys
import os
import re
from dataclasses import dataclass, field
from typing import Optional

# PS-MARCUS-GATES-01: the five deploy safety gates. Pure decisions in marcus_gates, breaker/gate I/O
# in breaker_client. sys.path so the sibling imports resolve regardless of launchd's cwd.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import marcus_gates as gates
import breaker_client

GROQ_MODEL = os.environ.get('GROQ_ARCHITECT_MODEL', 'llama-3.3-70b-versatile')
GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
ARCHITECT_ENV_FILE = os.environ.get('ARCHITECT_ENV_FILE', '/Users/kaan/HQ/.architect.env')
GITHUB_API = 'https://api.github.com'

# PS-MARCUS-GATES-01: protected paths now include CI workflows, pricing bands, and escalations (O.5).
PROTECTED_PATTERNS = gates.PROTECTED_PATTERNS

SCROLLFUEL_PROBE_FIX = """'use client'

import { useEffect } from 'react'
import { reportBug } from '@/lib/os/errorTelemetry'

/** Intentional probe for self-heal pipeline testing — only reports when armed */
export function SelfHealTestProbe({ armed }: { armed: boolean }) {
  useEffect(() => {
    if (!armed) return
    const err = new Error('SELF_HEAL_TEST: intentional probe bug for autonomous fix pipeline')
    reportBug(err, 'SelfHealTestProbe', 'heal_test_armed')
    // ARCH-FIX: report bug to Janet without throwing — keeps page alive after self-heal
  }, [armed])

  if (!armed) {
    return (
      <div style={{ padding: 40, fontFamily: 'system-ui', color: '#94a3b8' }}>
        Self-heal test probe disarmed. Add <code>?arm=sf-hq-2026</code> to trigger.
      </div>
    )
  }

  return (
    <div style={{ padding: 40, fontFamily: 'system-ui', color: '#94a3b8' }}>
      Self-heal probe armed — bug reported to Janet. Page stays up for E2E verification.
    </div>
  )
}
"""

PHISHSIM_PROBE_FIX = """import { useEffect } from 'react'
import { reportBug } from '@/lib/errorTelemetry'

function SelfHealTestProbe({ armed }: { armed: boolean }) {
  useEffect(() => {
    if (!armed) return
    const err = new Error('SELF_HEAL_TEST v4.5.1: intentional probe')
    reportBug(err, 'SelfHealTestProbe', 'heal_test_armed')
    // ARCH-FIX: report bug to Janet without throwing — keeps page alive after self-heal
  }, [armed])

  if (!armed) {
    return (
      <div className="flex min-h-screen items-center justify-center p-10 text-muted-foreground">
        <p>
          Self-heal test probe disarmed. Add <code className="rounded bg-muted px-1">?arm=ps-hq-2026</code> to trigger.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-10 text-muted-foreground">
      <p>Self-heal probe armed — bug reported to Janet. Page stays up for E2E verification.</p>
    </div>
  )
}

export default function HealTest() {
  const armed = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('arm') === 'ps-hq-2026'
  return <SelfHealTestProbe armed={armed} />
}
"""


@dataclass
class Product:
    name: str
    base_url: str
    secret: str
    repo_path: str
    pending_path: str
    code_path: str
    complete_path: str
    qa_path: str
    vercel_project: str
    vercel_team: str = 'getvelacom'
    dev_branch: str = 'dev'
    prod_branch: str = 'master'
    github_repo: str = ''      # PS-MARCUS-GATES-01: owner/name for the CI check-runs poll (M.2)
    code_secret: str = ''      # ARCHITECT_SECRET for /architect/code (okSecret); HQ for everything else


PRODUCTS = [
    Product(
        name='scrollfuel',
        base_url='https://scrollfuel.io',
        secret='sf-hq-2026',
        repo_path='/Users/kaan/ugc-agency',
        pending_path='/api/architect/pending',
        code_path='/api/architect/code',
        complete_path='/api/architect/complete',
        qa_path='/api/os/qa-smoke',
        vercel_project='ugc-agency',
    ),
    Product(
        name='phishsim',
        base_url='https://phishsimai.com',
        secret='ps-hq-2026',
        repo_path='/Users/kaan/phishsimai',
        pending_path='/api/os/architect/pending',
        code_path='/api/os/architect/code',
        complete_path='/api/os/architect/complete',
        qa_path='/api/os/qa-smoke',
        vercel_project='phishsimai',
        github_repo='dreamturkiye/phishsimai',
        prod_branch='main',   # PS-MARCUS-GATES-01 fix: the real deploy branch (master does not exist)
    ),
]

# PS-MARCUS-GATES-01 auth fix: the hardcoded 'ps-hq-2026' was rotated out (~07-10) and 401s on every
# endpoint. Read the REAL secrets from the watcher's env (loaded above): HQ_SECRET authenticates
# pending/complete/qa/breaker/gate/deploy-verify (okHQ / okCronOrHq); ARCHITECT_SECRET authenticates
# /architect/code (okSecret). Applied to the active product(s); ARCHITECT_PRODUCT selects which runs.
_HQ = os.environ.get('HQ_SECRET', '')
_ARCH = os.environ.get('ARCHITECT_SECRET', '')
for _p in PRODUCTS:
    if _HQ:
        _p.secret = _HQ
    _p.code_secret = _ARCH or _p.secret


def load_env_file(path: str = ARCHITECT_ENV_FILE):
    if not path or not os.path.isfile(path):
        return
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, val = line.partition('=')
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ and val:
                os.environ[key] = val


load_env_file()


def try_known_fix(task_description: str, product: Product) -> Optional[dict]:
    desc = task_description.lower()
    if 'homepagestyles' in desc or 'no app stylesheet' in desc or 'index.css' in desc or 'unstyled' in desc:
        if product.name == 'phishsim':
            main_path = os.path.join(product.repo_path, 'client/src/main.tsx')
            if os.path.isfile(main_path):
                with open(main_path, encoding='utf-8') as f:
                    content = f.read()
                if './index.css' not in content and "index.css" not in content:
                    marker = 'import App from "./App";'
                    if marker in content:
                        content = content.replace(marker, marker + '\nimport "./index.css";')
                    else:
                        content = 'import "./index.css";\n' + content
                    return {'ok': True, 'files': {'client/src/main.tsx': content}, 'raw': 'KNOWN_FIX: restore index.css import'}
        if product.name == 'scrollfuel':
            layout_path = os.path.join(product.repo_path, 'app/layout.tsx')
            if os.path.isfile(layout_path):
                with open(layout_path, encoding='utf-8') as f:
                    content = f.read()
                if "globals.css" not in content:
                    content = content.replace(
                        "import { Providers } from './providers'",
                        "import './globals.css'\nimport { Providers } from './providers'",
                    )
                    return {'ok': True, 'files': {'app/layout.tsx': content}, 'raw': 'KNOWN_FIX: restore globals.css import'}
    if 'SelfHealTestProbe' in task_description or 'SELF_HEAL' in task_description:
        if product.name == 'scrollfuel':
            return {
                'ok': True,
                'files': {'components/SelfHealTestProbe.tsx': SCROLLFUEL_PROBE_FIX},
                'raw': 'KNOWN_FIX: ScrollFuel self-heal probe',
            }
        if product.name == 'phishsim':
            return {
                'ok': True,
                'files': {'client/src/pages/HealTest.tsx': PHISHSIM_PROBE_FIX},
                'raw': 'KNOWN_FIX: PhishSim self-heal probe',
            }
    return None


def fetch_pending_tasks(product: Product) -> list:
    url = f"{product.base_url}{product.pending_path}?secret={product.secret}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
        if data.get('error'):
            print(f"[{product.name}] pending error: {data['error']}")
        return data.get('tasks', [])


def report_completion(product: Product, task_id: str, success: bool, **kwargs):
    body = {
        'id': task_id,
        'success': success,
        'qwen_output': (kwargs.get('qwen_output') or '')[:2000],
        'files_changed': kwargs.get('files_changed') or [],
        'commit_sha': kwargs.get('commit_sha', ''),
        'error': (kwargs.get('error') or '')[:500],
        'preview_url': kwargs.get('preview_url', ''),
        'prod_url': kwargs.get('prod_url', product.base_url),
        'qa_preview': kwargs.get('qa_preview', ''),
        'qa_prod': kwargs.get('qa_prod', ''),
        'deploy_branch': kwargs.get('deploy_branch', product.dev_branch),
    }
    url = f"{product.base_url}{product.complete_path}?secret={product.secret}"
    req = urllib.request.Request(
        url, data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json'}, method='POST',
    )
    urllib.request.urlopen(req, timeout=30)


def preview_url_for_branch(product: Product, branch: str) -> str:
    slug = branch.replace('/', '-')
    return f'https://{product.vercel_project}-git-{slug}-{product.vercel_team}.vercel.app'


def git_run(product: Product, args, check=True):
    return subprocess.run(['git'] + args, cwd=product.repo_path, capture_output=True, text=True, timeout=120)


def sync_branch(product: Product, branch: str):
    git_run(product, ['fetch', 'origin'])
    git_run(product, ['checkout', branch])
    r = git_run(product, ['pull', '--rebase', 'origin', branch], check=False)
    if r.returncode != 0:
        git_run(product, ['rebase', '--abort'], check=False)
        git_run(product, ['reset', '--hard', f'origin/{branch}'])


def get_repo_context(product: Product) -> str:
    exclude = '*/node_modules/*' if product.name == 'scrollfuel' else '*/node_modules/*'
    extra = '-not -path "*/.next/*"' if product.name == 'scrollfuel' else '-not -path "*/dist/*"'
    result = subprocess.run(
        f'find {product.repo_path} -maxdepth 3 -type d -not -path {exclude} {extra} -not -path "*/.git/*"',
        shell=True, capture_output=True, text=True, timeout=15,
    )
    return result.stdout[:2000]


PASCAL_SYMBOL_RE = re.compile(r'\b[A-Z][a-zA-Z0-9]{2,}\b')
SKIP_SYMBOLS = frozenset({
    'Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError',
    'GlobalErrorHandler', 'ErrorBoundary', 'React', 'Promise', 'Object',
    'Array', 'String', 'Number', 'Boolean', 'JSON', 'Date', 'Map', 'Set',
    'MARCUS', 'BUG', 'FIX', 'SELF', 'HEAL', 'TEST', 'URL', 'API', 'HQ',
})


def extract_pascal_symbols(text: str) -> list:
    seen = []
    for m in PASCAL_SYMBOL_RE.finditer(text or ''):
        sym = m.group(0)
        if sym in SKIP_SYMBOLS or sym in seen:
            continue
        seen.append(sym)
        if len(seen) >= 5:
            break
    return seen


def gather_repo_files(product: Product, task_description: str) -> dict:
    symbols = extract_pascal_symbols(task_description)
    if not symbols:
        return {}
    files = {}
    total_chars = 0
    cap = 8000
    for sym in symbols:
        if total_chars >= cap:
            break
        try:
            result = subprocess.run(
                ['grep', '-rl', '--include=*.tsx', '--include=*.ts', sym, product.repo_path],
                capture_output=True, text=True, timeout=20,
            )
        except Exception:
            continue
        for rel_hint in result.stdout.strip().split('\n')[:2]:
            if not rel_hint or total_chars >= cap:
                break
            full_path = rel_hint if rel_hint.startswith('/') else os.path.join(product.repo_path, rel_hint)
            if not os.path.isfile(full_path):
                continue
            rel = os.path.relpath(full_path, product.repo_path)
            if rel in files:
                continue
            try:
                with open(full_path, encoding='utf-8', errors='replace') as f:
                    content = f.read()
            except Exception:
                continue
            budget = min(len(content), cap - total_chars, 4000)
            if budget < 80:
                continue
            files[rel] = content[:budget]
            total_chars += budget
    return files


def run_groq_for_diff(product: Product, task_description: str, task_id: str = None) -> dict:
    repo_tree = get_repo_context(product)
    repo_files = gather_repo_files(product, task_description)
    try:
        payload = {'task': task_description, 'repo_tree': repo_tree, 'repo_path': product.repo_path}
        if task_id:
            payload['task_id'] = task_id
        if repo_files:
            payload['repo_files'] = repo_files
            print(f'[{product.name}] Pre-injected {len(repo_files)} repo file(s): {list(repo_files.keys())}')
        url = f"{product.base_url}{product.code_path}?secret={product.code_secret}"  # /code uses ARCHITECT_SECRET (okSecret)
        req = urllib.request.Request(
            url, data=json.dumps(payload).encode(),
            headers={'Content-Type': 'application/json'}, method='POST',
        )
        with urllib.request.urlopen(req, timeout=180) as r:
            data = json.loads(r.read().decode('utf-8'))
        if data.get('ok') and data.get('files'):
            return {'ok': True, 'files': data['files'], 'raw': data.get('raw', '')[:1500]}
        if data.get('error'):
            return {'ok': False, 'reason': data['error'], 'files': {}, 'raw': data.get('raw', '')}
    except Exception as e:
        print(f'[{product.name}] Remote Groq failed ({e}), trying local fallback')

    api_key = os.environ.get('GROQ_API_KEY')
    if not api_key:
        return {'ok': False, 'reason': 'Groq unavailable', 'files': {}}

    stack = 'Next.js 14' if product.name == 'scrollfuel' else 'Vite React + Express'
    prompt = f"""You are Marcus, Principal SaaS Architect. Stack: {stack}, TypeScript, Neon, Vercel.
Repo: {repo_tree}
TASK: {task_description}
Format: FILE: path\\n---\\ncontent\\n---END---"""
    req = urllib.request.Request(
        GROQ_API_URL,
        data=json.dumps({'model': GROQ_MODEL, 'messages': [{'role': 'user', 'content': prompt}],
                         'max_tokens': 8000, 'temperature': 0.1}).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key}'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            data = json.loads(r.read().decode('utf-8'))
    except Exception as e:
        return {'ok': False, 'reason': f'Groq failed: {e}', 'files': {}}

    output = (data.get('choices') or [{}])[0].get('message', {}).get('content', '').strip()
    files = {}
    for match in re.finditer(r'FILE:\s*(.+?)\n---\n(.*?)\n---END---', output, re.DOTALL):
        files[match.group(1).strip()] = match.group(2)
    if not files:
        return {'ok': False, 'reason': 'Groq output format mismatch', 'files': {}, 'raw': output[:1000]}
    return {'ok': True, 'files': files, 'raw': output[:1500]}


def wait_for_deploy(url: str, timeout: int = 360) -> bool:
    health = url.rstrip('/') + '/api/health'
    for _ in range(timeout // 15):
        try:
            with urllib.request.urlopen(health, timeout=12) as r:
                if r.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(15)
    return False


def run_qa_smoke(product: Product, base_url: str, trigger: str) -> dict:
    qs = urllib.parse.urlencode({'secret': product.secret, 'trigger': trigger, 'base_url': base_url.rstrip('/')})
    url = f"{product.base_url}{product.qa_path}?{qs}"
    with urllib.request.urlopen(urllib.request.Request(url), timeout=90) as r:
        return json.loads(r.read())


def is_protected(path: str) -> bool:
    return any(p in path.lower() for p in PROTECTED_PATTERNS)


def apply_on_dev(product: Product, files: dict, task_description: str) -> dict:
    # Gate 4: protected paths (incl. .github/workflows, pricing, escalation) — refuse at apply.
    for path in files:
        if is_protected(path):
            return {'ok': False, 'error': f'Protected path: {path}', 'protected': True}
    sync_branch(product, product.dev_branch)
    # Gate 1: destructive-diff tripwire. >10 files OR >500 net lines (outside generated/vendored) →
    # refuse and discard; the caller records a breaker failure so a repeat opens the breaker.
    def _old(rel):
        try:
            with open(os.path.join(product.repo_path, rel), encoding='utf-8') as fh:
                return fh.read()
        except Exception:
            return ''
    destructive, reason, stats = gates.is_destructive_diff(files, old_getter=_old)
    if destructive:
        return {'ok': False, 'error': f'Destructive diff refused ({reason}) — discarded', 'destructive': True, 'stats': stats}
    changed = []
    for rel_path, content in files.items():
        full_path = os.path.join(product.repo_path, rel_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        changed.append(rel_path)
    git_run(product, ['add'] + changed)
    commit_result = git_run(product, ['commit', '-m', f"architect(dev): {task_description[:72]} [Marcus]"], check=False)
    combined = (commit_result.stdout or '') + (commit_result.stderr or '')
    if 'nothing to commit' in combined or 'nothing added to commit' in combined:
        return {'ok': True, 'files': [], 'commit_sha': git_run(product, ['rev-parse', '--short', 'HEAD']).stdout.strip(),
                'preview_url': preview_url_for_branch(product, product.dev_branch), 'no_changes': True}
    push = git_run(product, ['push', 'origin', product.dev_branch], check=False)
    if push.returncode != 0:
        sync_branch(product, product.dev_branch)
        return {'ok': False, 'error': f'Dev push failed: {(push.stderr or push.stdout)[:300]}'}
    return {'ok': True, 'files': changed, 'commit_sha': git_run(product, ['rev-parse', '--short', 'HEAD']).stdout.strip(),
            'preview_url': preview_url_for_branch(product, product.dev_branch)}


def promote_dev_to_prod(product: Product) -> dict:
    sync_branch(product, product.prod_branch)
    prod_before = git_run(product, ['rev-parse', 'HEAD']).stdout.strip()
    merge = git_run(product, ['merge', f'origin/{product.dev_branch}',
                              '-m', f'promote: Marcus {product.dev_branch} → {product.prod_branch}'], check=False)
    if merge.returncode != 0:
        git_run(product, ['merge', '--abort'], check=False)
        return {'ok': False, 'error': 'Merge conflict — prod not touched', 'prod_before': prod_before}
    push = git_run(product, ['push', 'origin', product.prod_branch], check=False)
    if push.returncode != 0:
        git_run(product, ['reset', '--hard', prod_before])
        return {'ok': False, 'error': 'Prod push failed', 'prod_before': prod_before}
    return {'ok': True, 'commit_sha': git_run(product, ['rev-parse', '--short', 'HEAD']).stdout.strip(), 'prod_before': prod_before}


def rollback_prod(product: Product, prod_before: str):
    sync_branch(product, product.prod_branch)
    git_run(product, ['reset', '--hard', prod_before])
    git_run(product, ['push', 'origin', product.prod_branch, '--force-with-lease'], check=False)


def poll_ci_check_runs(product: Product, ref: str, timeout: int = 900) -> tuple:
    """Gate 2 (M.2): poll GitHub check-runs for `ref` (the dev commit). Green ONLY when every run is
    completed with a success conclusion AND the required 'verify' check is present. Fails closed on a
    missing token, a timeout, or persistent transient errors — a change no CI could confirm green
    does not reach prod."""
    token = os.environ.get('MARCUS_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN', '')  # PS-MARCUS-GATES-01 fix
    if not product.github_repo or not token:
        return False, 'no MARCUS_GITHUB_TOKEN/github_repo — cannot verify CI (fail closed)'
    url = f'{GITHUB_API}/repos/{product.github_repo}/commits/{ref}/check-runs'
    headers = {'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json', 'User-Agent': 'marcus-watcher'}
    deadline = time.time() + timeout
    last = 'no check-runs yet'
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
                data = json.loads(r.read().decode('utf-8'))
            runs = [{'name': c.get('name'), 'status': c.get('status'), 'conclusion': c.get('conclusion')}
                    for c in data.get('check_runs', [])]
            green, why = gates.ci_is_green(runs, required=['verify'])
            last = why
            if 'still running' not in why and 'no check-runs' not in why:
                return green, why  # a settled verdict (green, or a real failure)
        except Exception as e:
            last = f'poll error: {e}'
        time.sleep(15)
    return False, f'CI poll timed out — fail closed (last: {last})'


def deploy_verify_probe(product: Product) -> dict:
    """Gate 3 (M.4): ask the server whether the running prod origin is OUR app (project↔domain).
    Normalised to {measured, match} for the pure gate. A transient/unreadable probe is NOT measured
    (so it is neither an OK nor a mismatch)."""
    try:
        url = f"{product.base_url}/api/os/deploy-verify?secret={product.secret}"
        with urllib.request.urlopen(urllib.request.Request(url), timeout=30) as r:
            j = json.loads(r.read().decode('utf-8'))
        m = j.get('match', None)
        return {'measured': m is not None, 'match': m, 'reason': j.get('reason', '')}
    except Exception as e:
        return {'measured': False, 'match': None, 'reason': f'probe error: {e}'}


def process_task(product: Product, task: dict):
    task_id, description = task['id'], task['task']
    print(f'[{product.name}] Processing {task_id[:8]}: {description[:80]}')
    if len(description.strip()) < 12:
        report_completion(product, task_id, False, error='Malformed task — skipped')
        return
    # Gate 1 (M.1): circuit breaker — a fingerprint quarantined by 3 consecutive failures is skipped.
    state, _bk = breaker_client.breaker_state(product.base_url, product.secret, product.name, task_id)
    if state == 'open':
        report_completion(product, task_id, False, error='Circuit breaker OPEN for this task — skipped (quarantined)')
        return
    try:
        diff = try_known_fix(description, product) or run_groq_for_diff(product, description, task_id)
        if not diff['ok']:
            report_completion(product, task_id, False, qwen_output=diff.get('reason', ''), error=diff.get('reason', 'Cannot auto-apply'))
            return
        dev = apply_on_dev(product, diff['files'], description)
        if not dev['ok']:
            # A destructive-diff refusal is a breaker-worthy failure (opens on repeat). Protected-path
            # and other apply refusals are reported but not counted against the breaker.
            if dev.get('destructive'):
                breaker_client.breaker_record(product.base_url, product.secret, task_id, False, dev['error'])
            report_completion(product, task_id, False, error=dev['error'], qwen_output=diff.get('raw', ''))
            return
        if dev.get('no_changes'):
            report_completion(product, task_id, True, qwen_output=diff.get('raw', ''), files_changed=[],
                              commit_sha=dev.get('commit_sha', ''), prod_url=product.base_url,
                              deploy_branch=f'{product.dev_branch} (no changes — already fixed)')
            print(f'[{product.name}] DONE (no changes needed)')
            return
        preview = dev['preview_url']
        preview_ready = wait_for_deploy(preview, timeout=120)
        qa_preview = run_qa_smoke(product, preview, f'architect-preview-{task_id[:8]}') if preview_ready else {'passed': 0, 'failed': 0}

        # ── DEPLOY GATES — all must pass before dev may reach prod. Dev commit stands either way. ──
        # Gate 5 (autonomy): the HANDS are gated. No deploy unless the external watcher audit PASSED
        # and the earned level is at the deploy floor. watcher_audit='outstanding' blocks here.
        g = breaker_client.gate_state(product.base_url, product.secret)
        if not gates.deploy_allowed(g.get('watcher_audit'), g.get('level')):
            report_completion(product, task_id, False, preview_url=preview, deploy_branch=product.dev_branch,
                              error=f"DEPLOY BLOCKED by autonomy gate (watcher_audit={g.get('watcher_audit')!r}, level={g.get('level')!r}) — prod untouched")
            print(f'[{product.name}] autonomy gate blocked deploy — dev only')
            return
        # Gate 2 (CI): the dev commit must be green (tsc + full suite) before it can be promoted.
        ci_green, ci_reason = poll_ci_check_runs(product, dev['commit_sha'])
        if not ci_green:
            breaker_client.breaker_record(product.base_url, product.secret, task_id, False, f'CI red: {ci_reason}')
            report_completion(product, task_id, False, preview_url=preview, deploy_branch=product.dev_branch,
                              error=f'CI NOT GREEN — blocked from prod: {ci_reason}')
            return
        # Gate 3 (deploy-verify): the running prod origin must be OUR app (project↔domain). Mismatch
        # aborts the promote and records a breaker failure.
        dv = deploy_verify_probe(product)
        if gates.deploy_verify_is_mismatch(dv):
            breaker_client.breaker_record(product.base_url, product.secret, task_id, False, f"deploy_mismatch: {dv.get('reason')}")
            report_completion(product, task_id, False, preview_url=preview,
                              error=f"DEPLOY-VERIFY MISMATCH — promote aborted: {dv.get('reason')}")
            return

        promote = promote_dev_to_prod(product)
        if not promote['ok']:
            breaker_client.breaker_record(product.base_url, product.secret, task_id, False, promote['error'])
            report_completion(product, task_id, False, error=promote['error'], preview_url=preview)
            return
        if not wait_for_deploy(product.base_url, timeout=180):
            rollback_prod(product, promote['prod_before'])
            breaker_client.breaker_record(product.base_url, product.secret, task_id, False, 'prod deploy timeout — rolled back')
            report_completion(product, task_id, False, error='Prod deploy timeout — rolled back', preview_url=preview)
            return
        qa_prod = run_qa_smoke(product, product.base_url, f'architect-prod-{task_id[:8]}')
        if qa_prod.get('failed', 1) > 0:
            rollback_prod(product, promote['prod_before'])
            breaker_client.breaker_record(product.base_url, product.secret, task_id, False, 'prod QA failed — rolled back')
            report_completion(product, task_id, False, error='Prod QA failed — rolled back', files_changed=dev['files'])
            return
        breaker_client.breaker_record(product.base_url, product.secret, task_id, True, '')
        print(f'[{product.name}] DONE — prod @ {promote["commit_sha"]}')
        report_completion(product, task_id, True, qwen_output=diff.get('raw', ''), files_changed=dev['files'],
                          commit_sha=promote['commit_sha'], preview_url=preview, prod_url=product.base_url,
                          qa_preview=f"{qa_preview.get('passed', 0)} passed", qa_prod=f"{qa_prod.get('passed', 0)} passed",
                          deploy_branch=f'{product.dev_branch} → {product.prod_branch}')
    except Exception as e:
        print(f'[{product.name}] FAILED: {e}')
        report_completion(product, task_id, False, error=str(e))


def run_product(product: Product):
    print(f'[Marcus v5] {product.name} @ {product.base_url}')
    try:
        tasks = fetch_pending_tasks(product)
    except Exception as e:
        print(f'[{product.name}] Fetch failed: {e}')
        return
    if not tasks:
        print(f'[{product.name}] No tasks.')
        return
    print(f'[{product.name}] {len(tasks)} task(s)')
    for task in tasks[:2]:
        process_task(product, task)
        time.sleep(2)


def main():
    only = os.environ.get('ARCHITECT_PRODUCT')
    targets = [p for p in PRODUCTS if not only or p.name == only]
    print(f'[Marcus Watcher v5] Products: {[p.name for p in targets]}')
    for product in targets:
        run_product(product)


if __name__ == '__main__':
    main()
