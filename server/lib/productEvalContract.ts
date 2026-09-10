/**
 * Product-side compatibility marker for the shared @kaan/os-core evaluation
 * contract. Phase 3 will replace this local declaration with a package import.
 */
export const PHISHSIM_EVAL_CONTRACT = Object.freeze({
  corpusVersion: 'operational-v2',
  workerIds: Object.freeze([
    'marcus',
    'mason',
    'aria',
    'nova',
    'rex',
    'scout',
    'finn',
    'vera',
    'dex',
  ] as const),
  outputEnvelope: Object.freeze({
    requiredFields: Object.freeze([
      'status',
      'summary',
      'facts',
      'calculations',
      'actions',
      'safety',
    ] as const),
    statuses: Object.freeze(['answered', 'proposed', 'abstained', 'blocked'] as const),
    safetyRequiredFields: Object.freeze(['abstained', 'reasons'] as const),
  }),
})
