import { describe, expect, it } from 'vitest'
import {
  EVAL_CORPUS_VERSION as PACKAGE_CORPUS_VERSION,
  EVAL_WORKER_IDS as PACKAGE_WORKER_IDS,
} from '@kaan/os-core/evals'
import {
  EVAL_CORPUS_VERSION,
  EVAL_WORKER_IDS,
  PHISHSIM_EVAL_CONTRACT,
} from './productEvalContract'

describe('PhishSimAI shared operational eval contract', () => {
  it('re-exports the package-owned operational-v2 contract', () => {
    expect(EVAL_CORPUS_VERSION).toBe(PACKAGE_CORPUS_VERSION)
    expect(EVAL_WORKER_IDS).toBe(PACKAGE_WORKER_IDS)
    expect(PHISHSIM_EVAL_CONTRACT.corpusVersion).toBe(PACKAGE_CORPUS_VERSION)
    expect(PHISHSIM_EVAL_CONTRACT.workerIds).toBe(PACKAGE_WORKER_IDS)
  })

  it('gets the canonical nine worker IDs from the installed package', () => {
    expect(PACKAGE_CORPUS_VERSION).toBe('operational-v2')
    expect(PACKAGE_WORKER_IDS).toEqual([
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
    expect(new Set(PACKAGE_WORKER_IDS).size).toBe(9)
  })
})
