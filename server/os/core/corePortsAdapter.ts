import {
  createCorePorts,
  createDeploymentVerificationPort,
  createLlmPort,
  createSqlPort,
  createTelemetryPort,
  type ClockPort,
  type CorePorts,
  type DeploymentVerification,
  type DeploymentVerificationPort,
  type LlmPort,
  type SqlPort,
  type TelemetryEvent,
  type TelemetryPort,
} from '@kaan/os-core/ports'

export interface PhishSimCoreAdapterOptions {
  clock?: ClockPort
  deployment?: DeploymentVerificationPort
  llm?: LlmPort
  sql?: SqlPort
  telemetry?: TelemetryPort
}

function createPhishSimSqlPort(): SqlPort {
  return createSqlPort(async (text, values) => {
    const { getSql } = await import('../conn')
    return getSql().query(text, [...values] as never[])
  })
}

function createPhishSimLlmPort(): LlmPort {
  return createLlmPort(async request => {
    const { llmComplete } = await import('../llmChat')
    const result = await llmComplete({
      messages: [{ role: 'user', content: request.prompt }],
      max_tokens: request.maxTokens,
    })
    return {
      text: result.text,
      provider: result.provider,
      tokens: result.usage?.total_tokens ?? 0,
    }
  })
}

function errorDetails(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message, stack: error.stack }
  return { message: String(error) }
}

function severityFor(event: TelemetryEvent): 'critical' | 'high' | 'medium' | 'low' {
  if (event.level === 'error') return 'high'
  if (event.level === 'warn') return 'medium'
  return 'low'
}

function createPhishSimTelemetryPort(): TelemetryPort {
  return createTelemetryPort(async event => {
    const context = {
      source: 'os-core',
      operation: event.name,
      level: event.level ?? 'info',
      ...(event.attributes ?? {}),
    }

    if (event.error !== undefined) {
      const details = errorDetails(event.error)
      const [{ captureServerError }, { captureErrorToBugReport }] = await Promise.all([
        import('../sentryServer'),
        import('../sentryBridge'),
      ])
      captureServerError(event.error, context)
      await captureErrorToBugReport({
        message: details.message,
        stack: details.stack,
        severity: severityFor(event),
        source: `os-core:${event.name}`,
      })
      return
    }

    const level = event.level === 'debug'
      ? 'debug'
      : event.level === 'warn'
        ? 'warn'
        : event.level === 'error'
          ? 'error'
          : 'info'
    console[level](`[os-core] ${event.name}`, event.attributes ?? {})
  })
}

function hostFromUrl(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function deploymentError(
  error: unknown,
): DeploymentVerification {
  const details = errorDetails(error)
  return {
    ok: false,
    ready: false,
    domainMatch: false,
    commitMatch: null,
    actualDomains: [],
    context: 'remote',
    error: details.message,
  }
}

function createPhishSimDeploymentPort(
  telemetry: TelemetryPort,
): DeploymentVerificationPort {
  return createDeploymentVerificationPort(async request => {
    try {
      const { verifyDeployTarget } = await import('../deployVerify')
      const result = await verifyDeployTarget(undefined, `https://${request.expectedDomain}`)
      const actualDomain = hostFromUrl(result.evidence.finalUrl)
      const actualCommit = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || undefined
      const commitMatch = request.expectedCommit && actualCommit
        ? request.expectedCommit === actualCommit
        : null
      const ready = result.evidence.reachable
        && result.evidence.status !== null
        && result.evidence.status >= 200
        && result.evidence.status < 400
      const domainMatch = result.match === true
      const ok = domainMatch && ready && commitMatch !== false

      if (result.match !== null) {
        try {
          const { makeSqlBreakerDeps, recordTaskOutcome } = await import('../circuitBreaker')
          const mismatch = result.match ? undefined : new Error(result.reason)
          await recordTaskOutcome(
            makeSqlBreakerDeps(),
            request.productId,
            'core-package:deploy-verify',
            result.match,
            mismatch,
            result.reason,
          )
        } catch (error) {
          await telemetry.emit({
            name: 'phishsim.core_deployment_breaker.failed',
            level: 'error',
            attributes: { productId: request.productId },
            error,
          })
        }
      }

      return {
        ok,
        ready,
        domainMatch,
        commitMatch,
        actualDomains: actualDomain ? [actualDomain] : [],
        actualCommit,
        context: 'remote',
        error: ok ? undefined : result.reason,
      }
    } catch (error) {
      await telemetry.emit({
        name: 'phishsim.core_deployment_verify.failed',
        level: 'error',
        attributes: { productId: request.productId },
        error,
      })
      return deploymentError(error)
    }
  })
}

/**
 * Construct PhishSim-owned adapters without reading credentials or connecting
 * to providers. Existing database, LLM, deploy, breaker, and error paths are
 * resolved only when their corresponding port is invoked.
 */
export function buildPhishSimCorePorts(
  options: PhishSimCoreAdapterOptions = {},
): Readonly<CorePorts> {
  const telemetry = options.telemetry ?? createPhishSimTelemetryPort()
  return createCorePorts({
    sql: options.sql ?? createPhishSimSqlPort(),
    llm: options.llm ?? createPhishSimLlmPort(),
    deployment: options.deployment ?? createPhishSimDeploymentPort(telemetry),
    telemetry,
    clock: options.clock,
  })
}
