// ─────────────────────────────────────────────────────────────────────────────
//  PS-TEMPLATE-ASSETS-01 — no template may reference an image that isn't in the repo.
//
//  THE DEFECT THIS LOCKS OUT
//    All 22 image-bearing templates pointed at upload.wikimedia.org thumbnail URLs. Every one
//    returned HTTP 400 — Wikimedia restricted that thumb path — so every brand logo rendered as a
//    broken box in the recipient's inbox. In a phishing SIMULATION a broken logo is an instant
//    "this is fake" tell that defeats the exercise. The root cause was depending on someone else's
//    host; the fix was self-hosting under /template-assets/. This test makes the dependency
//    impossible to reintroduce.
//
//  TWO RAILS, same shape as the send-path merge guard and #72's protected-path audit:
//    (a) every /template-assets/<file> a template references must EXIST in client/public.
//    (b) NO template may reference an external image host — that is the exact class of dependency
//        that broke. Our own domain only.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const ASSET_DIR = 'client/public/template-assets'
const templates = JSON.parse(fs.readFileSync('server/seed_templates.json', 'utf8')) as Array<{ name: string; htmlBody: string }>
const hosted = new Set(fs.existsSync(ASSET_DIR) ? fs.readdirSync(ASSET_DIR) : [])

function imgSrcs(html: string): string[] {
  return [...(html ?? '').matchAll(/<img[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1])
}

describe('PS-TEMPLATE-ASSETS-01 — every referenced image is in the repo', () => {
  it('every /template-assets/ reference resolves to a hosted file', () => {
    const missing: string[] = []
    for (const t of templates) {
      for (const src of imgSrcs(t.htmlBody)) {
        const m = src.match(/\/template-assets\/([^"'?#]+)/)
        if (m && !hosted.has(m[1])) missing.push(`${t.name}: ${m[1]}`)
      }
    }
    expect(missing, `templates referencing a missing asset:\n${missing.join('\n')}`).toEqual([])
  })

  it('NO template references an external image host — that is what broke', () => {
    const external: string[] = []
    for (const t of templates) {
      for (const src of imgSrcs(t.htmlBody)) {
        // Absolute URL to any host other than our own is the reintroduced dependency.
        const m = src.match(/^https?:\/\/([^/]+)/i)
        if (m && !/(^|\.)phishsimai\.com$/i.test(m[1])) external.push(`${t.name}: ${src.slice(0, 60)}`)
      }
    }
    // Explicitly catches a Wikimedia thumb URL creeping back in.
    expect(external, `templates with an external image host:\n${external.join('\n')}`).toEqual([])
  })

  it('the dead Wikimedia thumb pattern appears in NO template', () => {
    const offenders = templates.filter((t) => /upload\.wikimedia\.org/i.test(t.htmlBody ?? '')).map((t) => t.name)
    expect(offenders, `templates still referencing Wikimedia:\n${offenders.join('\n')}`).toEqual([])
  })

  it('the check is not vacuous — templates DO reference hosted assets', () => {
    const refCount = templates.reduce(
      (n, t) => n + imgSrcs(t.htmlBody).filter((s) => s.includes('/template-assets/')).length, 0,
    )
    expect(refCount).toBeGreaterThan(0)
  })

  it('every hosted asset a template names is a real, non-empty file', () => {
    const referenced = new Set<string>()
    for (const t of templates)
      for (const src of imgSrcs(t.htmlBody)) {
        const m = src.match(/\/template-assets\/([^"'?#]+)/)
        if (m) referenced.add(m[1])
      }
    for (const f of referenced) {
      const stat = fs.statSync(`${ASSET_DIR}/${f}`)
      expect(stat.size, `${f} is empty`).toBeGreaterThan(0)
    }
  })
})
