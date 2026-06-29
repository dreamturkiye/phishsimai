import { Router, Request, Response } from 'express'
import {
  runJanetFullOrchestration, getOSStatus, runDailyStandup, runWeeklyReview,
  talkToAgent, janetTellAgent, issueTask, executeTask, reviewTask,
  AGENTS, AgentId
} from '../agents/kaan_os_v4'

const router = Router()
const SECRET = process.env.OS_SECRET || 'ps-hq-2026'
const COMPANY = 'phishsimai'

function auth(req: Request, res: Response, next: Function) {
  const secret = (req.headers['x-os-secret'] as string) || (req.query.secret as string)
  if (secret !== SECRET) { res.status(401).json({ error: 'Unauthorized' }); return }
  next()
}

// GET /api/os?action=status|standup|weekly_review|full|roster
router.get('/', auth, async (req: Request, res: Response) => {
  const action = (req.query.action as string) || 'status'
  try {
    if (action === 'status')        return void res.json(await getOSStatus(COMPANY))
    if (action === 'standup')       return void res.json(await runDailyStandup(COMPANY))
    if (action === 'weekly_review') return void res.json(await runWeeklyReview(COMPANY))
    if (action === 'full')          return void res.json(await runJanetFullOrchestration(COMPANY))
    if (action === 'roster')        return void res.json({ agents: Object.values(AGENTS) })
    res.status(400).json({ error: 'Unknown action', available: ['status','standup','weekly_review','full','roster'] })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// POST /api/os/agent/:name — talk to / task any agent
router.post('/agent/:name', auth, async (req: Request, res: Response) => {
  const name = req.params.name as AgentId
  const { message, mode, title, priority, from_janet } = req.body
  if (!AGENTS[name]) {
    return void res.status(400).json({ error: `Unknown agent: ${name}`, available: Object.keys(AGENTS) })
  }
  try {
    if (mode === 'task') {
      const task = await issueTask(name, {
        title: title || message?.slice(0,80) || 'Ad-hoc task',
        description: message || '', priority: priority || 'high', due_in_hours: 24
      }, COMPANY)
      const result = await executeTask(task.task_id, COMPANY)
      const review = await reviewTask(task.task_id, COMPANY)
      return void res.json({ task, result: result.result, review: review.feedback, score: review.score })
    }
    if (mode === 'janet_tells') {
      return void res.json(await janetTellAgent(name, message, COMPANY))
    }
    res.json(await talkToAgent(name, message || '', COMPANY, from_janet || false))
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// GET /api/os/agent/:name?message=... — quick talk
router.get('/agent/:name', auth, async (req: Request, res: Response) => {
  const name = req.params.name as AgentId
  const message = req.query.message as string
  if (!AGENTS[name]) {
    return void res.status(400).json({ error: `Unknown agent: ${name}`, available: Object.keys(AGENTS) })
  }
  if (!message) return void res.json({ agent: AGENTS[name], usage: `Add ?message=... to talk to ${AGENTS[name].name}` })
  try {
    res.json(await talkToAgent(name, message, COMPANY, false))
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

export default router
