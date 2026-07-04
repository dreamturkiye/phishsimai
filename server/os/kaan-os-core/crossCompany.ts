import { listRegisteredProducts } from './productRegistry'
import type { CrossCompanyTask, ProductId } from './types'

const crossCompanyQueue: CrossCompanyTask[] = []

/** In-memory cross-company task bus (persist to janet_memory in product adapters) */
export function publishCrossCompanyTask(task: Omit<CrossCompanyTask, 'id' | 'createdAt'>): CrossCompanyTask {
  const full: CrossCompanyTask = {
    ...task,
    id: `xc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  }
  crossCompanyQueue.push(full)
  if (crossCompanyQueue.length > 100) crossCompanyQueue.shift()
  return full
}

export function getCrossCompanyTasksFor(productId: ProductId): CrossCompanyTask[] {
  return crossCompanyQueue.filter(
    t => t.sourceProduct === productId || t.targetProducts.includes(productId),
  )
}

/** Propagate architect_memory pattern to sibling products (Janet CEO decision) */
export function propagateIncidentPattern(
  sourceProduct: ProductId,
  pattern: string,
  targetProducts?: ProductId[],
): CrossCompanyTask {
  const targets = targetProducts || listRegisteredProducts()
    .map(p => p.productId)
    .filter(id => id !== sourceProduct)
  return publishCrossCompanyTask({
    sourceProduct,
    targetProducts: targets,
    kind: 'pattern',
    payload: pattern.slice(0, 1000),
  })
}

export function crossCompanySummary(): string {
  const products = listRegisteredProducts().map(p => p.label).join(', ')
  return `Cross-company orchestration active across: ${products}. Queue depth: ${crossCompanyQueue.length}`
}
