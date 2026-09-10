export type EvaluationScoreLabel = 'score' | 'confidence'

/**
 * Parse an explicitly labelled 0..10 evaluation score.
 *
 * The canonical form is "SCORE: X/10"; a labelled integer without the suffix
 * remains valid for compatibility with existing task reviews. Missing,
 * malformed, fractional, wrong-denominator, or out-of-range values are
 * deliberately unscored.
 */
export function parseEvaluationScore(
  output: string,
  label: EvaluationScoreLabel,
): number | null {
  const match = label === 'score'
    ? output.match(/\bscore(?:\*\*)?\s*:\s*([+-]?\d+(?:\.\d+)?)(?![\d.])(?:\s*\/\s*10\b|(?!\s*\/))/i)
    : parseConfidenceMatch(output)
  if (!match) return null

  const score = Number(match[1])
  return Number.isInteger(score) && score >= 0 && score <= 10 ? score : null
}

function parseConfidenceMatch(output: string): RegExpMatchArray | null {
  const confidenceLine = output.split(/\r?\n/).find(line => /\bconfidence(?:\s+level)?\b/i.test(line))
  if (!confidenceLine) return null

  return confidenceLine.match(/([+-]?\d+(?:\.\d+)?)\s*\/\s*10\b/)
    ?? confidenceLine.match(/\bconfidence(?:\s+level)?\b[^:\n]*:\s*([+-]?\d+(?:\.\d+)?)\b/i)
    ?? confidenceLine.match(/\bconfidence(?:\s+level)?\s+([+-]?\d+(?:\.\d+)?)\b/i)
}

export function isScoredEvaluation(score: number | null): score is number {
  return score !== null
}

export function formatEvaluationScore(score: number | null | undefined): string {
  return score == null ? 'unscored' : `${score}/10`
}
