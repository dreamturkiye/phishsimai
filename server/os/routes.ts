import { Request, Response } from 'express'
import { janetChat } from './janet'
import { llmComplete } from './llmChat'
import { runLeadResearcher, runLeadDiscover } from './agents/leadResearcher'
import { getAgentHealth } from './agentHealth'
import { runSequence, runFullSequence } from './sequences'
import { runWatchdog } from './watchdog'
import { runHeartbeat } from './heartbeat'
import { processReply } from './replyParser'
import { recallContext, recallMemory, rememberFact, seedPhishSimMemory } from './memory'
import { sendTelegram } from './telegram'
import { ensureHqTables, formatOsError, getSql } from './conn'
import { handleIncomingTelegram } from './telegramCommands'
import { getTelegramConfig, sendTelegramTest, registerTelegramWebhook } from './telegram'
import { ingestFounderFile, storeFounderUpload, formatAttachmentsForPrompt } from './founderIngest'
import { resolveLinkedBug } from './selfHeal'
import { recordMarcusDeployOutcome } from './marcus'
import { recordMarcusOutcome, makeMarcusBreakerDeps } from './marcusBreaker'
import { dispatchMarcusWake } from './wakeMarcus'
import { queueJanetArchitectTask } from './selfHeal'
import {
  runJanetFullOrchestration, getOSStatus, runDailyStandup, runWeeklyReview,
  talkToAgent, janetTellAgent, issueTask, executeTask, reviewTask,
  AGENTS, AgentId
} from '../lib/kaan_os_v4'
import { cronAgentWatchdog } from './agentWatchdog'
import { buildJanetCgoSummary, type JanetCgoDeps } from './l5Autonomy'
import { writeMetricsSnapshot } from './metricsSnapshot'
import {
  makeSqlBreakerDeps, getBreakerState, recordTaskOutcome, checkDiffSafety, primaryFingerprint,
} from './circuitBreaker'
import { deliverPendingEscalations, makeSqlNotifyDeps } from './escalationNotify'
import { composeFounderBrief, makeSqlBriefDeps } from './founderBrief'
import { runJanetReport } from './janetReport'
import { getAllAgentHealth } from './agentHealth_v2'
import { buildPipelineView, type RawPipelineLead } from './pipelineView'
import { runSarahSocialCron, listSocialQueue, queueSocialItem } from './social/sarahSocial'
import { buildAnalyticsView, ingestAnalyticsEvent } from './siteAnalytics'
import { verifyRedditLogin } from './social/redditClient'

const HQ = process.env.HQ_SECRET
const CRON = process.env.CRON_SECRET || ''
const COMPANY = 'phishsimai'

function checkHQ(req: Request): boolean {
  const s = (req.query.secret || req.headers['x-hq-secret']) as string
  return !!HQ && s === HQ
}
function checkCron(req: Request): boolean {
  return req.headers.authorization === `Bearer ${CRON}`
}
function okHQ(req: Request, res: Response) {
  if (!checkHQ(req)) { res.status(401).json({ error:'Unauthorized' }); return false }
  return true
}
function okCron(req: Request, res: Response) {
  if (!checkCron(req)) { res.status(401).json({ error:'Unauthorized' }); return false }
  return true
}
function okCronOrHq(req: Request, res: Response) {
  if (!checkCron(req) && !checkHQ(req)) { res.status(401).json({ error:'Unauthorized' }); return false }
  return true
}

// ════════════════════════════════════════════════════════════════════════════
//  ORIGINAL v3 ROUTES — restored, unchanged behavior
// ════════════════════════════════════════════════════════════════════════════

export async function cronSequence(req: Request, res: Response) {
  if (!okCronOrHq(req,res)) return
  try { res.json({ ok: true, ...(await runFullSequence()) }) } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function cronAriaDaily(req: Request, res: Response) {
  return cronSequence(req, res)
}

export async function cronJanet(req: Request, res: Response) {
  if (!okCronOrHq(req,res)) return
  try {
    const result = await runJanetFullOrchestration(COMPANY)
    res.json({ ok: true, ...result })
  } catch(e:any) { res.status(500).json({error:e.message}) }
}

// The daily CGO cron. Runs BOTH the existing standup orchestration AND the
// (previously dormant) L5 CGO cycle (runL5JanetCycle). The L5 cycle is now LIVE
// but gated: at level 'manual' every task-issue / architect-queue it attempts is
// DENIED by the autonomy gate and logged as a no-op — zero autonomous writes.
// buildJanetCgoSummary (in l5Autonomy.ts) wraps both halves so no failure can
// crash the cron; it always returns 200 with a summary of what ran and what was
// gate-denied. The optional `deps` param is for tests only (Express passes none).
export async function cronJanetCgo(req: Request, res: Response, deps?: JanetCgoDeps) {
  if (!okCronOrHq(req, res)) return
  const summary = await buildJanetCgoSummary(COMPANY, deps).catch((e: any) => ({
    ok: false, ran: [] as string[], orchestration: null, l5: null, gateDeniedCount: 0,
    errors: [`fatal: ${String(e?.message).slice(0, 200)}`],
  }))
  res.json(summary)
}

// Daily metrics_daily snapshot (passive infra). Secret-gated like the other os
// crons. Writes one REAL-OR-NULL row for the given day (default: yesterday) and
// returns it. Only WRITES metrics_daily — reads nothing to make decisions.
export async function cronMetricsSnapshot(req: Request, res: Response) {
  if (!okCronOrHq(req, res)) return
  try {
    const date = (req.query.date as string) || undefined // optional backfill override
    const result = await writeMetricsSnapshot(COMPANY, date)
    res.json({ ok: result.written, ...result })
  } catch (e: any) {
    res.status(500).json({ error: formatOsError(e) })
  }
}

// Deliver un-notified escalations to Telegram (every 15m). Secret-gated. Always
// returns 200 with a delivery summary; idempotent (marks notified_at on success)
// and fail-safe (Telegram env unset → skipped, never crashes). Returns a summary
// even if the source query fails (e.g. notified_at not yet migrated).
export async function cronEscalationNotify(req: Request, res: Response) {
  if (!okCronOrHq(req, res)) return
  try {
    const result = await deliverPendingEscalations(makeSqlNotifyDeps())
    res.json({ ok: true, ...result })
  } catch (e: any) {
    res.json({ ok: false, total: 0, sent: 0, skipped: 0, failed: 0, error: formatOsError(e) })
  }
}

// Compose + send + store the founder daily brief (daily ~21:00 UTC). Secret-gated.
// Real tables only; any null metric renders 'no data', never a fabricated value.
export async function cronFounderBrief(req: Request, res: Response) {
  if (!okCronOrHq(req, res)) return
  try {
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10)
    const result = await composeFounderBrief(makeSqlBriefDeps(COMPANY), date)
    res.json({ ok: true, ...result })
  } catch (e: any) {
    res.json({ ok: false, error: formatOsError(e) })
  }
}

