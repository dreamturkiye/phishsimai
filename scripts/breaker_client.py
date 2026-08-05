"""PS-MARCUS-GATES-01 — HTTP client for the server-side circuit breaker + autonomy gate.

Every call FAILS CLOSED: if the breaker/gate cannot be reached, the caller must treat the result as
"do not proceed." The fingerprint mirrors circuitBreaker.ts primaryFingerprint = sha256(product:task)
so a state read lines up with the outcomes the server recorded.

Endpoints:
  GET  /api/os/architect/breaker?fp=<fp>              → { state, consecutiveFailures, ... }
  POST /api/os/architect/breaker { task_id, outcome } → records an outcome, runs the 3-fail machine
  POST /api/os/architect/breaker { task_id, diff }    → server-side destructive-diff safety check
  GET  /api/os/architect/gate                         → { watcher_audit, level }  (autonomy gate)
"""
import json
import hashlib
import urllib.request


def fingerprint(product_id, task_id):
    return hashlib.sha256(f'{product_id}:{task_id}'.encode()).hexdigest()


def _get(url, timeout=30):
    with urllib.request.urlopen(urllib.request.Request(url), timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def _post(url, body, timeout=45):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def breaker_state(base_url, secret, product_id, task_id):
    """Effective breaker state for this task's fingerprint. On any error return 'open' — fail closed,
    an unreachable breaker is not permission to deploy."""
    fp = fingerprint(product_id, task_id)
    try:
        st = _get(f'{base_url}/api/os/architect/breaker?secret={secret}&fp={fp}')
        return str(st.get('state', 'open')).lower(), st
    except Exception as e:
        return 'open', {'state': 'open', 'error': f'breaker unreachable: {e}'}


def breaker_record(base_url, secret, task_id, success, error=''):
    """Record an outcome so 3 consecutive failures quarantines the fingerprint."""
    try:
        return _post(f'{base_url}/api/os/architect/breaker?secret={secret}',
                     {'task_id': task_id, 'outcome': 'success' if success else 'failure', 'error': error[:500]})
    except Exception as e:
        return {'error': f'breaker record failed: {e}'}


def gate_state(base_url, secret):
    """Autonomy gate: {watcher_audit, level}. On error return the fail-closed pair so deploy is
    blocked when the gate cannot be read."""
    try:
        return _get(f'{base_url}/api/os/architect/gate?secret={secret}')
    except Exception as e:
        return {'watcher_audit': 'unreachable', 'level': 'manual', 'error': str(e)}
