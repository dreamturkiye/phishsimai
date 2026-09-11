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

function errStatus(e: unknown): number | undefined {
  const err = e as { status?: number; statusCode?: number }
  return err.status ?? err.statusCode
}

export function miaClientError(e: unknown): { status: number; error: string } {
  const status = errStatus(e)
  const msg = e instanceof Error ? e.message : String(e)
  // authenticateRequest throws ForbiddenError("Invalid session") with statusCode 403.
  // That is a missing login, not a workspace ACL miss — check it first.
  if (status === 401 || /invalid session|user not found|unauthorized/i.test(msg)) {
    return { status: 401, error: 'Please sign in again.' }
  }
  if (status === 403 || /^forbidden$/i.test(msg)) {
    return { status: 403, error: 'You do not have access to this workspace. Refresh the page.' }
  }
  if (/provider refusal|temporarily unavailable|^FORBIDDEN$/i.test(msg)) {
    return { status: 503, error: 'Assistant is temporarily unavailable. Try again in a moment.' }
  }
  return { status: 500, error: 'Something went wrong. Try again.' }
}

function handleErr(res: Response, e: unknown) {
  const body = miaClientError(e)
  res.status(body.status).json({ error: body.error })
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
