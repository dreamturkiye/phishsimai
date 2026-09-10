import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  formatEvaluationScore,
  isScoredEvaluation,
  parseEvaluationScore,
} from './evaluationScore'

describe('parseEvaluationScore', () => {
  it('preserves valid task and weekly review scores', () => {
    expect(parseEvaluationScore('SCORE: 0/10 | FEEDBACK: incomplete', 'score')).toBe(0)
    expect(parseEvaluationScore('5. **Score**: 7 / 10', 'score')).toBe(7)
    expect(parseEvaluationScore('SCORE: 7 | FEEDBACK: useful', 'score')).toBe(7)
    expect(parseEvaluationScore('Score: 10/10\nExcellent.', 'score')).toBe(10)
  })

  it('preserves valid standup confidence formats', () => {
    expect(parseEvaluationScore('Confidence: 8/10', 'confidence')).toBe(8)
    expect(parseEvaluationScore('5. Confidence level on hitting targets (0-10): 6', 'confidence')).toBe(6)
    expect(parseEvaluationScore('Confidence 9', 'confidence')).toBe(9)
  })

  it.each([
    '',
    'No score was supplied.',
    'SCORE: excellent',
    'SCORE: 7/100',
    'SCORE: -1/10',
    'SCORE: 11/10',
    'SCORE: 7.5/10',
  ])('returns null for malformed or missing review output: %s', output => {
    expect(parseEvaluationScore(output, 'score')).toBeNull()
  })

  it.each([
    'Confidence is high.',
    'Confidence: -1/10',
    'Confidence: 11/10',
    'Confidence: 6.5/10',
  ])('returns null for malformed confidence output: %s', output => {
    expect(parseEvaluationScore(output, 'confidence')).toBeNull()
  })
})

describe('truthful unscored handling', () => {
  it('renders missing scores explicitly and excludes them from learning', () => {
    expect(formatEvaluationScore(null)).toBe('unscored')
    expect(formatEvaluationScore(undefined)).toBe('unscored')
    expect(formatEvaluationScore(0)).toBe('0/10')
    expect(isScoredEvaluation(null)).toBe(false)
    expect(isScoredEvaluation(7)).toBe(true)
  })

  it('keeps runtime review learning behind the scored guard', () => {
    const source = readFileSync(new URL('./kaan_os_v4.ts', import.meta.url), 'utf8')
    expect(source).toMatch(
      /if \(isScoredEvaluation\(score\)\) \{\s+const \{ correction, lesson \} = parseReviewForReflection/,
    )
    expect(source).toContain('withheld from learning — review was unscored')
    expect(source).toContain('review unscored: score missing, malformed, or outside 0..10')
    expect(source).not.toMatch(/scoreMatch\s*\?\s*parseInt/)
    expect(source).not.toMatch(/:\s*[76]\s*(?:\r?\n|$)/)
  })
})
