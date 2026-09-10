import { describe, expect, it } from 'vitest'
import { PHISHSIM_EVAL_CONTRACT } from './productEvalContract'

describe('PhishSimAI shared operational eval contract', () => {
  it('targets operational-v2 and its canonical nine workers', () => {
    expect(PHISHSIM_EVAL_CONTRACT.corpusVersion).toBe('operational-v2')
    expect(PHISHSIM_EVAL_CONTRACT.workerIds).toEqual([
      'marcus',
      'mason',
      'aria',
      'nova',
      'rex',
      'scout',
      'finn',
      'vera',
      'dex',
    ])
    expect(new Set(PHISHSIM_EVAL_CONTRACT.workerIds).size).toBe(9)
  })

  it('declares the operational-v2 output envelope', () => {
    expect(PHISHSIM_EVAL_CONTRACT.outputEnvelope).toEqual({
      requiredFields: ['status', 'summary', 'facts', 'calculations', 'actions', 'safety'],
      statuses: ['answered', 'proposed', 'abstained', 'blocked'],
      safetyRequiredFields: ['abstained', 'reasons'],
    })
  })
})
