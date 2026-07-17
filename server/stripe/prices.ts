/**
 * PS-STRIPE-PRICEMAP-01 — the Stripe account IS the source of truth.
 *
 * The old buildPriceMap() read price IDs from env var NAMES. The names drifted: the code read
 * STRIPE_STARTER_PRICE_ID etc.; production had STRIPE_PRICE_STARTER etc.; the one var that DID
 * resolve (STRIPE_PRICE_PRO) held a price from a DIFFERENT Stripe account. Env names are exactly
 * the thing that drifted, so this module reads /v1/prices from Stripe directly and never trusts
 * an env-supplied price ID again. memory.ts:72 already declared this doctrine: "SOURCE OF TRUTH:
 * Stripe. Never quote other numbers." This is the code obeying it.
 *
 * DISCRIMINATOR: the live account is shared across five products (StopThreatAI account
 * acct_1SX5XF...; it also carries "Scroll Fuel *" products — the $99/mo "Scroll Fuel Agency"
 * price is why a cold email once quoted $99). The prices carry NO lookup_key and NO
 * metadata.tier today, so the only clean signal is product.name. PhishSim products are named
 * "PhishSim AI <Tier>". We match on that prefix, which ALSO fences off the sibling product's
 * catalogue by construction. If lookup_key / metadata.tier are added later, we prefer them —
 * see resolveTier() — so this improves rather than breaks when the setup is tightened.
 */

import Stripe from 'stripe'

export type StripePlan = 'starter' | 'growth' | 'pro' | 'enterprise'
export type BillingInterval = 'monthly' | 'annual'

/** Product-name prefix that fences PhishSim's prices off from the shared account's other products. */
const PRODUCT_PREFIX = 'PhishSim AI'

/** Stripe's product name tier word -> our plan. 'unlimited' is the legacy alias for enterprise. */
const TIER_WORDS: Record<string, StripePlan> = {
  starter: 'starter',
  growth: 'growth',
  pro: 'pro',
  enterprise: 'enterprise',
  unlimited: 'enterprise',
}

export interface PhishSimPrice {
  priceId: string
  plan: StripePlan
  interval: BillingInterval
  unitAmount: number | null
  productName: string
}

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY ?? ''
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set — cannot read prices from Stripe')
  return new Stripe(key, { apiVersion: '2025-05-28.basil' as any })
}

/** Prefer explicit signals if the account ever gains them; fall back to the product name. */
function resolveTier(price: Stripe.Price, product: Stripe.Product | null): StripePlan | null {
  const lk = price.lookup_key?.toLowerCase().trim()
  if (lk && TIER_WORDS[lk]) return TIER_WORDS[lk]
  const metaTier = (price.metadata?.tier || product?.metadata?.tier)?.toLowerCase().trim()
  if (metaTier && TIER_WORDS[metaTier]) return TIER_WORDS[metaTier]
  const name = product?.name ?? ''
  if (!name.startsWith(PRODUCT_PREFIX)) return null // fences off sibling products
  const last = name.trim().split(/\s+/).pop()?.toLowerCase() ?? ''
  return TIER_WORDS[last] ?? null
}

let _cache: { at: number; prices: PhishSimPrice[] } | null = null
const CACHE_MS = 5 * 60_000

/**
 * Every ACTIVE PhishSim price, read live from Stripe. Cached briefly so a checkout burst does
 * not hammer the API, but never persisted — a stale env copy is the failure mode we are leaving.
 */
export async function loadPhishSimPrices(now = Date.now()): Promise<PhishSimPrice[]> {
  if (_cache && now - _cache.at < CACHE_MS) return _cache.prices
  const res = await stripe().prices.list({ active: true, limit: 100, expand: ['data.product'] })
  const out: PhishSimPrice[] = []
  for (const p of res.data) {
    const product = (p.product && typeof p.product === 'object' && !('deleted' in p.product)
      ? (p.product as Stripe.Product)
      : null)
    const plan = resolveTier(p, product)
    if (!plan) continue
    if (!p.recurring) continue // subscription prices only
    const interval: BillingInterval = p.recurring.interval === 'year' ? 'annual' : 'monthly'
    out.push({
      priceId: p.id,
      plan,
      interval,
      unitAmount: p.unit_amount,
      productName: product?.name ?? '(unknown)',
    })
  }
  _cache = { at: now, prices: out }
  return out
}

/** priceId -> plan. Replaces the env-driven buildPriceMap(); used by the Stripe webhook. */
export async function planForPriceId(priceId: string): Promise<StripePlan | null> {
  const prices = await loadPhishSimPrices()
  return prices.find((p) => p.priceId === priceId)?.plan ?? null
}

/** (plan, interval) -> priceId. Used by the /checkout magic-link route. */
export async function priceIdForPlan(
  plan: StripePlan,
  interval: BillingInterval,
): Promise<string | null> {
  const prices = await loadPhishSimPrices()
  return prices.find((p) => p.plan === plan && p.interval === interval)?.priceId ?? null
}
