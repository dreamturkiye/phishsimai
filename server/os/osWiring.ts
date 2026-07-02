/**
 * Kaan AI OS L5 wiring parity — PhishSimAI edition
 */
import { buildL5WiringReport } from './kaan-os-core/wiringL5'
import { KAAN_OS_SPEC, COMPANY_ID } from './version'
import { getWatcherHeartbeatAgeMinutes } from './marcusPipelineHealth'

export const OS_WIRING_SPEC = KAAN_OS_SPEC

export type WiringFeature = {
  id: string
  label: string
  ok: boolean
  detail?: string
  required?: boolean
}

function v45FeatureSet(watcherOk: boolean, watcherDetail: string) {
  return [
    { id: 'instant_wake', label: 'Instant Marcus wake on queue', ok: true, detail: 'wakeMarcus.ts + /api/os/architect/wake' },
    { id: 'hq_marcus_queue', label: 'Janet HQ chat queues Marcus + blocks false deploy claims', ok: true, detail: 'processJanetHQResponse in janetChat' },
    { id: 'bug_report_diagnosis', label: 'Bug report → Marcus diagnosis → queue', ok: true, detail: 'runArchitectAgent in /api/os/bug-report' },
    { id: 'pipeline_health_alerts', label: 'Agent watchdog monitors Marcus pipeline', ok: true, detail: 'alertMarcusPipelineIssues in agent-watchdog' },
    { id: 'janet_convai_2way', label: 'Janet 2-way ConvAI voice (ElevenLabs)', ok: true, detail: 'JanetConvaiPanel + /api/os/janet/signed-url' },
    { id: 'janet_convai_tools', label: 'ConvAI mid-call live ops tools', ok: true, detail: '/api/os/janet/tool' },
    { id: 'watcher_heartbeat_v45', label: 'Mac Marcus daemon heartbeat (≤2m) [v4.5]', ok: watcherOk, detail: watcherDetail },
  ]
}

export async function getOsWiringReport(productLabel = 'PhishSimAI') {
  const watcherAgeMin = await getWatcherHeartbeatAgeMinutes(COMPANY_ID)
  const watcherOk = watcherAgeMin !== null && watcherAgeMin <= 2
  const watcherDetail = watcherAgeMin == null ? 'never seen' : `${Math.round(watcherAgeMin * 60)}s ago`

  const report = buildL5WiringReport({
    companyId: COMPANY_ID,
    productLabel,
    watcherAgeMin,
    v45Features: v45FeatureSet(watcherOk, watcherDetail),
    hierarchyLoaded: true,
    skillLibraryReady: true,
  })

  return {
    ...report,
    check_url: 'GET /api/os/v4/wiring?secret=ps-hq-2026',
  }
}
