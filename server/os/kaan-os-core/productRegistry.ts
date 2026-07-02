import type { ProductOsConfig } from './types'

/** Canonical product configs — override env at runtime via getProductConfig() */
export const PRODUCT_REGISTRY: Record<string, ProductOsConfig> = {
  scrollfuel: {
    productId: 'scrollfuel',
    companyId: 'scrollfuel',
    label: 'ScrollFuel',
    baseUrl: 'https://scrollfuel.io',
    hqSecret: 'sf-hq-2026',
    devBranch: 'dev',
    prodBranch: 'master',
    vercelProject: 'ugc-agency',
    architectTable: 'architect_tasks',
    routes: {
      architectPending: '/api/architect/pending',
      architectWake: '/api/architect/wake',
      architectCode: '/api/architect/code',
      architectComplete: '/api/architect/complete',
      bugReport: '/api/os/bug-report',
      hqChat: '/api/hq/chat',
      janetSignedUrl: '/api/janet/signed-url',
      janetTool: '/api/janet/tool',
      wiring: '/api/os?action=wiring',
      healTestArm: 'sf-hq-2026',
    },
    janetAgentEnvKey: 'ELEVENLABS_AGENT_JANET_SCROLLFUEL',
    repoPath: '/Users/kaan/ugc-agency',
  },
  phishsimai: {
    productId: 'phishsimai',
    companyId: 'phishsimai',
    label: 'PhishSimAI',
    baseUrl: 'https://phishsimai.com',
    hqSecret: 'ps-hq-2026',
    devBranch: 'dev',
    prodBranch: 'main',
    vercelProject: 'phishsimai',
    architectTable: 'os_architect_tasks',
    routes: {
      architectPending: '/api/os/architect/pending',
      architectWake: '/api/os/architect/wake',
      architectCode: '/api/os/architect/code',
      architectComplete: '/api/os/architect/complete',
      bugReport: '/api/os/bug-report',
      hqChat: '/api/os/hq/chat',
      janetSignedUrl: '/api/os/janet/signed-url',
      janetTool: '/api/os/janet/tool',
      wiring: '/api/os/v4/wiring',
      healTestArm: 'ps-hq-2026',
    },
    janetAgentEnvKey: 'ELEVENLABS_AGENT_JANET_PHISHSIM',
    repoPath: '/Users/kaan/phishsimai',
  },
  vellachat: {
    productId: 'vellachat',
    companyId: 'vellachat',
    label: 'VellaChat',
    baseUrl: 'https://vellachat.com',
    hqSecret: 'vc-hq-2026',
    devBranch: 'develop',
    prodBranch: 'main',
    vercelProject: 'vela',
    architectTable: 'architect_tasks',
    routes: {
      architectPending: '/api/architect/pending',
      architectWake: '/api/architect/wake',
      architectCode: '/api/architect/code',
      architectComplete: '/api/architect/complete',
      bugReport: '/api/os/bug-report',
      hqChat: '/api/hq/chat',
      janetSignedUrl: '/api/janet/signed-url',
      janetTool: '/api/janet/tool',
      wiring: '/api/os?action=wiring',
      healTestArm: 'vc-hq-2026',
    },
    janetAgentEnvKey: 'ELEVENLABS_AGENT_JANET_VELLACHAT',
    repoPath: '/Users/kaan/vellachat-source',
  },
}

export function getProductConfig(productId: string): ProductOsConfig {
  const cfg = PRODUCT_REGISTRY[productId]
  if (!cfg) {
    throw new Error(`Unknown productId: ${productId}. Register in PRODUCT_REGISTRY or use instantiateNewProduct().`)
  }
  return cfg
}

export function listRegisteredProducts(): ProductOsConfig[] {
  return Object.values(PRODUCT_REGISTRY)
}

/** Template for new site — fill in and add to registry + Marcus watcher PRODUCTS */
export function instantiateNewProduct(partial: Pick<ProductOsConfig, 'productId' | 'companyId' | 'label' | 'baseUrl' | 'hqSecret' | 'repoPath'> & Partial<ProductOsConfig>): ProductOsConfig {
  const id = partial.productId
  return {
    productId: id,
    companyId: partial.companyId || id,
    label: partial.label,
    baseUrl: partial.baseUrl,
    hqSecret: partial.hqSecret,
    devBranch: partial.devBranch || 'develop',
    prodBranch: partial.prodBranch || 'main',
    vercelProject: partial.vercelProject || id,
    architectTable: partial.architectTable || 'architect_tasks',
    routes: partial.routes || {
      architectPending: '/api/architect/pending',
      architectWake: '/api/architect/wake',
      architectCode: '/api/architect/code',
      architectComplete: '/api/architect/complete',
      bugReport: '/api/os/bug-report',
      hqChat: '/api/hq/chat',
      janetSignedUrl: '/api/janet/signed-url',
      janetTool: '/api/janet/tool',
      wiring: '/api/os?action=wiring',
      healTestArm: `${id}-hq-2026`,
    },
    janetAgentEnvKey: partial.janetAgentEnvKey || `ELEVENLABS_AGENT_JANET_${id.toUpperCase()}`,
    repoPath: partial.repoPath,
  }
}
