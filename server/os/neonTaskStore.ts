import {
  assertValidDurableTask,
  validateDurableTask,
  type DurableTask,
  type PersistedTaskExecution,
  type TaskArtifact,
  type TaskStore,
  type TaskVerificationResult,
} from '@kaan/os-core'

export const DURABLE_TASK_CONTRACT_VERSION = 'durable-task-v1'

export type TaskSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, any>[]>

export interface NeonTaskStore extends TaskStore {
  claimTask(companyId: string): Promise<DurableTask | undefined>
  claimTaskById(taskId: string, companyId: string): Promise<DurableTask | undefined>
  getTaskByIdempotencyKey(companyId: string, idempotencyKey: string): Promise<DurableTask | undefined>
}

function json<T>(value: T | string | null | undefined, fallback: T): T {
  if (value == null) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function durableTaskFromRow(row: Record<string, any>): DurableTask {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    productId: String(row.company_id),
    owner: row.agent_id,
    issuer: row.issued_by,
    evidenceIds: json(row.evidence_ids, []),
    dependencyReports: json(row.dependency_reports, []),
    permittedCapability: row.permitted_capability,
    expectedKpiEffect: json(row.expected_kpi_effect, {
      kpiName: '',
      direction: 'maintain',
      rationale: '',
    }),
    acceptanceTest: json(row.acceptance_test, { description: '', expectedResult: '' }),
    idempotencyKey: row.idempotency_key ?? '',
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at ?? row.created_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined,
    status: row.status,
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
  }
}

function executionFromRow(row: Record<string, any>): PersistedTaskExecution | undefined {
  const artifact = json<TaskArtifact | null>(row.artifact, null)
  const verification = json<TaskVerificationResult | null>(row.verification, null)
  return artifact && verification ? { artifact, verification } : undefined
}

/**
 * Postgres/Neon DurableTask adapter. Claims and completion writes are single
 * compare-and-set statements so concurrent HTTP invocations cannot share work.
 */
export function createNeonTaskStore(sql: TaskSql): NeonTaskStore {
  return {
    async createTask(task) {
      assertValidDurableTask(task, { now: task.createdAt })
      const rows = await sql`
        INSERT INTO agent_tasks (
          id, agent_id, issued_by, title, description, priority, due_in_hours,
          status, company_id, evidence_ids, dependency_reports,
          dependency_freshness_at, permitted_capability, expected_kpi_effect,
          acceptance_test, idempotency_key, contract_version, created_at, updated_at
        ) VALUES (
          ${task.id}, ${task.owner}, ${task.issuer}, ${task.title}, ${task.description},
          'medium', 24, ${task.status}, ${task.companyId},
          ${JSON.stringify(task.evidenceIds)}::jsonb,
          ${JSON.stringify(task.dependencyReports)}::jsonb,
          ${task.updatedAt}, ${task.permittedCapability},
          ${JSON.stringify(task.expectedKpiEffect)}::jsonb,
          ${JSON.stringify(task.acceptanceTest)}::jsonb,
          ${task.idempotencyKey}, ${DURABLE_TASK_CONTRACT_VERSION}, ${task.createdAt}, ${task.updatedAt}
        )
        ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
        RETURNING *
      `
      if (rows.length > 0) return
      const existing = await sql`
        SELECT * FROM agent_tasks
        WHERE company_id=${task.companyId} AND idempotency_key=${task.idempotencyKey}
        LIMIT 1
      `
      if (!existing[0]) throw new Error(`Task idempotency write failed for ${task.idempotencyKey}`)
    },

    async getTask(taskId) {
      const rows = await sql`SELECT * FROM agent_tasks WHERE id=${taskId} LIMIT 1`
      return rows[0] ? durableTaskFromRow(rows[0]) : undefined
    },

    async getTasks(taskIds) {
      if (taskIds.length === 0) return []
      const rows = await sql`SELECT * FROM agent_tasks WHERE id = ANY(${taskIds})`
      return rows.map(durableTaskFromRow)
    },

    async getTaskByIdempotencyKey(companyId, idempotencyKey) {
      const rows = await sql`
        SELECT * FROM agent_tasks
        WHERE company_id=${companyId} AND idempotency_key=${idempotencyKey}
        LIMIT 1
      `
      return rows[0] ? durableTaskFromRow(rows[0]) : undefined
    },

    async claimTask(companyId) {
      const rows = await sql`
        UPDATE agent_tasks
        SET status='executing', started_at=COALESCE(started_at, NOW()),
            attempts=COALESCE(attempts, 0) + 1, updated_at=NOW()
        WHERE id = (
          SELECT id FROM agent_tasks
          WHERE company_id=${companyId} AND contract_version=${DURABLE_TASK_CONTRACT_VERSION} AND status='queued'
          ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                   WHEN 'medium' THEN 2 ELSE 3 END, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        ) AND contract_version=${DURABLE_TASK_CONTRACT_VERSION} AND status='queued'
        RETURNING *
      `
      if (!rows[0]) return undefined
      const task = durableTaskFromRow(rows[0])
      const issues = validateDurableTask(task, { now: new Date() })
      if (issues.length > 0) {
        await sql`
          UPDATE agent_tasks SET status='blocked', blocked_at=NOW(), updated_at=NOW(),
            janet_feedback=${`DurableTask validation failed: ${issues.map(i => i.code).join(', ')}`}
          WHERE id=${task.id} AND status='executing'
        `
        return undefined
      }
      return task
    },

    async claimTaskById(taskId, companyId) {
      const rows = await sql`
        UPDATE agent_tasks
        SET status='executing', started_at=COALESCE(started_at, NOW()),
            attempts=COALESCE(attempts, 0) + 1, updated_at=NOW()
        WHERE id=${taskId} AND company_id=${companyId}
          AND contract_version=${DURABLE_TASK_CONTRACT_VERSION} AND status='queued'
        RETURNING *
      `
      if (!rows[0]) return undefined
      const task = durableTaskFromRow(rows[0])
      const issues = validateDurableTask(task, { now: new Date() })
      if (issues.length === 0) return task
      await sql`
        UPDATE agent_tasks SET status='blocked', blocked_at=NOW(), updated_at=NOW(),
          janet_feedback=${`DurableTask validation failed: ${issues.map(i => i.code).join(', ')}`}
        WHERE id=${task.id} AND status='executing'
      `
      return undefined
    },

    async persistExecution(task, artifact, verification) {
      assertValidDurableTask(task, { now: task.completedAt ?? task.updatedAt, artifact, verification })
      const rows = await sql`
        UPDATE agent_tasks
        SET status='completed', artifact=${JSON.stringify(artifact)}::jsonb,
            verification=${JSON.stringify(verification)}::jsonb,
            result=${artifact.locator}, verified_at=${verification.verifiedAt},
            completed_at=${task.completedAt}, updated_at=${task.updatedAt}
        WHERE id=${task.id} AND company_id=${task.companyId}
          AND idempotency_key=${task.idempotencyKey}
          AND (
            status='executing'
            OR (
              status='completed'
              AND artifact=${JSON.stringify(artifact)}::jsonb
              AND verification=${JSON.stringify(verification)}::jsonb
            )
          )
        RETURNING id
      `
      if (!rows[0]) {
        throw new Error(`Atomic execution persist rejected for task ${task.id}`)
      }
    },

    async getExecution(taskId) {
      const rows = await sql`
        SELECT artifact, verification FROM agent_tasks WHERE id=${taskId} LIMIT 1
      `
      return rows[0] ? executionFromRow(rows[0]) : undefined
    },
  }
}