// Circuit-breaker endpoint (M.1). Secret-gated. For a FUTURE Marcus client:
//   GET  ?fp=<fingerprint>  → the breaker state (check before touching a task)
//   POST { product_id?, task_id, outcome:'success'|'failure', error? }
//                           → records an outcome and runs the state machine
//   POST { product_id?, task_id, diff }  → destructive-diff safety check
// Marcus is NOT wired to call this yet — this is the guardrail, not the re-enable.
export async function breakerEndpoint(req: Request, res: Response) {
  if (!okCronOrHq(req, res)) return
  try {
    const deps = makeSqlBreakerDeps()
    if ((req.method || 'GET').toLowerCase() === 'get') {
      const fp = String(req.query.fp || '')
      if (!fp) { res.status(400).json({ error: 'fp query param required' }); return }
      res.json(await getBreakerState(deps, fp))
      return
    }
    const body = req.body || {}
    const productId = body.product_id || COMPANY
    if (body.diff) {
      const fp = body.fingerprint || primaryFingerprint(productId, String(body.task_id || ''))
      res.json(await checkDiffSafety(deps, fp, productId, body.diff))
      return
    }
    if (!body.task_id) { res.status(400).json({ error: 'task_id required' }); return }
    const result = await recordTaskOutcome(deps, productId, String(body.task_id), body.outcome === 'success', body.error)
    res.json(result)
  } catch (e: any) {
    res.status(500).json({ error: formatOsError(e) })
  }
}

