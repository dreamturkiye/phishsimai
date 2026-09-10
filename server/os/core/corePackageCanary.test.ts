import { describe, expect, it } from 'vitest'
import {
  createClockPort,
  createCorePorts,
  createDeploymentVerificationPort,
  createLlmPort,
  createSqlPort,
  createTelemetryPort,
  type TelemetryEvent,
} from '@kaan/os-core/ports'
import { buildPhishSimCorePorts } from './corePortsAdapter'
import { runPhishSimCorePackageCanary } from './packageCanary'

describe('@kaan/os-core PhishSimAI package canary', () => {
  it('loads and grades the package corpus through fake ports', async () => {
    const sqlCalls: Array<{ text: string; values: readonly unknown[] }> = []
    const telemetry: TelemetryEvent[] = []
    const ports = createCorePorts({
      sql: createSqlPort(async (text, values) => {
        sqlCalls.push({ text, values })
        return [{ case_id: values[0] }]
      }),
      llm: createLlmPort(async request => {
        expect(request.purpose).toBe('reasoning')
        expect(request.prompt).toContain('net_billed')
        return {
          provider: 'fake-llm',
          tokens: 42,
          text: JSON.stringify({
            status: 'answered',
            summary: 'Gross billed revenue is $1,000 and net billed revenue is $950.',
            facts: [
              {
                claim: '100 seats were billed at $10 and $50 in credits were issued.',
                evidenceIds: ['billing-ledger'],
              },
            ],
            calculations: [
              { assertionId: 'gross_billed', value: 1000, evidenceIds: ['billing-ledger'] },
              { assertionId: 'net_billed', value: 950, evidenceIds: ['billing-ledger'] },
            ],
            actions: [],
            safety: { abstained: false, reasons: [] },
          }),
        }
      }),
      deployment: createDeploymentVerificationPort(async request => ({
        ok: true,
        ready: true,
        domainMatch: request.expectedDomain === 'phishsimai.com',
        commitMatch: true,
        deploymentId: 'fake-deployment',
        actualDomains: ['phishsimai.com'],
        actualCommit: 'abc123',
        context: 'remote',
      })),
      telemetry: createTelemetryPort(event => {
        telemetry.push(event)
      }),
      clock: createClockPort(() => new Date('2026-09-10T12:00:00.000Z')),
    })

    const result = await runPhishSimCorePackageCanary(ports, {
      expectedCommit: 'abc123',
    })

    expect(result.caseId).toBe('operational-v2:golden:finn:phishsimai')
    expect(result.grade.passed).toBe(true)
    expect(result.grade.score).toBe(100)
    expect(result.deployment.ok).toBe(true)
    expect(result.sqlReachable).toBe(true)
    expect(result.observedAt).toBe('2026-09-10T12:00:00.000Z')
    expect(sqlCalls).toEqual([{
      text: 'SELECT $1::text AS case_id',
      values: ['operational-v2:golden:finn:phishsimai'],
    }])
    expect(telemetry).toHaveLength(1)
    expect(telemetry[0]?.attributes?.packageCorpusVersion).toBe('operational-v2')
  })

  it('constructs production adapters without reading live secrets', () => {
    const ports = buildPhishSimCorePorts({
      clock: createClockPort(() => new Date('2026-09-10T12:00:00.000Z')),
    })

    expect(Object.isFrozen(ports)).toBe(true)
    expect(ports.clock.now().toISOString()).toBe('2026-09-10T12:00:00.000Z')
  })

  it('allows every production boundary to be replaced by a fake', () => {
    const sql = createSqlPort(async () => [])
    const llm = createLlmPort(async () => ({ text: '{}', provider: 'fake', tokens: 0 }))
    const deployment = createDeploymentVerificationPort(async () => ({
      ok: true,
      ready: true,
      domainMatch: true,
      commitMatch: null,
      actualDomains: ['phishsimai.com'],
      context: 'remote',
    }))
    const telemetry = createTelemetryPort(() => {})

    const ports = buildPhishSimCorePorts({ sql, llm, deployment, telemetry })

    expect(ports.sql).toBe(sql)
    expect(ports.llm).toBe(llm)
    expect(ports.deployment).toBe(deployment)
    expect(ports.telemetry).toBe(telemetry)
  })
})
