import { Request, Response } from 'express'
import { COMPANY_ID } from './version'
import { dispatchMarcusWake, getMarcusWakeAt } from './wakeMarcus'

const HQ = process.env.HQ_SECRET || 'ps-hq-2026'

function okHQ(req: Request): boolean {
  const secret = (req.headers['x-os-secret'] as string) || (req.query.secret as string)
  return secret === HQ
}

/** GET/POST /api/os/architect/wake — instant Marcus daemon pickup signal */
export async function architectWake(req: Request, res: Response) {
  if (!okHQ(req)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  if (req.method === 'GET') {
    const wakeAt = await getMarcusWakeAt(COMPANY_ID)
    res.json({
      ok: true,
      product: COMPANY_ID,
      wake_at: wakeAt,
      daemon_poll_seconds: 3,
      timestamp: new Date().toISOString(),
    })
    return
  }

  const taskId = req.body?.taskId ? String(req.body.taskId) : undefined
  await dispatchMarcusWake(COMPANY_ID, { taskId, product: 'phishsim' })
  const wakeAt = await getMarcusWakeAt(COMPANY_ID)
  res.json({ ok: true, wake_at: wakeAt, pinged: true })
}
