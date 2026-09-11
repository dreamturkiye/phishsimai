import { describe, expect, it } from 'vitest'
import { ForbiddenError, UnauthorizedError, HttpError } from '../../shared/_core/errors'
import { miaClientError } from './http'

describe('miaClientError never leaks raw FORBIDDEN / Invalid session', () => {
  it('maps authenticateRequest ForbiddenError(Invalid session) to sign-in, not 500', () => {
    const body = miaClientError(ForbiddenError('Invalid session'))
    expect(body.status).toBe(401)
    expect(body.error).toBe('Please sign in again.')
    expect(body.error).not.toMatch(/FORBIDDEN|Invalid session/i)
  })

  it('maps statusCode-only HttpError 403 Forbidden to workspace copy', () => {
    const err = new HttpError(403, 'Forbidden')
    const body = miaClientError(err)
    expect(body.status).toBe(403)
    expect(body.error).toMatch(/workspace/i)
    expect(body.error).not.toBe('Forbidden')
  })

  it('maps UnauthorizedError to sign-in', () => {
    const body = miaClientError(UnauthorizedError('User not found'))
    expect(body.status).toBe(401)
    expect(body.error).toBe('Please sign in again.')
  })

  it('maps provider refusal to 503 without echoing FORBIDDEN', () => {
    const body = miaClientError(new Error('provider refusal: FORBIDDEN'))
    expect(body.status).toBe(503)
    expect(body.error).toMatch(/temporarily unavailable/i)
    expect(body.error).not.toMatch(/FORBIDDEN/)
  })

  it('maps unknown errors to a generic 500', () => {
    const body = miaClientError(new Error('ECONNRESET'))
    expect(body.status).toBe(500)
    expect(body.error).toBe('Something went wrong. Try again.')
  })
})
