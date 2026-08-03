// ─────────────────────────────────────────────────────────────────────────────
//  PS-CI-DETECTORS-01 — Rex's and Dex's SOURCE detectors, run where source exists.
//
//  WHY THESE MOVED OUT OF PRODUCTION
//    Both agents read repository .ts files. A bundled serverless deploy ships none, so in prod they
//    examine zero units and — correctly — report NOT_CHECKED. That honest abstention is not a
//    capability. It just means the check never runs.
//
//    The defects they hunt (a module that asserts facts it never measured; a send path missing a
//    consent rail) can only ENTER at commit time. Catching them here fails the build BEFORE the bad
//    code ships, which is strictly better than noticing it in tomorrow's standup. Prevention over
//    detection, for the class of defect where prevention is available.
//
//  PROD KEEPS REPORTING NOT_CHECKED FOR THESE DIMENSIONS, AND THAT LINE STAYS IN THE BRIEF.
//    It is true, and a true "I did not check this here" is worth more than a comfortable silence.
//
//  THIS SCRIPT EXITS NON-ZERO ON ANY FINDING. It is a gate, not a report.
// ─────────────────────────────────────────────────────────────────────────────
import {
  detectFabricatedWriters,
  detectPricingDrift,
  readSource,
  SCAN_TARGETS,
  type Incident,
} from '../server/os/agents/rex'
import { auditSendPaths, detectUnregisteredSenders, DEX_SCAN_TARGETS } from '../server/os/agents/dex'

const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const DIM = '\x1b[2m'
const OFF = '\x1b[0m'

let failed = false
const notChecked: string[] = []

function report(label: string, incidents: Incident[], scanned: number, total: number) {
  if (scanned === 0) {
    // The same law the agents obey: an empty scan is never a pass. In CI it is worse than that —
    // it means the check silently did nothing, so it fails the build rather than passing quietly.
    console.error(`${RED}✗ ${label}: 0/${total} units readable — the check did not run. This is a CI failure, not a pass.${OFF}`)
    failed = true
    return
  }
  if (!incidents.length) {
    console.log(`${GREEN}✓ ${label}${OFF} ${DIM}— clean across ${scanned}/${total} units${OFF}`)
    return
  }
  failed = true
  console.error(`${RED}✗ ${label} — ${incidents.length} finding(s) across ${scanned}/${total} units${OFF}`)
  for (const i of incidents) {
    console.error(`${RED}    [${i.severity}] ${i.subject}${OFF}`)
    console.error(`${DIM}      ${i.summary}${OFF}`)
  }
}

console.log('── Rex + Dex static detectors (source-reading, run in CI where source exists) ──\n')

// ── Rex ──────────────────────────────────────────────────────────────────────
const rexFiles = SCAN_TARGETS.map((p) => readSource(p))
const rexReadable = rexFiles.filter((f) => f.text !== null).length
notChecked.push(...rexFiles.filter((f) => f.text === null).map((f) => f.relPath))

const fab = detectFabricatedWriters(rexFiles)
report('fabricated writers (asserts facts, reads no data)', fab.incidents, rexReadable, SCAN_TARGETS.length)

// livePricesUsd is null here on purpose: CI must not depend on a Stripe key to gate a code smell.
// A hardcoded price literal is a defect whether or not it happens to match Stripe today, and the
// copy-vs-Stripe comparison is Finn's job at runtime, against the build-time claims snapshot.
const drift = detectPricingDrift(rexFiles, null)
report('hardcoded price literals in revenue code', drift.incidents, rexReadable, SCAN_TARGETS.length)

// ── Dex ──────────────────────────────────────────────────────────────────────
const dexFiles = DEX_SCAN_TARGETS.map((p) => readSource(p))
const dexReadable = dexFiles.filter((f) => f.text !== null).length
notChecked.push(...dexFiles.filter((f) => f.text === null).map((f) => f.relPath))

const paths = auditSendPaths(dexFiles)
report('send-path rail coverage (no path exempt)', paths.incidents, dexReadable, DEX_SCAN_TARGETS.length)

const unreg = detectUnregisteredSenders(dexFiles)
report('unregistered senders', unreg.incidents, dexReadable, DEX_SCAN_TARGETS.length)

// ── Verdict ──────────────────────────────────────────────────────────────────
const unique = [...new Set(notChecked)]
if (unique.length) {
  console.error(`\n${RED}✗ ${unique.length} scan target(s) unreadable — a moved or renamed file makes a detector silently scan nothing:${OFF}`)
  for (const f of unique) console.error(`${RED}    ${f}${OFF}`)
  failed = true
}

if (failed) {
  console.error(`\n${RED}BUILD FAILED — static detector findings above must be fixed before this ships.${OFF}`)
  process.exit(1)
}
console.log(`\n${GREEN}All static detectors clean.${OFF}`)
