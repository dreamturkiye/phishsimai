export { hqData, hqChat, hqTask, hqMemoryGet, hqTTS, hqSeed } from './hq';
import { Request, Response } from 'express'
import { runJanetBrief, janetChat } from './janet'
import { runLeadResearcher } from './agents/leadResearcher'
import { getAgentHealth } from './agentHealth'
import { runSequence } from './sequences'
import { runWatchdog } from './watchdog'
import { runHeartbeat } from './heartbeat'
import { processReply } from './replyParser'
import { recallContext, recallMemory, rememberFact, seedPhishSimMemory } from './memory'
import { connect } from '@tidbcloud/serverless'
import { handleIncomingTelegram } from './telegramCommands'
import { getTelegramConfig, sendTelegramTest, registerTelegramWebhook } from './telegram'
import {
  runJanetFullOrchestration, getOSStatus, runDailyStandup, runWeeklyReview,
  talkToAgent, janetTellAgent, issueTask, executeTask, reviewTask,
  AGENTS, AgentId
} from './agents/kaan_os_v4'

const HQ = process.env.HQ_SECRET || 'ps-hq-2026'
const CRON = process.env.CRON_SECRET || ''
const COMPANY = 'phishsimai'

function okHQ(req: Request, res: Response) {
  const s = (req.query.secret || req.headers['x-hq-secret']) as string
  if (s !== HQ) { res.status(401).json({ error:'Unauthorized' }); return false }
  return true
}
function okCron(req: Request, res: Response) {
  if (req.headers.authorization !== `Bearer ${CRON}`) { res.status(401).json({ error:'Unauthorized' }); return false }
  return true
}

// ════════════════════════════════════════════════════════════════════════════
//  ORIGINAL v3 ROUTES — restored, unchanged behavior
// ════════════════════════════════════════════════════════════════════════════

export async function cronSequence(req: Request, res: Response) {
  if (!okCron(req,res)) return
  try { res.json(await runSequence()) } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function cronJanet(req: Request, res: Response) {
  if (!okCron(req,res)) return
  try { res.json(await runJanetBrief()) } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function cronWatchdog(req: Request, res: Response) {
  if (!okCron(req,res)) return
  try { res.json(await runWatchdog()) } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function cronHeartbeat(req: Request, res: Response) {
  if (!okCron(req,res)) return
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
  if (!okCron(req,res)) return
  try { res.json(await runLeadResearcher(6)) } catch(e:any) { res.status(500).json({error:e.message}) }
}

export async function bugReport(req: Request, res: Response) {
  try {
    const { error_message, stack_trace, component_name, user_action, url_path, user_email, browser, severity } = req.body
    if (!error_message) { res.status(400).json({ error: 'error_message required' }); return }
    const conn = connect({ url: process.env.DATABASE_URL! })
    await conn.execute(`CREATE TABLE IF NOT EXISTS bug_reports (
      id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()), error_message TEXT NOT NULL,
      stack_trace TEXT, component_name VARCHAR(255), user_action TEXT, url_path VARCHAR(500),
      user_email VARCHAR(255), browser TEXT, severity VARCHAR(50) DEFAULT 'medium',
      status VARCHAR(50) DEFAULT 'open', occurrence_count INT DEFAULT 1,
      first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      diagnosis JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`)
    const dup = await conn.execute(`SELECT id FROM bug_reports WHERE error_message=? AND component_name=? AND last_seen > DATE_SUB(NOW(), INTERVAL 1 HOUR) LIMIT 1`, [error_message, component_name||'Unknown'])
    if (((dup as any).rows||[]).length > 0) {
      await conn.execute(`UPDATE bug_reports SET occurrence_count=occurrence_count+1, last_seen=NOW() WHERE id=?`, [(dup as any).rows[0].id])
      res.json({ ok: true, duplicate: true }); return
    }
    const bugs = await conn.execute(`INSERT INTO bug_reports (error_message,stack_trace,component_name,user_action,url_path,user_email,browser,severity) VALUES (?,?,?,?,?,?,?,?)`,
      [error_message, stack_trace||null, component_name||'Unknown', user_action||'unknown', url_path||'unknown', user_email||null, browser||null, severity||'medium'])
    if (severity === 'critical' || severity === 'high') {
      import('./architectAgent').then(({ runArchitectAgent }) => {
        runArchitectAgent((bugs as any).lastInsertId?.toString() || '').catch(console.error)
      })
    }
    const { sendTelegram } = await import('./telegram')
    await sendTelegram(
      `🚨 <b>JANET — BUG DETECTED</b>\n` +
      `Page: ${url_path || 'unknown'}\n` +
      `Component: ${component_name || 'Unknown'}\n` +
      `Error: ${String(error_message).slice(0, 200)}\n` +
      `Severity: ${severity || 'medium'}`
    )
    res.json({ ok: true })
  } catch(e: any) { res.status(500).json({ error: e.message }) }
}

export async function qaSmokePS(req: Request, res: Response) {
  if (!okHQ(req,res) && !okCron(req,res)) return
  try {
    const { runQASmoke } = await import('./architectAgent')
    res.json(await runQASmoke('manual'))
  } catch(e: any) { res.status(500).json({ error: e.message }) }
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

// ════════════════════════════════════════════════════════════════════════════
//  KAAN AI OS v4 — Janet + 8 named specialist agents (added, not replacing)
//  Exposed under /api/os/v4/* so it never collides with the v3 routes above
// ════════════════════════════════════════════════════════════════════════════

function okV4(req: Request, res: Response): boolean {
  const secret = (req.headers['x-os-secret'] as string) || (req.query.secret as string)
  if (secret !== HQ) { res.status(401).json({ error: 'Unauthorized' }); return false }
  return true
}

export async function v4Status(req: Request, res: Response) {
  if (!okV4(req, res)) return
  try { res.json(await getOSStatus(COMPANY)) } catch (e: any) { res.status(500).json({ error: e.message }) }
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
