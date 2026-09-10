import type { CorePorts, DeploymentVerification } from '@kaan/os-core/ports'
import {
  gradeEvalOutput,
  loadEvalCorpus,
  type GradedEvalResult,
} from '@kaan/os-core/evals'

export interface PhishSimCoreCanaryOptions {
  expectedCommit?: string
  expectedDomain?: string
  servingHost?: string
}

export interface PhishSimCoreCanaryResult {
  caseId: string
  deployment: DeploymentVerification
  grade: GradedEvalResult
  observedAt: string
  sqlReachable: boolean
}

/**
 * Exercise the installed package boundary through injected ports. Nothing runs
 * at import time, and this is not wired into a production route or scheduled job.
 */
export async function runPhishSimCorePackageCanary(
  ports: Readonly<CorePorts>,
  options: PhishSimCoreCanaryOptions = {},
): Promise<PhishSimCoreCanaryResult> {
  const corpus = loadEvalCorpus({
    agents: ['finn'],
    products: ['phishsimai'],
    kinds: ['golden'],
  })
  const testCase = corpus.cases[0]
  if (!testCase) throw new Error('The package has no PhishSimAI/Finn golden eval case')

  const sqlResult = await ports.sql`SELECT ${testCase.id}::text AS case_id`
  const completion = await ports.llm.complete({
    purpose: 'reasoning',
    maxTokens: 800,
    prompt: JSON.stringify({
      prompt: testCase.prompt,
      evidence: testCase.evidence,
      arithmeticAssertions: testCase.arithmeticAssertions,
    }),
  })
  const grade = gradeEvalOutput(testCase, completion.text)
  const deployment = await ports.deployment.verify({
    productId: 'phishsimai',
    expectedDomain: options.expectedDomain ?? 'phishsimai.com',
    expectedCommit: options.expectedCommit,
    servingHost: options.servingHost,
  })
  const observedAt = ports.clock.now().toISOString()
  const sqlReachable = sqlResult !== undefined

  await ports.telemetry.emit({
    name: 'phishsim.core_package_canary',
    level: grade.passed && deployment.ok && sqlReachable ? 'info' : 'warn',
    attributes: {
      caseId: testCase.id,
      deploymentOk: deployment.ok,
      evalPassed: grade.passed,
      packageCorpusVersion: corpus.version,
      sqlReachable,
    },
  })

  return {
    caseId: testCase.id,
    deployment,
    grade,
    observedAt,
    sqlReachable,
  }
}
