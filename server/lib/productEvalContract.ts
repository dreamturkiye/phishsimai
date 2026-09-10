import {
  EVAL_CORPUS_VERSION,
  EVAL_WORKER_IDS,
} from '@kaan/os-core/evals'

export {
  EVAL_CORPUS_VERSION,
  EVAL_WORKER_IDS,
  gradeEvalOutput,
  loadEvalCorpus,
  parseEvalOutput,
} from '@kaan/os-core/evals'

/** Product-facing alias kept while consumers migrate to package exports directly. */
export const PHISHSIM_EVAL_CONTRACT = Object.freeze({
  corpusVersion: EVAL_CORPUS_VERSION,
  workerIds: EVAL_WORKER_IDS,
})
