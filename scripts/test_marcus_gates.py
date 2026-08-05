#!/usr/bin/env python3
"""PS-MARCUS-GATES-01 — independent tests for the five deploy safety gates.

Runnable with no pytest: `python3 scripts/test_marcus_gates.py`. Each gate is proven in isolation,
including by reintroduction (a 15-file diff IS refused; a red CI IS blocked; a mismatch DOES abort;
CI/pricing paths ARE refused; watcher_audit='outstanding' DOES block deploy).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import marcus_gates as gates
import breaker_client

RESULTS = []
def check(gate, name, cond):
    RESULTS.append((gate, name, bool(cond)))


# ── Gate 1: circuit breaker — destructive-diff tripwire + open rule ──────────────────────────────
def gate1():
    big = {f'server/f{i}.ts': 'x\n' for i in range(15)}          # 15 impactful files
    d, why, _ = gates.is_destructive_diff(big)
    check('1', '15-file diff is REFUSED', d and 'files' in why)

    huge = {'server/one.ts': '\n'.join(f'line {i}' for i in range(600))}  # >500 net lines vs empty
    d2, why2, _ = gates.is_destructive_diff(huge)
    check('1', '>500 net-line diff is REFUSED', d2 and 'net lines' in why2)

    small = {'server/a.ts': 'a\nb\n', 'client/b.tsx': 'c\n'}
    d3, _, _ = gates.is_destructive_diff(small)
    check('1', 'a small 2-file diff is allowed', not d3)

    vendored = {f'node_modules/pkg/f{i}.js': 'x\n' for i in range(15)}   # excluded from impact
    d4, _, st4 = gates.is_destructive_diff(vendored)
    check('1', 'vendored/node_modules files do not count', (not d4) and st4['files'] == 0)

    lock = {'pnpm-lock.yaml': '\n'.join(str(i) for i in range(2000))}    # generated lockfile
    d5, _, _ = gates.is_destructive_diff(lock)
    check('1', 'a huge lockfile churn does not trip', not d5)

    check('1', '3 consecutive fails OPENS the breaker', gates.breaker_should_open(3))
    check('1', '2 fails does NOT open', not gates.breaker_should_open(2))

    # fail-closed I/O: an unreachable breaker returns state 'open' (do not deploy)
    state, _ = breaker_client.breaker_state('http://127.0.0.1:1', 'x', 'phishsim', 't1')
    check('1', 'unreachable breaker fails CLOSED (open)', state == 'open')
    # fingerprint mirrors the server: sha256(product:task)
    import hashlib
    check('1', 'fingerprint == sha256(product:task)',
          breaker_client.fingerprint('phishsim', 't1') == hashlib.sha256(b'phishsim:t1').hexdigest())


# ── Gate 2: CI check-runs green ──────────────────────────────────────────────────────────────────
def gate2():
    green, _ = gates.ci_is_green([{'name': 'verify', 'status': 'completed', 'conclusion': 'success'}], required=['verify'])
    check('2', 'all-green (verify success) → promote allowed', green)

    red, why = gates.ci_is_green([{'name': 'verify', 'status': 'completed', 'conclusion': 'failure'}], required=['verify'])
    check('2', 'a FAILING suite is BLOCKED from prod', (not red) and 'FAILED' in why)

    empty, why2 = gates.ci_is_green([])
    check('2', 'no check-runs → blocked (fail closed)', (not empty) and 'no check-runs' in why2)

    running, why3 = gates.ci_is_green([{'name': 'verify', 'status': 'in_progress', 'conclusion': None}], required=['verify'])
    check('2', 'still-running → not green yet', (not running) and 'still running' in why3)

    missing, why4 = gates.ci_is_green([{'name': 'Vercel', 'status': 'completed', 'conclusion': 'success'}], required=['verify'])
    check('2', "required 'verify' missing → blocked", (not missing) and 'missing' in why4)


# ── Gate 3: deploy-verify ────────────────────────────────────────────────────────────────────────
def gate3():
    check('3', 'measured match → OK to promote', gates.deploy_verify_ok({'measured': True, 'match': True}))
    check('3', 'a project↔domain MISMATCH aborts the promote', gates.deploy_verify_is_mismatch({'measured': True, 'match': False}))
    check('3', 'a mismatch is NOT "ok"', not gates.deploy_verify_ok({'measured': True, 'match': False}))
    check('3', 'transient/unmeasured is NOT a pass', not gates.deploy_verify_ok({'measured': False, 'match': None}))
    check('3', 'transient/unmeasured is NOT a mismatch', not gates.deploy_verify_is_mismatch({'measured': False, 'match': None}))


# ── Gate 4: protected paths ──────────────────────────────────────────────────────────────────────
def gate4():
    check('4', 'CI workflow is protected', gates.is_protected('.github/workflows/ci.yml'))
    check('4', 'pricing bands are protected', gates.is_protected('server/os/pricingBands.ts'))
    check('4', 'escalation logic is protected', gates.is_protected('server/os/escalationNotify.ts'))
    check('4', 'payment/stripe is protected', gates.is_protected('server/os/checkout/stripe.ts'))
    check('4', 'auth is protected', gates.is_protected('server/_core/auth/options.ts'))
    check('4', 'an ordinary page is NOT protected', not gates.is_protected('client/src/pages/Home.tsx'))


# ── Gate 5: autonomy gate (watcher_audit + level) ────────────────────────────────────────────────
def gate5():
    check('5', "watcher_audit='outstanding' BLOCKS deploy", not gates.deploy_allowed('outstanding', 'l5'))
    check('5', "the long outstanding record BLOCKS deploy",
          not gates.deploy_allowed('outstanding — external Marcus watcher audit OUTSTANDING since 2026-07-26', 'l5'))
    check('5', "watcher_audit='passed' + l5 ALLOWS deploy", gates.deploy_allowed('passed', 'l5'))
    check('5', "passed but level l4 (< deploy floor) BLOCKS", not gates.deploy_allowed('passed', 'l4'))
    check('5', 'unreachable gate fails CLOSED', not gates.deploy_allowed('unreachable', 'manual'))


if __name__ == '__main__':
    for fn in (gate1, gate2, gate3, gate4, gate5):
        fn()
    by_gate = {}
    for gate, name, ok in RESULTS:
        by_gate.setdefault(gate, []).append((name, ok))
    labels = {'1': 'CIRCUIT BREAKER', '2': 'CI GATE', '3': 'DEPLOY-VERIFY', '4': 'PROTECTED PATHS', '5': 'AUTONOMY GATE'}
    all_ok = True
    for g in sorted(by_gate):
        passed = sum(1 for _, ok in by_gate[g] if ok)
        total = len(by_gate[g])
        all_ok = all_ok and passed == total
        print(f"\nGATE {g} — {labels[g]}: {passed}/{total} {'✅' if passed == total else '❌'}")
        for name, ok in by_gate[g]:
            print(f"   [{'PASS' if ok else 'FAIL'}] {name}")
    print(f"\n{'ALL GATES PASS ✅' if all_ok else 'SOME FAILED ❌'} — {sum(ok for _,_,ok in RESULTS)}/{len(RESULTS)} checks")
    sys.exit(0 if all_ok else 1)