export async function cronWatchdog(req: Request, res: Response) {
  if (!okCronOrHq(req,res)) return
  try { res.json({ ok: true, ...(await runWatchdog()) }) } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function cronHeartbeat(req: Request, res: Response) {
  if (!okCronOrHq(req,res)) return
  try { res.json(await runHeartbeat()) } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function webhookReply(req: Request, res: Response) {
  try {
    const { type, data } = req.body
    let from='', subject='', text=''
    if (type==='email.received' && data) {
      const raw=data.from||''; from=raw.match(/<([^>]+)>/)?.[1]||raw
      subject=data.subject||''; text=data.text||data.html?.replace(/<[^>]+>/g,' ')||''
    } else {
      const raw=req.body.from||''; from=raw.match(/<([^>]+)>/)?.[1]||raw
      subject=req.body.subject||''; text=req.body.text||req.body.plain||req.body.body||''
    }
    if (!from||!text) { res.json({ok:true}); return }
    res.json({ok:true, ...(await processReply(from,subject,text))})
  } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function cronResearcher(req: Request, res: Response) {
  if (!okCronOrHq(req,res)) return
  try { res.json({ ok: true, ...(await runLeadResearcher(6)) }) } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function cronDiscover(req: Request, res: Response) {
  if (!okCronOrHq(req,res)) return
  try { res.json({ ok: true, ...(await runLeadDiscover(8)) }) } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function cronSarahSocial(req: Request, res: Response) {
  if (!okCronOrHq(req, res)) return
  try {
    res.json({ ok: true, ...(await runSarahSocialCron()) })
  } catch (e: any) {
    res.status(500).json({ error: formatOsError(e) })
  }
}

export async function analyticsCollect(req: Request, res: Response) {
  try {
    const body = req.body || {}
    const companyId = body.company_id === 'scrollfuel' ? 'scrollfuel' : 'phishsimai'
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || ''
    const result = await ingestAnalyticsEvent({
      company_id: companyId,
      path: String(body.path || '/'),
      referrer: body.referrer,
      utm_source: body.utm_source,
      utm_medium: body.utm_medium,
      utm_campaign: body.utm_campaign,
      session_id: body.session_id,
      event_type: body.event_type || 'pageview',
      event_name: body.event_name,
      ip,
      user_agent: req.headers['user-agent'] as string,
    })
    res.json({ ok: true, ...result })
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: formatOsError(e) })
  }
}

export async function hqSarahSocial(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  try {
    const action = (req.query.action as string) || 'list'
    if (action === 'verify') {
      return res.json({ ok: true, ...(await verifyRedditLogin()) })
    }
    if (action === 'run') {
      return res.json({ ok: true, ...(await runSarahSocialCron()) })
    }
    if (action === 'linkedin-preview') {
      const { getNextSarahLinkedInPreview, generateSarahLinkedInDraft, queueSarahLinkedInDraft } = await import('./social/sarahLinkedIn')
      const mode = (req.query.mode as string) || 'next'
      if (mode === 'draft') {
        const topic = (req.query.topic as string) || undefined
        return res.json({ ok: true, preview: await generateSarahLinkedInDraft(topic) })
      }
      if (mode === 'revise') {
        const token = (req.query.token as string) || ''
        if (!token) return res.status(400).json({ error: 'token required' })
        const { reviseSarahLinkedInDraft } = await import('./social/sarahLinkedIn')
        return res.json({ ok: true, preview: await reviseSarahLinkedInDraft(token) })
      }
      if (mode === 'produce-final') {
        const token = (req.query.token as string) || ''
        if (!token) return res.status(400).json({ error: 'token required' })
        const { produceSarahLinkedInForApproval } = await import('./social/sarahLinkedIn')
        return res.json({ ok: true, preview: await produceSarahLinkedInForApproval(token) })
      }
      if (mode === 'publish') {
        const token = (req.query.token as string) || ''
        if (!token) return res.status(400).json({ error: 'token required' })
        const { publishSarahLinkedInPost } = await import('./social/publishSarahLinkedIn')
        return res.json({ ok: true, result: await publishSarahLinkedInPost(token) })
      }
      if (mode === 'queue' && req.method === 'post') {
        const topic = req.body?.topic
        return res.json({ ok: true, preview: await queueSarahLinkedInDraft(topic) })
      }
      return res.json({ ok: true, preview: await getNextSarahLinkedInPreview() })
    }
    if (action === 'queue' && req.method === 'post') {
      const { action: socialAction, subreddit, body, title, target_url, thing_id } = req.body || {}
      if (!body?.trim()) return res.status(400).json({ error: 'body required' })
      const row = await queueSocialItem({
        action: socialAction || 'comment',
        subreddit,
        body,
        title,
        target_url,
        thing_id,
      })
      return res.json({ ok: true, queued: row })
    }
    const queue = await listSocialQueue(25)
    res.json({ ok: true, queue, configured: !!(process.env.SARAH_REDDIT_USERNAME && process.env.SARAH_REDDIT_PASSWORD) })
  } catch (e: unknown) {
    res.status(500).json({ error: formatOsError(e) })
  }
}

/** GET /api/os/social/hero/:token.png — public hero image for PostForMe / LinkedIn */
export async function socialHeroImage(req: Request, res: Response) {
  try {
    const raw = (req.params as { token?: string }).token || ''
    const token = raw.replace(/\.png$/i, '')
    const { getPreviewByToken } = await import('./social/socialPreviewPage')
    const item = await getPreviewByToken(token)
    if (!item?.image_url) {
      res.status(404).send('Not found')
      return
    }
    const url = item.image_url
    if (url.startsWith('data:image/')) {
      const b64 = url.split(',', 2)[1]
      if (!b64) {
        res.status(404).send('Invalid image')
        return
      }
      const buf = Buffer.from(b64, 'base64')
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Content-Length', String(buf.length))
      res.setHeader('Cache-Control', 'public, max-age=86400')
      if (req.method.toLowerCase() === 'head') {
        res.status(200).end()
        return
      }
      res.send(buf)
      return
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      res.redirect(302, url)
      return
    }
    res.status(404).send('Not found')
  } catch (e: unknown) {
    res.status(500).send(formatOsError(e))
  }
}

/** GET /preview/social/:token — shareable Safari HTML preview */
export async function socialPreviewPage(req: Request, res: Response) {
  try {
    const token = (req.params as { token?: string }).token || req.path.split('/').filter(Boolean).pop() || ''
    const { getPreviewByToken, renderSocialPreviewPage } = await import('./social/socialPreviewPage')
    const item = await getPreviewByToken(token)
    if (!item) {
      res.status(404).setHeader('Content-Type', 'text/html').send('<h1>Preview not found</h1>')
      return
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    const autopostBlocked = !(process.env.POSTFORME_API_KEY || process.env.POST_FOR_ME_API_KEY)
    res.send(renderSocialPreviewPage(item, token, undefined, autopostBlocked))
  } catch (e: unknown) {
    res.status(500).setHeader('Content-Type', 'text/html').send(`<pre>${formatOsError(e)}</pre>`)
  }
}

/** POST /preview/social/:token/review — founder approve / reject / request changes */
export async function socialPreviewReview(req: Request, res: Response) {
  try {
    const token = (req.params as { token?: string }).token || ''
    const decision = String(req.body?.decision || '') as 'approved' | 'changes_requested' | 'rejected'
    const comment = String(req.body?.comment || '').trim()
    if (!['approved', 'changes_requested', 'rejected'].includes(decision)) {
      res.status(400).send('Invalid decision')
      return
    }
    const { submitSocialReview, getPreviewByToken, renderSocialPreviewPage } = await import('./social/socialPreviewPage')
    const result = await submitSocialReview(token, decision, comment)
    const item = await getPreviewByToken(token)
    if (item) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.send(renderSocialPreviewPage(item, token, result.message, !(process.env.POSTFORME_API_KEY || process.env.POST_FOR_ME_API_KEY)))
      return
    }
    res.redirect(302, `/preview/social/${token}`)
  } catch (e: unknown) {
    res.status(500).setHeader('Content-Type', 'text/html').send(`<pre>${formatOsError(e)}</pre>`)
  }
}

export async function hqData(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  try {
    await ensureHqTables()
    const sql = getSql()
    const [pipeline] = await sql`SELECT
      count(*) filter(where touch1_sent_at is not null) as touched,
      count(*) filter(where replied=true) as replied,
      count(*) filter(where pipeline_stage='engaged') as engaged,
      count(*) filter(where pipeline_stage='customer') as customers,
      count(*) filter(where pipeline_stage='prospect') as prospects,
      count(*) filter(where bounced=true and touch1_sent_at is not null) as bounced,
      count(*) filter(where touch1_sent_at is not null) as apollo_sent
      FROM ps_outreach_leads WHERE bounced=false OR source='apollo'`

    const recentLeads = await sql`SELECT name, company, email, pipeline_stage, touch1_sent_at, touch2_sent_at, replied, bounced, created_at
      FROM ps_outreach_leads ORDER BY created_at DESC LIMIT 20`

    const pipelineRows = await sql`SELECT id, name, company, email,
      COALESCE(source, 'manual') as source,
      COALESCE(pipeline_stage, 'prospect') as pipeline_stage,
      created_at, stage_updated_at,
      touch1_sent_at, touch2_sent_at, touch3_sent_at, touch4_sent_at,
      COALESCE(replied, false) as replied,
      COALESCE(bounced, false) as bounced,
      COALESCE(unsubscribed, false) as unsubscribed
      FROM ps_outreach_leads`.catch(() => [] as RawPipelineLead[])
    const pipelineView = buildPipelineView(pipelineRows as RawPipelineLead[])

    const customers = await sql`SELECT name, company, email, stage_updated_at
      FROM ps_outreach_leads WHERE pipeline_stage='customer' ORDER BY stage_updated_at DESC`

    const abResults = await sql`SELECT variant,
      count(*) filter(where event='sent') as sent,
      count(*) filter(where event='replied') as replied
      FROM ab_impressions WHERE experiment_key='touch1_subject' GROUP BY variant`.catch(() => [] as any[])

    // Cancel malformed architect tasks (e.g. "**" from bad Janet markdown output)
    await sql`UPDATE os_architect_tasks SET status='cancelled', notes='Auto-cancelled: malformed task title', updated_at=NOW()
      WHERE status IN ('pending','approved','queued','running')
        AND (trim(task) IN ('**','*','***') OR length(trim(regexp_replace(task, '^[*\\s]+', ''))) < 8)`.catch(() => {})

    const archTasks = await sql`SELECT id, task, status, source, created_at, notes, bug_id, files_changed, updated_at
      FROM os_architect_tasks ORDER BY created_at DESC LIMIT 15`.catch(() => [] as any[])

    const memory = await recallMemory(COMPANY, undefined, 40)
    const bugReports = await sql`SELECT id, error_message, component_name, severity, status, occurrence_count, last_seen, url_path, diagnosis
      FROM bug_reports WHERE status IN ('open','diagnosed') OR status IS NULL ORDER BY last_seen DESC LIMIT 20`.catch(() => [] as any[])
    const architectMemory = await sql`SELECT error_signature, root_cause, file_affected, times_applied, confidence
      FROM architect_memory ORDER BY times_applied DESC LIMIT 20`.catch(() => [] as any[])
    const qaRuns = await sql`SELECT trigger_type, tests_passed, tests_failed, status, created_at
      FROM qa_runs ORDER BY created_at DESC LIMIT 10`.catch(() => [] as any[])

    const socialQueue = await listSocialQueue(15).catch(() => [] as any[])
    const analyticsView = await buildAnalyticsView(COMPANY).catch(() => null)

    const bounceRate = Number(pipeline.apollo_sent) > 0
      ? (Number(pipeline.bounced) / Number(pipeline.apollo_sent) * 100).toFixed(1)
      : '0.0'

    res.json({
      ok: true,
      ts: new Date().toISOString(),
      pipeline: {
        touched: Number(pipeline.touched),
        replied: Number(pipeline.replied),
        engaged: Number(pipeline.engaged),
        customers: Number(pipeline.customers),
        prospects: Number(pipeline.prospects),
        bounceRate,
        replyRate: Number(pipeline.touched) > 0 ? (Number(pipeline.replied) / Number(pipeline.touched) * 100).toFixed(1) : '0.0',
      },
      recentLeads,
      pipelineView,
      customers,
      abResults,
      archTasks,
      memory,
      bugReports,
      architectMemory,
      qaRuns,
      socialQueue,
      sarahSocialConfigured: !!(process.env.SARAH_REDDIT_USERNAME && process.env.SARAH_REDDIT_PASSWORD),
      analyticsView,
    })
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: formatOsError(e) })
  }
}

export async function hqChat(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  try {
    const { message, history = [], attachments = [] } = req.body
    if (!message?.trim() && !attachments?.length) { res.status(400).json({ error: 'No message' }); return }
    const fullMessage = formatAttachmentsForPrompt(attachments)
      ? `${message?.trim() || 'Review attachments.'}\n\n${formatAttachmentsForPrompt(attachments)}`
      : message.trim()
    res.json({ ok: true, response: await janetChat(fullMessage, history) })
  } catch (e: unknown) {
    res.status(500).json({ error: formatOsError(e) })
  }
}

export async function hqIngest(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  try {
    const files: Array<{ filename: string; mimeType: string; base64: string }> = req.body?.files || []
    if (!files.length) return res.status(400).json({ ok: false, error: 'No files' })
    const results = []
    for (const f of files) {
      try {
        const ingested = await ingestFounderFile(Buffer.from(f.base64, 'base64'), f.filename, f.mimeType || 'application/octet-stream')
        const memoryKey = await storeFounderUpload(COMPANY, ingested)
        results.push({ ok: true, filename: f.filename, kind: ingested.kind, summary: ingested.summary, memoryKey, leadsImported: ingested.leadsImported, leadsSkipped: ingested.leadsSkipped })
      } catch (e: any) {
        results.push({ ok: false, filename: f.filename, error: e.message })
      }
    }
    res.json({ ok: true, files: results })
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: formatOsError(e) })
  }
}

