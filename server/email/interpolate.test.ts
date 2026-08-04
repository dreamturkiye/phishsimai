// ─────────────────────────────────────────────────────────────────────────────
//  PS-TEMPLATE-MERGE-01 — {{FirstName}} resolves; an unknown token can never ship literally.
//
//  The defect being pinned: a template authored with a merge field the engine does not fill puts
//  the raw token — "Hi {{FirstName}}," — into a recipient's inbox. In a phishing SIMULATION that is
//  a worse tell than the amateur copy we set out to fix. The build guard makes it impossible to
//  merge such a template; these tests prove both the fill and the guard.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  interpolate,
  unknownPlaceholders,
  placeholdersIn,
  KNOWN_PLACEHOLDERS,
  FIRST_NAME_FALLBACK,
} from './interpolate'

describe('interpolation fills what the engine knows', () => {
  it('resolves {{FirstName}} from the target', () => {
    expect(interpolate('Hi {{FirstName}},', { trackingLink: 'x', firstName: 'Dana' })).toBe('Hi Dana,')
  })

  it('resolves {{TRACKING_LINK}} everywhere it appears', () => {
    const out = interpolate('<a href="{{TRACKING_LINK}}">a</a> <a href="{{TRACKING_LINK}}">b</a>', { trackingLink: 'https://x/c/tok' })
    expect(out).not.toContain('{{TRACKING_LINK}}')
    expect(out.match(/https:\/\/x\/c\/tok/g)).toHaveLength(2)
  })

  it('uses a NON-fabricated fallback when there is no first name', () => {
    // Never "Hi ," and never an invented name. A real bulk email also says "Hi there,".
    expect(interpolate('Hi {{FirstName}},', { trackingLink: 'x', firstName: null })).toBe(`Hi ${FIRST_NAME_FALLBACK},`)
    expect(interpolate('Hi {{FirstName}},', { trackingLink: 'x', firstName: '  ' })).toBe(`Hi ${FIRST_NAME_FALLBACK},`)
  })

  it('leaves an UNKNOWN token untouched — the guard, not the interpolator, rejects it', () => {
    // The interpolator does not silently blank unknowns (that would hide the defect); it leaves them
    // so the build guard can see and refuse them.
    expect(interpolate('{{SignInLocation}}', { trackingLink: 'x' })).toBe('{{SignInLocation}}')
  })
})

describe('THE BUILD GUARD — a token the engine cannot fill fails the build', () => {
  it('flags the fabricated-data placeholders we deliberately dropped', () => {
    const html = 'Location: {{SignInLocation}} Device: {{SignInDevice}} Time: {{SignInTime}}'
    expect(unknownPlaceholders(html).sort()).toEqual(['SignInDevice', 'SignInLocation', 'SignInTime'])
  })

  it('passes a template using only known placeholders', () => {
    expect(unknownPlaceholders('Hi {{FirstName}}, <a href="{{TRACKING_LINK}}">review</a>')).toEqual([])
  })

  it('KNOWN_PLACEHOLDERS contains only tokens the interpolator actually fills', () => {
    // Guards against the drift where a token is blessed for templates but never interpolated.
    for (const p of KNOWN_PLACEHOLDERS) {
      const filled = interpolate(`{{${p}}}`, { trackingLink: 'LINKVAL', firstName: 'NAMEVAL' })
      expect(filled, `${p} is in KNOWN_PLACEHOLDERS but interpolate() left it literal`).not.toContain(`{{${p}}}`)
    }
  })
})

describe('every built-in template ships only fillable placeholders', () => {
  const templates = JSON.parse(fs.readFileSync('server/seed_templates.json', 'utf8')) as Array<{ name: string; subject: string; htmlBody: string }>

  it('no seed template references an un-interpolated placeholder', () => {
    const offenders: string[] = []
    for (const t of templates) {
      const bad = unknownPlaceholders((t.subject ?? '') + ' ' + (t.htmlBody ?? ''))
      if (bad.length) offenders.push(`${t.name}: ${bad.join(', ')}`)
    }
    // If this fails, a template would ship a literal {{token}} into an inbox — the exact defect.
    expect(offenders, `templates with unfillable placeholders:\n${offenders.join('\n')}`).toEqual([])
  })

  it('at least one placeholder is actually in use, so the check is not vacuous', () => {
    const total = templates.reduce((n, t) => n + placeholdersIn((t.subject ?? '') + t.htmlBody).length, 0)
    expect(total).toBeGreaterThan(0)
  })
})
