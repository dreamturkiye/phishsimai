import type { Request, Response } from 'express'
import { sdk } from '../_core/sdk'
import { getOrgMember } from '../db'
import {
  ensureMiaTables,
  getActivationState,
  miaChat,
  recordProductFeedback,
} from './miaChat'

async function authUser(req: Request) {
  return sdk.authenticateRequest(req)
}

async function requireOrgAccess(userId: number, orgId: number) {
  const member = await getOrgMember(orgId, userId)
  if (!member) {
    const err = new Error('Forbidden') as Error & { status: number }
    err.status = 403
    throw err
  }
}

function handleErr(res: Response, e: unknown) {
  const err = e as Error & { status?: number }
  if (err.status === 403) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  if (err.message?.includes('Unauthorized') || err.message?.includes('UNAUTHORIZED')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  res.status(500).json({ error: err.message || 'Server error' })
}

export async function miaHttpChat(req: Request, res: Response) {
  try {
    const user = await authUser(req)
    const { orgId, message, pathname, explicitFeedback, feedbackCategory, rating } = req.body ?? {}
    if (!orgId || !message) {
      res.status(400).json({ error: 'orgId and message required' })
      return
    }
    await requireOrgAccess(user.id, Number(orgId))
    const result = await miaChat({
      userId: user.id,
      orgId: Number(orgId),
      message: String(message),
      pathname: pathname ? String(pathname) : undefined,
      explicitFeedback: Boolean(explicitFeedback),
      feedbackCategory,
      rating: rating != null ? Number(rating) : undefined,
    })
    res.json({ ok: true, ...result })
  } catch (e) {
    handleErr(res, e)
  }
}

export async function miaHttpActivation(req: Request, res: Response) {
  try {
    const user = await authUser(req)
    const orgId = Number(req.query.orgId)
    if (!orgId) {
      res.status(400).json({ error: 'orgId required' })
      return
    }
    await requireOrgAccess(user.id, orgId)
    await ensureMiaTables()
    const activation = await getActivationState(orgId)
    res.json({ ok: true, activation })
  } catch (e) {
    handleErr(res, e)
  }
}

export async function miaHttpFeedback(req: Request, res: Response) {
  try {
    const user = await authUser(req)
    const { orgId, message, pathname, category, rating } = req.body ?? {}
    if (!orgId || !message) {
      res.status(400).json({ error: 'orgId and message required' })
      return
    }
    await requireOrgAccess(user.id, Number(orgId))
    const id = await recordProductFeedback({
      userId: user.id,
      orgId: Number(orgId),
      message: String(message),
      pathname: pathname ? String(pathname) : undefined,
      category,
      rating: rating != null ? Number(rating) : undefined,
    })
    res.json({ ok: true, id })
  } catch (e) {
    handleErr(res, e)
  }
}
