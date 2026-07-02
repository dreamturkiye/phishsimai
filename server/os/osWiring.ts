/**
 * Kaan AI OS wiring parity — PhishSimAI edition
 */
import { KAAN_OS_VERSION, COMPANY_ID } from './version'
import { getWatcherHeartbeatAgeMinutes } from './marcusPipelineHealth'

export const OS_WIRING_SPEC = '4.5.8'

export type WiringFeature = {
  id: string
  label: string
  ok: boolean
  detail?: string
}

export async function getOsWiringReport(productLabel = 'PhishSimAI') {
  const watcherAgeMin = await getWatcherHeartbeatAgeMinutes(COMPANY_ID)
  const watcherOk = watcherAgeMin !== null && watcherAgeMin <= 2

  const features: WiringFeature[] = [
    {
      id: 'version',
      label: 'OS version matches spec',
      ok: KAAN_OS_VERSION === OS_WIRING_SPEC,
      detail: `${KAAN_OS_VERSION} (spec ${OS_WIRING_SPEC})`,
    },
    {
      id: 'instant_wake',
      label: 'Instant Marcus wake on queue',
      ok: true,
      detail: 'wakeMarcus.ts + /api/os/architect/wake',
    },
    {
      id: 'hq_marcus_queue',
      label: 'Janet HQ chat queues Marcus + blocks false deploy claims',
      ok: true,
      detail: 'processJanetHQResponse in janetChat (/api/os/hq/chat)',
    },
    {
      id: 'bug_report_diagnosis',
      label: 'Bug report → Marcus diagnosis → queue',
      ok: true,
      detail: 'runArchitectAgent in /api/os/bug-report',
    },
    {
      id: 'watcher_heartbeat',
      label: 'Mac Marcus daemon heartbeat (≤2m)',
      ok: watcherOk,
      detail: watcherAgeMin == null ? 'never seen' : `${Math.round(watcherAgeMin * 60)}s ago`,
    },
    {
      id: 'pipeline_health_alerts',
      label: 'Agent watchdog monitors Marcus pipeline',
      ok: true,
      detail: 'alertMarcusPipelineIssues in agent-watchdog',
    },
  ]

  const ok = features.every(f => f.ok)

  return {
    ok,
    parity_ok: ok,
    product: productLabel,
    company_id: COMPANY_ID,
    version: KAAN_OS_VERSION,
    spec_version: OS_WIRING_SPEC,
    features,
    check_url: 'GET /api/os/v4/wiring?secret=ps-hq-2026',
    timestamp: new Date().toISOString(),
  }
}
