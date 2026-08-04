// PS-DELIVER-ALLOWLIST-01 UI — the wizard exists, calls the real gate endpoints, keeps the honesty label.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const WIZ = fs.readFileSync('client/src/components/AllowlistWizard.tsx', 'utf8')
const ROUTERS = fs.readFileSync('server/routers.ts', 'utf8')
const SETTINGS = fs.readFileSync('client/src/pages/OrgSettings.tsx', 'utf8')

describe('the wizard is wired to the working gate', () => {
  it('reads state, confirms, and skips via the allowlist router', () => {
    expect(WIZ).toContain('trpc.allowlist.state.useQuery')
    expect(WIZ).toContain('trpc.allowlist.confirm.useMutation')
    expect(WIZ).toContain('trpc.allowlist.skip.useMutation')
  })
  it('the allowlist router exposes state/confirm/skip', () => {
    expect(ROUTERS).toContain('allowlist: router({')
    expect(ROUTERS).toContain('confirmOrgAllowlist')
    expect(ROUTERS).toContain('skipOrgAllowlist')
  })
  it('is mounted in OrgSettings', () => {
    expect(SETTINGS).toContain('<AllowlistWizard orgId={orgId} />')
  })
})

describe('the honesty label survives in the UI', () => {
  it('confirmed state reads "admin confirmed — not verified by us", never "verified"', () => {
    expect(WIZ).toContain('Admin confirmed — not verified by us')
    expect(WIZ).toContain('we never claim we did')
  })
  it('skip requires acknowledging the spam warning (sends SKIP_WARNING as ack)', () => {
    expect(WIZ).toContain('window.confirm(data.skipWarning)')
    expect(WIZ).toContain('ack: data.skipWarning')
  })
  it('the skip endpoint requires a non-empty ack (the gate rejects a bare skip)', () => {
    const skip = ROUTERS.slice(ROUTERS.indexOf('skip: protectedProcedure'), ROUTERS.indexOf('skip: protectedProcedure') + 400)
    expect(skip).toContain('ack: z.string().min(1)')
  })
})