export async function hqTTS(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  const { text } = req.body
  if (!text) { res.status(400).json({ error: 'No text' }); return }
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) { res.status(503).json({ error: 'ElevenLabs not configured' }); return }
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM/stream', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: text.slice(0, 500), model_id: 'eleven_turbo_v2_5', voice_settings: { stability: 0.55, similarity_boost: 0.75 } }),
    })
    if (!r.ok) { res.status(502).json({ error: 'ElevenLabs error' }); return }
    const buf = Buffer.from(await r.arrayBuffer())
    res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': String(buf.length), 'Cache-Control': 'no-store' }).send(buf)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}

export async function hqTask(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  try {
    const { id, status, notes } = req.body
    const sql = getSql()
    await sql`UPDATE os_architect_tasks SET status=${status}, notes=${notes || null}, updated_at=NOW() WHERE id=${id}`
    await sendTelegram(`PHISHSIMAI TASK ${status.toUpperCase()}: ${notes || id}`)
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}

export async function hqMemoryGet(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  try {
    res.json({ ok: true, context: await recallContext(COMPANY) })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}

export async function hqSeed(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  try {
    const n = await seedPhishSimMemory()
    res.json({ ok: true, seeded: n })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}

export async function hqJanetSignedUrl(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  const { getJanetConvaiSignedUrl, JANET_AGENT_PHISHSIM } = await import('./janetConvai')
  const { getJanetOpsSnapshot } = await import('./janetOpsSnapshot')
  if (!JANET_AGENT_PHISHSIM) {
    res.status(503).json({ error: 'ELEVENLABS_AGENT_JANET_PHISHSIM not configured' })
    return
  }
  const signed_url = await getJanetConvaiSignedUrl(JANET_AGENT_PHISHSIM)
  if (!signed_url) {
    res.status(500).json({ error: 'Could not get voice session — check ELEVENLABS_API_KEY' })
    return
  }
  const ops = await getJanetOpsSnapshot('phishsimai').catch(() => null)
  const opsText = ops?.text?.slice(0, 3800) || ''
  res.json({
    signed_url,
    agent_id: JANET_AGENT_PHISHSIM,
    product: 'phishsimai',
    ops_context: opsText,
  })
}

export async function hqJanetTool(req: Request, res: Response) {
  const secret = (req.query.secret as string) || (req.headers['x-janet-tool-secret'] as string)
  if (!secret || (secret !== process.env.HQ_SECRET && secret !== process.env.CRON_SECRET)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const body = req.body || {}
    // ElevenLabs webhook may send parameters only, or nested tool call
    const toolName =
      body.tool_name ||
      body.name ||
      (req.query.tool as string) ||
      (body.employee || body.question ? 'ask_employee' : null) ||
      (body.topic ? 'get_sarah_linkedin_preview' : null) ||
      'get_live_ops'
    const params =
      body.parameters ||
      body.params ||
      body.arguments ||
      (toolName === 'ask_employee' ? { employee: body.employee, question: body.question || body.message } : body)
    const { handleJanetToolCall } = await import('./janetTool')
    const result = await handleJanetToolCall(String(toolName), params, 'phishsimai')
    res.json(result)
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: formatOsError(e) })
  }
}

export async function hqJanetOpsContext(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  try {
    const { getJanetOpsSnapshot } = await import('./janetOpsSnapshot')
    const ops = await getJanetOpsSnapshot('phishsimai')
    res.json({ ok: true, ...ops })
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: formatOsError(e) })
  }
}

