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
import { dispatchMarcusWake } from './wakeMarcus'
import { queueJanetArchitectTask } from './selfHeal'
import {
  runJanetFullOrchestration, getOSStatus, runDailyStandup, runWeeklyReview,
  talkToAgent, janetTellAgent, issueTask, executeTask, reviewTask,
  AGENTS, AgentId
} from './lib/kaan_os_v4'
import { cronAgentWatchdog } from './agentWatchdog'
import { runJanetReport } from './janetReport'
import { getAllAgentHealth } from './agentHealth_v2'
import { buildPipelineView, type RawPipelineLead } from './pipelineView'
import { runSarahSocialCron, listSocialQueue, queueSocialItem } from './social/sarahSocial'
import { buildAnalyticsView, ingestAnalyticsEvent } from './siteAnalytics'
import { verifyRedditLogin } from './social/redditClient'

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
    // Add logic to handle webhook reply
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}
---