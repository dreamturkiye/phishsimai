// ─────────────────────────────────────────────────────────────────────────────
//  PS-TRUNCATE-02 — the INBOUND half of PS-TRUNCATE-01.
//
//  PS-TRUNCATE-01 stopped sendTelegram amputating at 4096. The inbound side went on
//  doing the very thing that fix condemned: `r.summary.slice(0,300)` on every agent's
//  standup report, before Janet read it and before it was stored.
//
//  The production tell was arithmetic: EVERY stored standup was exactly 1,549 chars —
//  5 reports × 300 + the fixed "[NAME]: " headers + separators. A number that constant
//  is not content, it is a ruler. Agents are asked for five items (completed / today /
//  blockers / key metric / confidence) at a 400-token budget; items 3-5 never survived.
//
//  Two properties are pinned here:
//    1. a real-length report is not trimmed AT ALL — the limit must not bind in practice;
//    2. when a limit does bind, the cut lands on a line boundary and SAYS it happened.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { trimToLineBoundary, AGENT_REPORT_LIMIT } from './kaan_os_v4'

// Shaped AND sized like the reports prod actually produces: five markdown sections, ~1.4k chars,
// which is what a 400-token budget yields. Length matters to this fixture — at 300 chars the old
// slice cut inside section 2, so a short fixture would not demonstrate the bug at all.
const realReport = [
  '**1. Completed Yesterday**',
  'Nothing completed. The ledger above shows no tasks closed in the last 24 hours and none',
  'assigned to me, so there is no work to report against. I am not going to describe progress',
  'on anything I was not given.',
  '',
  '**2. Working On Today**',
  'Unassigned — awaiting a task. Recommendation: put me on the credential-submission funnel.',
  'We are seeing strong top-of-funnel engagement and nothing at all at the capture step, and',
  'nobody currently owns finding out why that is.',
  '',
  '**3. Blockers**',
  'Real blocker: I have no instrumentation I can read on the credential-submission step. I can',
  'see sends, opens and clicks in the campaign results, but there is no event I can point at',
  'that would tell me whether a submission was attempted and failed, or never attempted.',
  '',
  '**4. Key Metric**',
  '80% open rate and 40% click rate across the simulation set, against 0% credentials',
  'submitted. The first two numbers are healthy for this category; the third has never been',
  'anything other than zero for as long as the table has existed.',
  '',
  '**5. Confidence**',
  '6/10 on hitting this week’s targets — the funnel question is unresolved and I cannot size',
  'the impact until someone can tell me whether that zero is a measurement gap or a real one.',
].join('\n')

describe('trimToLineBoundary — the limit must not bind on real reports', () => {
  it('leaves a real standup report completely untouched', () => {
    expect(trimToLineBoundary(realReport, AGENT_REPORT_LIMIT)).toBe(realReport)
  })

  it('keeps sections 3-5 — the ones slice(0,300) structurally destroyed', () => {
    const out = trimToLineBoundary(realReport, AGENT_REPORT_LIMIT)
    expect(out).toContain('**3. Blockers**')
    expect(out).toContain('**4. Key Metric**')
    expect(out).toContain('**5. Confidence**')
    // The old behaviour, stated as the thing that must never come back.
    expect(realReport.slice(0, 300)).not.toContain('**4. Key Metric**')
  })

  it('is generous enough for the largest report a 400-token budget can emit', () => {
    // 400 tokens is ~1,600 chars; even a 4x overshoot must pass through whole.
    const big = Array.from({ length: 120 }, (_, i) => `Line ${i}: a sentence Janet needs.`).join('\n')
    expect(big.length).toBeGreaterThan(1_600)
    expect(trimToLineBoundary(big, AGENT_REPORT_LIMIT)).toBe(big)
  })
})

