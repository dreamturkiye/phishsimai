import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  EMPTY_FOUNDER_1TO1,
  FOUNDER_1TO1_CAP,
  FOUNDER_1TO1_CLASS,
  FOUNDER_1TO1_ESCALATE_HOURS,
  FOUNDER_1TO1_OPEN_STATUSES,
  WARM_EXHAUSTED_TOUCHES,
  founderOneToOneDraftBlocksRequeue,
  founderOneToOneDraftBody,
  founderOneToOneTelegramHtml,
  isOooOrAutoReplyInbound,
  queueFounderOneToOneReviews,
} from './founderOneToOne'
import { WARM_CTA_TOUCHES } from './sequences'
import { DAILY_SEND_LIMIT } from './sequences'

describe('founder 1:1 queue — exhausted warm, NOT email', () => {
  it('does not invent touch 93 and does not raise the daily send cap', () => {
    expect(WARM_CTA_TOUCHES).toEqual([90, 91, 92])
    expect(WARM_EXHAUSTED_TOUCHES).toEqual([90, 91, 92])
    expect(WARM_CTA_TOUCHES).not.toContain(93)
    expect(DAILY_SEND_LIMIT).toBe(20)
    expect(FOUNDER_1TO1_CLASS).toBe('founder_1to1')
    expect(FOUNDER_1TO1_CAP).toBe(5)
    expect(FOUNDER_1TO1_ESCALATE_HOURS).toBe(2)
  })

  it('drafts a founder-personal follow-up with the /trial URL and forbids sequence send', () => {
    const body = founderOneToOneDraftBody({
      id: 'lead-1',
      name: 'Pat',
      company: 'Greybox MSP',
      email: 'pat@greybox.example',
      last_reply_snippet: 'send me pricing',
    })
    expect(body).toMatch(/do not send via Sarah sequence/i)
    expect(body).toMatch(/Do not add touch 93/)
    expect(body).toContain('https://phishsimai.com/trial')
    expect(body).toContain('utm_source=founder_1to1')
    expect(body).toContain('pat%40greybox.example')
    expect(body).toContain('send me pricing')
    expect(body).toMatch(/Personal email|call|LinkedIn DM/)
    const src = readFileSync('server/os/founderOneToOne.ts', 'utf8')
    expect(src).not.toMatch(/sendEmail\(/)
    expect(src).not.toMatch(/claimSequenceSend/)
    expect(src).not.toMatch(/touch,\s*93/)
    expect(src).toContain("classification = ${FOUNDER_1TO1_CLASS}")
    expect(EMPTY_FOUNDER_1TO1.queued).toBe(0)
  })

  it('Telegram copy tells the founder this is not an email blast', () => {
    const html = founderOneToOneTelegramHtml({
      queued: [{ leadId: '1', email: 'pat@x.com', company: 'Acme' }],
      kind: 'queued',
    })
    expect(html).toMatch(/FOUNDER 1:1/)
    expect(html).toMatch(/NOT email/)
    expect(html).toMatch(/touch 93/)
    expect(html).toContain('Acme')
  })

  it('OOO / auto-reply inbound is not a warm close and must not queue founder_1to1', () => {
    expect(isOooOrAutoReplyInbound('I am out of the office until Monday and will return then')).toBe(true)
    expect(isOooOrAutoReplyInbound('This is an automatic reply: away from my desk')).toBe(true)
    expect(isOooOrAutoReplyInbound('send me pricing')).toBe(false)
    expect(isOooOrAutoReplyInbound('Thanks, I will return next week after our board meeting')).toBe(false)
    const src = readFileSync('server/os/founderOneToOne.ts', 'utf8')
    expect(src).toContain('isOooOrAutoReplyInbound')
    expect(src).toContain("classification = 'auto_reply'")
    expect(src).toContain('dismissOooFounderOneToOne')
  })

  it('conversion shift and HQ surface the queue', () => {
    const engine = readFileSync('server/os/conversionEngine.ts', 'utf8')
    expect(engine).toContain('queueFounderOneToOneReviews')
    expect(engine).toContain('founderOneToOne')
    expect(readFileSync('server/os/routes.ts', 'utf8')).toContain('listFounderOneToOneQueue')
    expect(readFileSync('server/os/cgoMandate.ts', 'utf8')).toMatch(/founder 1:1|founder-review 1:1/)
    expect(readFileSync('server/os/trialAcquisitionChannels.ts', 'utf8')).toContain('founder_1to1')
  })

  it('dismissed / closed / archived founder_1to1 drafts do not block re-queue; pending_review does', () => {
    expect([...FOUNDER_1TO1_OPEN_STATUSES]).toEqual(['pending_review'])
    expect(founderOneToOneDraftBlocksRequeue('pending_review')).toBe(true)
    expect(founderOneToOneDraftBlocksRequeue('dismissed')).toBe(false)
    expect(founderOneToOneDraftBlocksRequeue('closed')).toBe(false)
    expect(founderOneToOneDraftBlocksRequeue('archived')).toBe(false)
    expect(founderOneToOneDraftBlocksRequeue('founder_1to1_archived')).toBe(false)

    const src = readFileSync('server/os/founderOneToOne.ts', 'utf8')
    const autoReplyIdx = src.indexOf("classification = 'auto_reply'")
    const eligibility = src.slice(src.indexOf('AND NOT EXISTS'), autoReplyIdx === -1 ? undefined : autoReplyIdx)
    expect(eligibility).toContain("d.classification = ${FOUNDER_1TO1_CLASS}")
    expect(eligibility).toContain(`AND d.status IN ('${FOUNDER_1TO1_OPEN_STATUSES.join("', '")}')`)
    expect(eligibility).not.toMatch(/AND NOT EXISTS \([\s\S]*classification = \$\{FOUNDER_1TO1_CLASS\}\s*\)/)
  })

  it('re-queues an exhausted warm lead whose prior founder_1to1 draft was dismissed', async () => {
    const calls: string[] = []
    const lead = {
      id: '00000000-0000-4000-8000-0000000000aa',
      name: 'Pat',
      company: 'Greybox MSP',
      email: 'pat@greybox.example',
      last_reply_snippet: 'send me pricing',
    }
    const tagged = (strings: TemplateStringsArray, ..._values: unknown[]) => {
      const q = strings.join('?')
      calls.push(q)
      if (q.includes('INSERT INTO outreach_reply_drafts')) {
        return Promise.resolve([{ id: 'draft-dismissed-requeue' }])
      }
      if (q.includes('FROM ps_outreach_leads l') && q.includes('NOT EXISTS')) {
        return Promise.resolve([lead])
      }
      return Promise.resolve([])
    }

    const out = await queueFounderOneToOneReviews(tagged as any)
    expect(out.queued).toBe(1)
    expect(out.drafts[0]?.leadId).toBe(lead.id)
    expect(out.reason).toMatch(/queued 1 founder 1:1/)

    const eligibility = calls.find((q) => q.includes('FROM ps_outreach_leads') && q.includes('NOT EXISTS')) || ''
    expect(eligibility).toMatch(/d\.status IN \('pending_review'\)/)
    expect(eligibility).toMatch(/touch IN \(90, 91, 92\)/)
    expect(eligibility).not.toMatch(/\b93\b/)
    expect(calls.some((q) => /outreach_sequence_outbox/.test(q) && /INSERT/i.test(q))).toBe(false)
    expect(calls.some((q) => /INSERT INTO outreach_reply_drafts/.test(q))).toBe(true)
  })
})
