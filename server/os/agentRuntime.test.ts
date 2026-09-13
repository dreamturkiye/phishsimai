import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { classifySelfModification, formatRuntimeContext } from './agentRuntimePolicy'

describe('L5.7 agent runtime policy', () => {
  it('classifies idle, continue, Marcus, and hard-stop actions', () => {
    expect(classifySelfModification('none')).toBe('none')
    expect(classifySelfModification('send Dex-gated trial CTA to warm replies')).toBe('continue')
    expect(classifySelfModification('queue Marcus to patch server/os/funnelHealth.ts')).toBe('marcus')
    expect(classifySelfModification('change price to $99')).toBe('hard_stop')
    expect(classifySelfModification('raise price on Growth')).toBe('hard_stop')
    expect(classifySelfModification('sign a contract with a reseller')).toBe('hard_stop')
  })

  it('injects the open thread and lessons so the next cron resumes', () => {
    const block = formatRuntimeContext({
      working: {
        currentGoal: 'convert warm replies',
        nextAction: 'send trial CTA to 3 warm leads',
        lastAssessment: 'replies exist, no CTA sent',
        updatedAt: '2026-09-13T12:00:00.000Z',
      },
      lessons: 'LEARNED LESSONS:\n- [✗] insurance opener failed',
      reflections: 'RECENT MISSES:\n- analysis without a send',
    })
    expect(block).toContain('OPEN THREAD')
    expect(block).toContain('send trial CTA to 3 warm leads')
    expect(block).toContain('insurance opener failed')
    expect(block).toContain('analysis without a send')
    expect(block).toContain('L5.7 SELF-MODIFICATION')
    expect(block).not.toContain('$149')
  })

  it('does not invent an open thread when next action is none', () => {
    const block = formatRuntimeContext({
      working: { currentGoal: '', nextAction: 'none', lastAssessment: '', updatedAt: null },
      lessons: '',
      reflections: '',
    })
    expect(block).not.toContain('OPEN THREAD')
    expect(block).toContain('Working memory survives')
  })
})

describe('daily loop and task execution actually load and persist the runtime', () => {
  it('reasonAndAct resumes the open thread and refuses hard-stop queues', () => {
    const src = readFileSync('server/os/agents/reason.ts', 'utf8')
    expect(src).toContain('loadAgentRuntime')
    expect(src).toContain('persistAgentRuntime')
    expect(src).toContain('Resume the OPEN THREAD')
    expect(src).toContain("kind !== 'hard_stop'")
    expect(src).toContain('notify: false')
  })

  it('executeTask injects working memory and writes the next thread', () => {
    const src = readFileSync('server/lib/kaan_os_v4.ts', 'utf8')
    expect(src).toContain('loadAgentRuntime')
    expect(src).toContain('persistAgentRuntime')
    expect(src).toContain('runtime?.contextBlock')
  })

  it('does not let agents rewrite Dex rails or prices', () => {
    const policy = readFileSync('server/os/agentRuntimePolicy.ts', 'utf8')
    expect(policy).toContain('You may NOT change price, billing')
    expect(policy).toContain('Dex send rails')
    const runtime = readFileSync('server/os/agentRuntime.ts', 'utf8')
    expect(runtime).toContain("nextAction = kind === 'hard_stop' ? 'escalate_hard_stop_to_founder'")
    expect(runtime).not.toContain('assertSendable =')
  })
})
