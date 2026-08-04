// ─────────────────────────────────────────────────────────────────────────────
//  PS-HUMAN-RISK-01 — feed the Human Risk composite its real inputs.
//
//  Reads the two dimensions that have data (phishing from gamificationScores, training from
//  training_assignments) and omits department honestly. Every dimension that cannot be measured
//  reads null and is excluded — never fabricated.
// ─────────────────────────────────────────────────────────────────────────────
import { getGamificationScores, getTrainingAssignmentStats } from '../db'
import {
  computeHumanRisk,
  phishingDimension,
  trainingDimension,
  departmentDimension,
  type HumanRisk,
} from './humanRiskScore'

export async function collectHumanRisk(orgId: number): Promise<HumanRisk> {
  const scored = await getGamificationScores(orgId).catch(() => [])
  const stats = await getTrainingAssignmentStats(orgId).catch(() => ({ assigned: 0, completed: 0 }))
  return computeHumanRisk([
    phishingDimension(scored.map((s: any) => ({ riskScore: s.riskScore }))),
    trainingDimension(stats.assigned, stats.completed),
    departmentDimension(),
  ])
}
