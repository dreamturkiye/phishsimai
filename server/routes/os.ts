import { Router } from 'express'
import { runJanetFullOrchestration, getOSStatus, runDailyStandup, runWeeklyReview, talkToAgent, janetTellAgent, issueTask, executeTask, reviewTask, AGENTS } from '../lib/kaan_os_v4'
import type { AgentId, AgentTask } from '../lib/kaan_os_v4'

const router = Router()
const SECRET = process.env.OS_SECRET
const COMPANY = 'phishsimai'

// Narrow an untrusted route/body value to a real agent key before indexing AGENTS.
function isAgentId(value: unknown): value is AgentId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(AGENTS, value)
}

type TaskPriority = AgentTask['priority']
function isPriority(value: unknown): value is TaskPriority {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low'
}

function auth(req: any, res: any, next: any) {
  const secret = req.headers['x-os-secret'] || req.query.secret
  if (!SECRET || secret !== SECRET) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

// GET /api/os?action=status|standup|weekly_review|full|roster
router.get('/', auth, async (req, res) => {
  const action = req.query.action || 'status'
  try {
    if (action === 'status')        return res.json(await getOSStatus(COMPANY))
    if (action === 'standup')       return res.json(await runDailyStandup(COMPANY))
    if (action === 'weekly_review') return res.json(await runWeeklyReview(COMPANY))
    if (action === 'full')          return res.json(await runJanetFullOrchestration(COMPANY))
    if (action === 'roster')        return res.json({ agents: Object.values(AGENTS) })
    res.status(400).json({ error: 'Unknown action', available: ['status','standup','weekly_review','full','roster'] })
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// POST /api/os/agent/:name
router.post('/agent/:name', auth, async (req, res) => {
  const name = req.params.name
  const { message, mode, title, priority, from_janet } = req.body as {
    message?: string
    mode?: string
    title?: string
    priority?: unknown
    from_janet?: boolean
  }
  if (!isAgentId(name)) return res.status(400).json({ error: `Unknown agent: ${name}`, available: Object.keys(AGENTS) })
  try {
    if (mode === 'task') {
      const taskTitle = title || message?.slice(0,80)
      if (!taskTitle) return res.status(400).json({ error: 'A title or message is required for mode=task' })
      const task = await issueTask(name, { title: taskTitle, description: message || '', priority: isPriority(priority) ? priority : 'high', due_in_hours: 24 }, COMPANY)
      const result = await executeTask(task.task_id, COMPANY)
      const review = await reviewTask(task.task_id, COMPANY)
      return res.json({ task, result: result.result, review: review.feedback, score: review.score })
    }
    if (mode === 'janet_tells') {
      if (!message) return res.status(400).json({ error: 'A message is required for mode=janet_tells' })
      return res.json(await janetTellAgent(name, message, COMPANY))
    }
    res.json(await talkToAgent(name, message || '', COMPANY, from_janet || false))
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

// GET /api/os/agent/:name?message=...
router.get('/agent/:name', auth, async (req, res) => {
  const name = req.params.name
  const message = req.query.message as string
  if (!isAgentId(name)) return res.status(400).json({ error: `Unknown agent: ${name}`, available: Object.keys(AGENTS) })
  if (!message) return res.json({ agent: AGENTS[name] })
  try {
    res.json(await talkToAgent(name, message, COMPANY, false))
  } catch (e: any) { res.status(500).json({ error: e.message }) }
})

export default router
