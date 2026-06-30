import { Request, Response } from 'express'
import { janetChat } from './janet'
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
import {
  runJanetFullOrchestration, getOSStatus, runDailyStandup, runWeeklyReview,
  talkToAgent, janetTellAgent, issueTask, executeTask, reviewTask,
  AGENTS, AgentId
} from './agents/kaan_os_v4'
import { cronAgentWatchdog } from './agentWatchdog'
import { runJanetReport } from './janetReport'
import { getAllAgentHealth } from './agentHealth_v2'

const HQ = process.env.HQ_SECRET || 'ps-hq-2026'
const CRON = process.env.CRON_SECRET || ''
const COMPANY = 'phishsimai'

function checkHQ(req: Request): boolean {
  const s = (req.query.secret || req.headers['x-hq-secret']) as string
  return s === HQ
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

export async function cronJanetCgo(req: Request, res: Response) {
  return cronJanet(req, res)
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

    const customers = await sql`SELECT name, company, email, stage_updated_at
      FROM ps_outreach_leads WHERE pipeline_stage='customer' ORDER BY stage_updated_at DESC`

    const abResults = await sql`SELECT variant,
      count(*) filter(where event='sent') as sent,
      count(*) filter(where event='replied') as replied
      FROM ab_impressions WHERE experiment_key='touch1_subject' GROUP BY variant`.catch(() => [] as any[])

    const archTasks = await sql`SELECT id, task, status, source, created_at, notes
      FROM os_architect_tasks ORDER BY created_at DESC LIMIT 10`.catch(() => [] as any[])

    const memory = await recallMemory(COMPANY, undefined, 40)
    const bugReports = await sql`SELECT id, error_message, component_name, severity, occurrence_count, last_seen, url_path, diagnosis
      FROM bug_reports WHERE status IN ('open','diagnosed') ORDER BY last_seen DESC LIMIT 20`.catch(() => [] as any[])
    const architectMemory = await sql`SELECT error_signature, root_cause, file_affected, times_applied, confidence
      FROM architect_memory ORDER BY times_applied DESC LIMIT 20`.catch(() => [] as any[])
    const qaRuns = await sql`SELECT trigger_type, tests_passed, tests_failed, status, created_at
      FROM qa_runs ORDER BY created_at DESC LIMIT 10`.catch(() => [] as any[])

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
      customers,
      abResults,
      archTasks,
      memory,
      bugReports,
      architectMemory,
      qaRuns,
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
      res.json({ ok: true, duplicate: true }); return
    }
    const bugs = await sql`INSERT INTO bug_reports (error_message,stack_trace,component_name,user_action,url_path,user_email,browser,severity)
      VALUES (${error_message}, ${stack_trace||null}, ${component_name||'Unknown'}, ${user_action||'unknown'}, ${url_path||'unknown'}, ${user_email||null}, ${browser||null}, ${severity||'medium'})
      RETURNING id`
    if (severity === 'critical' || severity === 'high' || severity === 'medium') {
      import('./architectAgent').then(({ runArchitectAgent }) => {
        runArchitectAgent((bugs as any[])[0]?.id?.toString() || '').catch(console.error)
      })
    }
    await sendTelegram(
      `🚨 <b>JANET — BUG DETECTED</b>\nPage: ${url_path || 'unknown'}\nError: ${String(error_message).slice(0, 200)}`
    ).catch(() => {})
    res.json({ ok: true, bug_id: (bugs as any[])[0]?.id })
  } catch(e: any) { res.status(500).json({ error: e.message }) }
}

export async function qaSmokePS(req: Request, res: Response) {
  if (!okHQ(req,res) && !okCron(req,res)) return
  try {
    const { runQASmoke } = await import('./architectAgent')
    res.json(await runQASmoke('manual'))
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
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.GROQ_API_KEY },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: `You are Janet, CGO of PhishSimAI. Founder Kaan gave this directive: "${message}". Acknowledge it, state what action you will take, honest assessment in 2-3 sentences. Direct and specific.` }],
          max_tokens: 200,
        }),
      })
      const d = await groqRes.json()
      janetResponse = d.choices?.[0]?.message?.content || 'Directive received and logged.'
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

export async function architectPending(req: Request, res: Response) {
  if (!okHQ(req, res)) return
  try {
    const sql = getSql()
    await sql`ALTER TABLE os_architect_tasks ADD COLUMN IF NOT EXISTS qwen_output TEXT`.catch(() => {})
    await sql`ALTER TABLE os_architect_tasks ADD COLUMN IF NOT EXISTS files_changed TEXT[]`.catch(() => {})
    await sql`
      UPDATE os_architect_tasks SET status='approved', notes='Auto-approved — autonomous execution', updated_at=NOW()
      WHERE status='pending'
    `.catch(() => {})
    const tasks = await sql`
      SELECT id, task, status, source, created_at FROM os_architect_tasks
      WHERE status='approved' ORDER BY created_at ASC LIMIT 5
    `.catch(() => [] as any[])
    res.json({ tasks, count: (tasks as any[]).length, timestamp: new Date().toISOString() })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
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
