export const AGENT_UPGRADE_ROLLOUT = Object.freeze({
  canaryProduct: 'scrollfuel',
  soakThen: 'phishsimai',
  providersUnchanged: true,
  promotionRequires: [
    'green_ci',
    'no_critical_eval_regressions',
    'verified_production_deploy',
  ] as const,
  qualitySeparateFromLiveness: true,
})