export async function hqSTT(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  try {
    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      req.on('data', (c) => chunks.push(Buffer.from(c)))
      req.on('end', () => resolve())
      req.on('error', reject)
    })
    const body = Buffer.concat(chunks)
    const contentType = req.headers['content-type'] || ''
    let audioBuf: Buffer | null = null

    if (contentType.includes('multipart/form-data')) {
      const boundary = contentType.split('boundary=')[1]
      if (boundary) {
        const parts = body.toString('binary').split('--' + boundary)
        for (const part of parts) {
          if (part.includes('filename=') && part.includes('\r\n\r\n')) {
            const idx = part.indexOf('\r\n\r\n')
            const raw = part.slice(idx + 4)
            audioBuf = Buffer.from(raw.replace(/\r\n--$/, '').replace(/\r\n$/, ''), 'binary')
            break
          }
        }
      }
    } else if (req.body?.audio) {
      audioBuf = Buffer.from(req.body.audio, 'base64')
    }

    if (!audioBuf?.length) {
      res.status(400).json({ error: 'No audio' })
      return
    }

    const groqForm = new FormData()
    groqForm.append('file', new Blob([audioBuf], { type: 'audio/webm' }), 'audio.webm')
    groqForm.append('model', 'whisper-large-v3-turbo')
    groqForm.append('language', 'en')

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY },
      body: groqForm,
    })
    const d = await groqRes.json()
    res.json({ ok: true, text: d.text || '' })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}