describe('trimToLineBoundary — when it does bind', () => {
  it('never cuts mid-word', () => {
    const text = Array.from({ length: 200 }, (_, i) => `Line ${i}: something that matters.`).join('\n')
    const out = trimToLineBoundary(text, 500)
    const body = out.split('\n… [trimmed')[0]
    // Everything kept is a whole line of the original.
    for (const line of body.split('\n')) expect(text.split('\n')).toContain(line)
  })

  it('announces the trim instead of silently dropping text', () => {
    const text = 'a'.repeat(50) + '\n' + 'b'.repeat(5_000)
    const out = trimToLineBoundary(text, 1_000)
    expect(out).toMatch(/… \[trimmed \d+ of \d+ chars\]/)
  })

  it('reports a trim count that reconciles with the input length', () => {
    const text = Array.from({ length: 400 }, (_, i) => `Line ${i}: filler.`).join('\n')
    const out = trimToLineBoundary(text, 800)
    const m = out.match(/… \[trimmed (\d+) of (\d+) chars\]/)!
    const kept = out.split('\n… [trimmed')[0]
    expect(Number(m[2])).toBe(text.length)
    // dropped + kept accounts for the whole input (trimEnd may shave trailing whitespace).
    expect(Number(m[1]) + kept.length).toBe(text.length)
  })

  it('hard-splits rather than dropping everything when there is no boundary', () => {
    const unbroken = 'z'.repeat(9_000)
    const out = trimToLineBoundary(unbroken, 1_000)
    expect(out.startsWith('z'.repeat(1_000))).toBe(true)
  })

  it('leaves short text alone entirely — no marker, no change', () => {
    expect(trimToLineBoundary('Nothing completed.', AGENT_REPORT_LIMIT)).toBe('Nothing completed.')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  The second consequence: scripts/verify-standup.ts check 2 scans the stored
//  transcript for fabricated capability claims. While each block was a 300-char
//  fragment, that scan covered the first paragraph and nothing else — a
//  fabrication in section 3, 4 or 5 was invisible to it, and the check still
//  printed "clean across 5 agent report(s)". These tests pin the round trip:
//  render exactly as runDailyStandup now does, parse exactly as the verifier
//  does, and prove the TAIL of a report is inside the scanned text.
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors the `standupFull` rendering in runDailyStandup. */
const renderTranscript = (rs: { name: string; summary: string }[]) =>
  rs.map(r => `[${r.name.toUpperCase()}]: ${r.summary}`).join('\n\n')

/** Mirrors the participant-anchored splitter in scripts/verify-standup.ts. */
function parseBlocks(transcript: string, names: string[]): Map<string, string> {
  const alt = names.map(n => n.toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(Boolean).join('|')
  const rx = new RegExp(String.raw`\[(${alt})\]:\s*([\s\S]*?)(?=\n\n\[(?:${alt})\]:|$)`, 'g')
  const out = new Map<string, string>()
  for (const m of transcript.matchAll(rx)) out.set(m[1].toLowerCase(), m[2].trim())
  return out
}

const NAMES = ['marcus', 'aria', 'finn', 'vera', 'rex']

describe('transcript round trip — the fabrication scan sees the whole report', () => {
  const reports = NAMES.map(name => ({ name, summary: realReport }))

  it('parses one complete block per agent', () => {
    const blocks = parseBlocks(renderTranscript(reports), NAMES)
    expect(blocks.size).toBe(5)
    for (const name of NAMES) expect(blocks.get(name)).toBe(realReport)
  })

  it('scans a fabrication hidden in the LAST section of a report', () => {
    // The exact class check 2 hunts: an action no text-only agent can perform. Placed in
    // section 5, ~1.4k chars in — comfortably past where the old 300-char slice ended.
    const tainted = `${realReport}\n\nAlso, I deployed the fix to production and bypassed the dev queue.`
    const blocks = parseBlocks(renderTranscript([{ name: 'aria', summary: tainted }]), NAMES)
    const aria = blocks.get('aria')!
    expect(aria).toContain('bypassed the dev queue')
    // ...and the old behaviour would have missed it, which is the whole point.
    expect(tainted.slice(0, 300)).not.toContain('bypassed the dev queue')
  })

  it('does not split on a bracketed word an agent writes mid-report', () => {
    // The regression the participant anchor prevents: a longer report has room for this.
    const chatty = `${realReport}\n\n[NOTE]: escalating this to Janet directly.`
    const blocks = parseBlocks(renderTranscript([{ name: 'vera', summary: chatty }]), NAMES)
    expect(blocks.size).toBe(1)
    expect(blocks.get('vera')).toContain('[NOTE]: escalating this to Janet directly.')
  })

  it('a stored transcript is no longer a constant length', () => {
    // 1,549 chars every single day was the tell. Vary one report; the total must move.
    const a = renderTranscript(reports)
    const b = renderTranscript([{ name: 'marcus', summary: 'Nothing completed.' }, ...reports.slice(1)])
    expect(a.length).not.toBe(b.length)
    expect(a.length).toBeGreaterThan(1_549)
  })
})
