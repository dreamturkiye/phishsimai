import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { claimSequenceSend, completeSequenceSend, sequenceIdempotencyKey } from './sequences'

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), 'utf8')

describe('daily agent cron containment', () => {
  const dailyAgents = ['rex', 'dex', 'aria', 'mason', 'scout', 'finn', 'vera', 'nova']

  it('routes all eight daily endpoints through the trusted helper', () => {
    for (const agent of dailyAgents) {
      const source = read(`server/os/agents/${agent}.ts`)
      expect(source, agent).toContain("import { requireTrustedCron } from '../cronAuth'")
      expect(source, agent).toContain('if (!requireTrustedCron(req, res)) return')
      expect(source, agent).not.toContain("req.headers?.['x-vercel-cron']")
    }
  })

  it('also protects watchdog and the reply sweep without trusting Vercel metadata', () => {
    for (const file of ['server/os/agentWatchdog.ts', 'server/os/agents/salesReplies.ts']) {
      const source = read(file)
      expect(source, file).toContain('requireTrustedCron(req, res)')
      expect(source, file).not.toContain("req.headers?.['x-vercel-cron']")
    }
  })
})

describe('outbound sequence idempotency and caps', () => {
  it('uses a stable provider/outbox key per lead and touch', () => {
    expect(sequenceIdempotencyKey('lead-123', 3)).toBe('phishsimai:outreach:lead-123:touch:3')
    const source = read('server/os/sequences.ts')
    expect(source).toContain("'Idempotency-Key': idempotencyKey")
    expect(source).toContain('INSERT INTO outreach_sequence_outbox')
  })

  it('atomically claims an unsent outbox key', async () => {
    const calls: string[] = []
    const sql = async (strings: TemplateStringsArray, ...values: any[]) => {
      calls.push(strings.join('?'))
      return [{ claim_token: values[4], provider_message_id: null }]
    }
    const claim = await claimSequenceSend(sql, '00000000-0000-4000-8000-000000000001', 1, 'lead@example.com')
    expect(claim.claimed).toBe(true)
    expect(claim.claimToken).toMatch(/^[0-9a-f-]{36}$/)
    expect(calls[0]).toContain('ON CONFLICT (idempotency_key) DO UPDATE')
  })

  it('reconciles an already accepted provider message without sending again', async () => {
    let call = 0
    const sql = async () => {
      call++
      return call === 1 ? [] : [{ provider_message_id: 'resend-existing-id' }]
    }
    const claim = await claimSequenceSend(sql, '00000000-0000-4000-8000-000000000001', 1, 'lead@example.com')
    expect(claim).toEqual({
      claimed: false,
      claimToken: null,
      providerMessageId: 'resend-existing-id',
    })
  })

  it('fails closed if provider acceptance cannot be committed to the outbox', async () => {
    const sql = async () => []
    await expect(completeSequenceSend(
      sql,
      '00000000-0000-4000-8000-000000000001',
      1,
      '00000000-0000-4000-8000-000000000002',
      'resend-id',
    )).rejects.toThrow('outbox claim lost')
  })

  it('uses and increments the dedicated follow-up counter', () => {
    const source = read('server/os/sequences.ts')
    expect(source).toContain('if (followUpSent >= followUpCap) break')
    expect(source).toContain('followUpSent++')
    expect(source).not.toContain('if (totalSent >= DAILY_SEND_LIMIT) break')
  })

  it('ships only additive idempotent schema changes', () => {
    const migration = read('drizzle/pg/0031_agent_safety_containment.sql')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS classification_claim_token')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS outreach_sequence_outbox')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS completion_evidence')
  })
})

describe('Marcus completion ordering', () => {
  it('merges before migrating, proving deployment, canarying, and marking done', () => {
    const workflow = read('.github/workflows/marcus.yml')
    const merge = workflow.indexOf('Wait for required gates and merge')
    const migration = workflow.indexOf('Apply additive migrations after merge')
    const deploy = workflow.indexOf('Verify Vercel production is Ready for merged SHA')
    const canary = workflow.indexOf('Run post-deploy health and canary')
    const done = workflow.indexOf('Mark task completed with production proof')
    expect(merge).toBeGreaterThan(-1)
    expect(merge).toBeLessThan(migration)
    expect(migration).toBeLessThan(deploy)
    expect(deploy).toBeLessThan(canary)
    expect(canary).toBeLessThan(done)
    expect(workflow).not.toContain('Apply pending migrations to PROD DB (before code can deploy)')
  })

  it('uses authorization headers on the modified deploy/canary path', () => {
    const workflow = read('.github/workflows/marcus.yml')
    const smoke = read('server/os/architectAgent.ts')
    expect(workflow).toContain('-H "Authorization: Bearer $CRON_SECRET"')
    expect(smoke).not.toMatch(/agent-watchdog\?secret=/)
    expect(smoke).not.toMatch(/api\/os\/hq\?secret=/)
  })
})