export { cronAgentWatchdog }

export async function bugReport(req: Request, res: Response) {
  try {
    const { error_message, stack_trace, component_name, user_action, url_path, user_email, browser, severity } = req.body
    if (!error_message) { res.status(400).json({ error: 'error_message required' }); return }
    await ensureHqTables()
    const sql = getSql()
    const dup = await sql`SELECT id FROM bug_reports WHERE error_message=${error_message} AND component_name=${component_name||'Unknown'} AND last_seen > NOW() - interval '1 hour' LIMIT 1`
    if ((dup as any[]).length > 0) {
      await sql`UPDATE bug_reports SET occurrence_count=occurrence_count+1, last_seen=NOW() WHERE id=${(dup as any[])[0].id}`
      res.json({ ok: true, duplicate: true, bug_id: (dup as any[])[0].id }); return
    }
    const scoredSeverity = severity || 'medium'
    const bugs = await sql`INSERT INTO bug_reports (error_message,stack_trace,component_name,user_action,url_path,user_email,browser,severity,status)
      VALUES (${error_message}, ${stack_trace||null}, ${component_name||'Unknown'}, ${user_action||'unknown'}, ${url_path||'unknown'}, ${user_email||null}, ${browser||null}, ${scoredSeverity}, 'open')
      RETURNING id`
    const bugId = (bugs as any[])[0]?.id?.toString() || ''

    await sendTelegram(
      `🚨 <b>JANET — BUG DETECTED</b>\nPage: ${url_path || 'unknown'}\nError: ${String(error_message).slice(0, 200)}`
    ).catch(() => {})

    const { runArchitectAgent } = await import('./architectAgent')
    const diagnosis = await runArchitectAgent(bugId).catch(e => ({ diagnosed: false, error: e.message }))
    res.json({ ok: true, bug_id: bugId, severity: scoredSeverity, diagnosis })
  } catch(e: any) { res.status(500).json({ error: e.message }) }
}

export async function qaSmokePS(req: Request, res: Response) {
  if (!okHQ(req,res) && !okCron(req,res)) return
  try {
    const { runQASmoke } = await import('./architectAgent')
    const trigger = (req.query.trigger as string) || 'manual'
    const baseUrl = (req.query.base_url as string) || undefined
    res.json({ ok: true, ...(await runQASmoke(trigger, baseUrl)) })
  } catch(e: any) { res.status(500).json({ error: e.message }) }
}

// ════════════════════════════════════════════════════════════════════════════
//  KAAN AI OS v4 — Janet + 8 named specialist agents (added, not replacing)
//  Exposed under /api/os/v4/* so it never collides with the v3 routes above
// ════════════════════════════════════════════════════════════════════════════

function okV4(req: Request, res: Response): boolean {
  const secret = (req.headers['x-os-secret'] as string) || (req.query.secret as string)
  if (secret !== HQ && !checkCron(req)) { res.status(401).json({ error: 'Unauthorized' }); return false }
  return true
}

export async function v4Status(req: Request, res: Response) {
  if (!okV4(req, res)) return
  try {
    const agents = await getAllAgentHealth(COMPANY)
    const healthy = agents.filter(a => a.status === 'healthy').length
    res.json({
      overall: healthy === agents.length ? 'healthy' : 'degraded',
      healthy,
      total: agents.length,
      agents: agents.map(a => ({
        agent_id: a.agent_id,
        name: a.agent_name,
        title: a.agent_title,
        status: a.status,
        uptime: `${a.uptime_pct}%`,
        heals: a.self_heal_count,
        avg_ms: Math.round(a.avg_response_ms),
      })),
      timestamp: new Date().toISOString(),
    })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
}

export async function v4Wiring(req: Request, res: Response) {
  if (!okV4(req, res)) return
  try {
    const { getOsWiringReport } = await import('./osWiring')
    res.json(await getOsWiringReport('PhishSimAI'))
  } catch (e: any) { res.status(500).json({ error: e.message }) }
}

export async function v4Roster(req: Request, res: Response) {
  if (!okV4(req, res)) return
  res.json({ agents: Object.values(AGENTS) })
}

export async function v4Standup(req: Request, res: Response) {
  if (!okV4(req, res)) return
  try { res.json(await runDailyStandup(COMPANY)) } catch (e: any) { res.status(500).json({ error: e.message }) }
}

export async function v4WeeklyReview(req: Request, res: Response) {
  if (!okV4(req, res)) return
  try { res.json(await runWeeklyReview(COMPANY)) } catch (e: any) { res.status(500).json({ error: e.message }) }
}

export async function v4Full(req: Request, res: Response) {
  if (!okV4(req, res)) return
  try { res.json(await runJanetFullOrchestration(COMPANY)) } catch (e: any) { res.status(500).json({ error: e.message }) }
}

export async function v4AgentTalk(req: Request, res: Response): Promise<void> {
  if (!okV4(req, res)) return
  // req.params.name only works with real Express routers. The production
  // entry point (api/handler.ts) dispatches by raw path matching, so also
  // support extracting the agent id from the URL path directly.
  const pathParts = (req.path || '').split('/').filter(Boolean)
  const name = (req.params?.name || pathParts[pathParts.length - 1] || '') as AgentId
  if (!AGENTS[name]) { res.status(400).json({ error: `Unknown agent: ${name}`, available: Object.keys(AGENTS) }); return }

  const body: any = req.body || {}
  const queryMessage: any = req.query.message
  const message: string = (req.method === 'GET' ? queryMessage : body.message) as string
  const mode: string | undefined = body.mode
  const title: string | undefined = body.title
  const priority: string | undefined = body.priority
  const fromJanet: boolean = !!body.from_janet

  try {
    if (mode === 'task') {
      const task = await issueTask(name, { agent_id: name, title: title || message?.slice(0,80) || '', description: message || '', priority: (priority as any) || 'high', due_in_hours: 24 }, COMPANY)
      const result = await executeTask(task.task_id, COMPANY)
      const review = await reviewTask(task.task_id, COMPANY)
      res.json({ task, result: result.result, review: review.feedback, score: review.score })
      return
    }
    if (mode === 'janet_tells') {
      const r = await janetTellAgent(name, message, COMPANY)
      res.json(r)
      return
    }
    if (!message) { res.json({ agent: AGENTS[name] }); return }
    const r = await talkToAgent(name, message, COMPANY, fromJanet)
    res.json(r)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}

// ── Additional parity routes (ScrollFuel equivalents) ─────────────────────

export async function hqDirective(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  try {
    const { message } = req.body
    if (!message) { res.status(400).json({ error: 'No message' }); return }
    await rememberFact({
      company_id: COMPANY, type: 'operating',
      key: 'directive_' + Date.now(), value: message, confidence: 1, source: 'founder',
    })
    let janetResponse = ''
    try {
      const reply = await llmComplete({
        messages: [{ role: 'user', content: `You are Janet, CGO of PhishSimAI. Founder Kaan gave this directive: "${message}". Acknowledge it, state what action you will take, honest assessment in 2-3 sentences. Direct and specific.` }],
        max_tokens: 200,
      })
      janetResponse = reply.text || 'Directive received and logged.'
    } catch {
      janetResponse = 'Directive received and stored in memory. Will act on it in the next cycle.'
    }
    await sendTelegram('FOUNDER DIRECTIVE TO JANET (PhishSim):\n"' + message + '"\n\nJanet: ' + janetResponse)
    res.json({ ok: true, janetResponse })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}

export async function janetReport(req: Request, res: Response) {
  const secret = (req.query.secret as string) || (req.headers['x-report-secret'] as string)
  if (secret !== HQ && secret !== (process.env.REPORT_SECRET || 'ps-migrate-2026')) {
    res.status(401).json({ error: 'Unauthorized' }); return
  }
  try {
    res.json(await runJanetReport(COMPANY))
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
}

export async function webhookResend(req: Request, res: Response) {
  try {
    const { type, data } = req.body
    const sql = getSql()
    const email = data?.to?.[0] || data?.email || ''
    const ts = new Date().toISOString()
    if (type === 'email.bounced' || type === 'email.complained') {
      await sql`UPDATE ps_outreach_leads SET bounced=true, bounced_at=${ts}, pipeline_stage='dead', stage_updated_at=${ts} WHERE LOWER(email)=LOWER(${email})`
      await sendTelegram('PHISHSIMAI BOUNCE: ' + type + ' | ' + email)
    } else if (type === 'email.delivery_delayed') {
      await sendTelegram('PHISHSIMAI DELIVERY DELAY: ' + email)
    } else if (type === 'email.opened') {
      await sql`UPDATE ps_outreach_leads SET stage_updated_at=${ts} WHERE LOWER(email)=LOWER(${email}) AND pipeline_stage='prospect'`
    } else if (type === 'email.clicked') {
      await sql`UPDATE ps_outreach_leads SET pipeline_stage='engaged', stage_updated_at=${ts} WHERE LOWER(email)=LOWER(${email}) AND pipeline_stage IN ('prospect','lead')`
    }
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}

export async function portfolioDispatch(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  try {
    const body = req.body || {}
    const task = String(body.task || '').trim()
    if (!task || task.length < 8) {
      return res.status(400).json({ error: 'task required (min 8 chars)' })
    }

    const source = String(body.source || 'portfolio_dispatch')
    const priority = String(body.priority || 'normal')
    const notes = `[${source}] ${String(body.notes || 'Super Janet Portfolio Dispatch')} · priority=${priority}`

    const taskId = await queueJanetArchitectTask({
      task,
      notes: notes.slice(0, 500),
    })

    if (!taskId) {
      return res.status(500).json({ ok: false, error: 'queue failed' })
    }

    await dispatchMarcusWake(COMPANY, { taskId, product: 'phishsim' })

    return res.json({
      ok: true,
      taskId,
      id: taskId,
      product: 'phishsimai',
      subsidiaryId: 'phishsim',
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
}

export async function architectPending(req: Request, res: Response) {
  const { architectPending: pick } = await import('./architectPending')
  return pick(req, res)
}

export async function architectWake(req: Request, res: Response) {
  const { architectWake: wake } = await import('./architectWake')
  return wake(req, res)
}

export async function architectComplete(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  try {
    const { id, success, qwen_output, files_changed, commit_sha, error, prod_url, qa_prod } = req.body
    const sql = getSql()

    const existing = await sql`SELECT status, bug_id FROM os_architect_tasks WHERE id=${id}::uuid LIMIT 1`
    const row = (existing as any[])[0]
    if (!row) return res.status(404).json({ ok: false, error: 'Task not found' })
    if (['done', 'failed', 'cancelled'].includes(row.status)) {
      return res.json({ ok: true, status: row.status, duplicate: true })
    }

    const status = success ? 'done' : 'failed'
    const filesArr = Array.isArray(files_changed) ? files_changed : []
    const notes = success
      ? [`Autonomous deploy — phishsimai.com/hq`, filesArr.length ? `Files: ${filesArr.join(', ')}` : null, commit_sha ? `Commit: ${commit_sha}` : null, prod_url || null, qa_prod || null].filter(Boolean).join(' · ')
      : `Failed: ${error || 'unknown'}`

    await sql`UPDATE os_architect_tasks SET status=${status}, notes=${notes}, qwen_output=${qwen_output || null},
      files_changed=${filesArr}::text[], updated_at=NOW() WHERE id=${id}::uuid`

    await recordMarcusDeployOutcome({ bugId: row.bug_id, success: !!success, filesChanged: filesArr, notes }).catch(() => {})
    // MARCUS CIRCUIT BREAKER — record the deploy outcome. 3 consecutive failures
    // → breaker OPEN → Marcus halts issuing/executing until cooldown + a clean probe.
    await recordMarcusOutcome(makeMarcusBreakerDeps(), !!success, success ? undefined : (error || 'deploy failed')).catch(() => {})
    const bugResult = await resolveLinkedBug(id, !!success, notes, commit_sha, { notify: false }).catch(() => ({ resolved: false }))

    const taskRow = await sql`SELECT task FROM os_architect_tasks WHERE id=${id}::uuid`
    const task = (taskRow as any[])[0]?.task || id
    const skipTelegram = !!success && !!bugResult?.alreadyResolved
    if (!skipTelegram) {
      await sendTelegram(`${success ? '✅' : '🚨'} MARCUS — ${status.toUpperCase()}\n${String(task).slice(0, 200)}\n${notes}`).catch(() => {})
    }
    res.json({ ok: true, status, bug_resolved: bugResult?.resolved ?? false })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
}

export async function architectRun(req: Request, res: Response) {
  if (!okHQ(req, res) && !okCron(req, res)) return
  try {
    const bugId = (req.query.bugId as string) || req.body?.bugId
    const mode = (req.query.mode as string) || req.body?.mode || 'diagnose'
    const { runArchitectAgent, runQASmoke } = await import('./architectAgent')
    if (mode === 'qa') {
      res.json({ ok: true, ...(await runQASmoke('manual')) }); return
    }
    if (!bugId) { res.status(400).json({ error: 'bugId required' }); return }
    res.json({ ok: true, ...(await runArchitectAgent(bugId)) })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}

export async function osUnified(req: Request, res: Response) {
  if (!okHQ(req, res) && !checkCron(req)) { res.status(401).json({ error: 'Unauthorized' }); return }
  const action = (req.query.action as string) || 'status'
  try {
    if (action === 'status') return res.json(await getOSStatus(COMPANY))
    if (action === 'standup') return res.json(await runDailyStandup(COMPANY))
    if (action === 'weekly_review') return res.json(await runWeeklyReview(COMPANY))
    if (action === 'full') return res.json(await runJanetFullOrchestration(COMPANY))
    if (action === 'roster') return res.json({ agents: Object.values(AGENTS) })
    if (action === 'health' || action === 'health_status') return res.json({ agents: await getAllAgentHealth(COMPANY), timestamp: new Date().toISOString() })
    res.status(400).json({ error: 'Unknown action', available: ['status','standup','weekly_review','full','roster','health','health_status'] })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}

export async function telegramWebhook(req: Request, res: Response) {
  try {
    await handleIncomingTelegram(req.body)
    res.json({ ok: true })
  } catch {
    res.json({ ok: true })
  }
}

export async function telegramTest(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  const result = await sendTelegramTest()
  res.json({ config: getTelegramConfig(), ...result })
}

export async function telegramStatus(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  res.json({ ok: true, telegram: getTelegramConfig() })
}

export async function telegramSetupWebhook(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  const base = (req.body?.base_url || req.query.base_url || 'https://phishsimai.com') as string
  const webhookUrl = `${String(base).replace(/\/$/, '')}/api/os/webhook/telegram`
  const result = await registerTelegramWebhook(webhookUrl)
  res.json({ webhook: webhookUrl, ...result })
}

export { architectCode } from './architectCode'
