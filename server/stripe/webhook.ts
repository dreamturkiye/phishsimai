import type { Express } from "express";
import express from "express";
import { updateOrgStripeSubscription } from "../db";
import { linkStripeCustomerToLead } from "../os/crmLink";

type StripePlan = "free" | "starter" | "growth" | "pro" | "unlimited" | "enterprise";

/**
 * PS-BILL-01: build the price->plan map from ONLY the env vars that are actually set.
 *
 * This used to write `[process.env.X ?? "starter_id"]: "starter"` -- so an unset var did not
 * vanish, it inserted a junk key literally named "starter_id". The map looked populated while
 * being blind, which is how a lookup miss became invisible.
 *
 * ENTERPRISE WAS MISSING ENTIRELY. The map knew starter/growth/pro/unlimited; the UI sells
 * "Enterprise" ($1,499, price_1Tnerh...). An Enterprise purchase therefore fell through to the
 * `?? "starter"` default and the customer paid $1,499 for 1 client org and 25 users. Both
 * names are now accepted: Stripe's product is called Enterprise, the code's StripePlan type
 * has carried 'unlimited' since before the rename.
 */
function buildPriceMap(): Record<string, StripePlan> {
  const pairs: Array<[string | undefined, StripePlan]> = [
    [process.env.STRIPE_STARTER_PRICE_ID, "starter"],
    [process.env.STRIPE_STARTER_MONTHLY_PRICE_ID, "starter"],
    [process.env.STRIPE_STARTER_ANNUAL_PRICE_ID, "starter"],
    [process.env.STRIPE_GROWTH_PRICE_ID, "growth"],
    [process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID, "growth"],
    [process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID, "growth"],
    [process.env.STRIPE_PRO_PRICE_ID, "pro"],
    [process.env.STRIPE_PRO_MONTHLY_PRICE_ID, "pro"],
    [process.env.STRIPE_PRO_ANNUAL_PRICE_ID, "pro"],
    // Enterprise == Unlimited. Stripe names it Enterprise; the type predates the rename.
    [process.env.STRIPE_ENTERPRISE_PRICE_ID, "enterprise"],
    [process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID, "enterprise"],
    [process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID, "enterprise"],
    [process.env.STRIPE_UNLIMITED_PRICE_ID, "enterprise"],
    [process.env.STRIPE_UNLIMITED_MONTHLY_PRICE_ID, "enterprise"],
    [process.env.STRIPE_UNLIMITED_ANNUAL_PRICE_ID, "enterprise"],
    // legacy
    [process.env.STRIPE_PRICE_BASIC, "starter"],
    [process.env.STRIPE_PRICE_PRO, "pro"],
  ];
  const map: Record<string, StripePlan> = {};
  for (const [id, plan] of pairs) {
    const key = id?.trim();
    if (key) map[key] = plan;
  }
  if (Object.keys(map).length === 0) {
    console.error("[Webhook] PS-BILL-01: price map is EMPTY — no STRIPE_*_PRICE_ID env vars are set. Every purchase will be rejected until they are.");
  }
  return map;
}

/** Stripe webhook — must be registered before express.json(). */
export function registerStripeWebhook(app: Express): void {
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      try {
        const sig = req.headers["stripe-signature"];
        const { default: Stripe } = await import("stripe");
        // apiVersion was pinned to "2025-05-28.basil" and cast to a type
        // (Stripe.LatestApiVersion) that stripe@22 does not export — the cast never
        // typechecked. The pin was also inert: this client is used ONLY for
        // webhooks.constructEvent, which verifies an HMAC over the raw body and
        // issues no API request, so apiVersion cannot affect it. (The payload shape
        // is set by the webhook's version in the Stripe dashboard, not here.)
        // Dropped rather than bumped — bumping a Stripe API version is a real
        // behaviour change and is not this commit's business.
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
        const event = stripe.webhooks.constructEvent(
          req.body,
          sig as string,
          process.env.STRIPE_WEBHOOK_SECRET ?? ""
        );

        if (event.id.startsWith("evt_test_")) {
          console.log("[Webhook] Test event detected, returning verification response");
          return res.json({ verified: true });
        }

        const priceMap = buildPriceMap();

        if (event.type === "checkout.session.completed") {
          const session = event.data.object as {
            metadata?: { org_id?: string; price_id?: string };
            subscription?: string | null;
            customer?: string | null;
            customer_details?: { email?: string | null } | null;
            customer_email?: string | null;
          };
          const orgId = session.metadata?.org_id;
          const priceId = session.metadata?.price_id ?? "";
          const stripeSubscriptionId = session.subscription ?? "";
          const stripeCustomerId = session.customer ?? "";
          // PS-BILL-01: FAIL LOUD, NEVER GUESS. This read `?? "starter"` -- an unknown price
          // silently granted the CHEAPEST plan, so a $1,499 Enterprise customer received 25
          // seats and nobody found out. A billing path that guesses is worse than one that
          // stops: a customer with no access emails you within minutes, a customer with the
          // wrong access never does.
          //
          // Returning 400 makes Stripe retry and surfaces the failure in their dashboard.
          // The charge already succeeded, so this is deliberately noisy: we would rather owe
          // a customer an apology and an activation than quietly under-provision them.
          const plan = priceMap[priceId];
          if (!plan) {
            console.error(
              `[Webhook] PS-BILL-01: UNKNOWN PRICE ID "${priceId}" for org ${orgId ?? "?"} — REFUSING to guess a plan. ` +
                `Known price IDs: ${Object.keys(priceMap).join(", ") || "NONE"}. ` +
                `The customer HAS been charged and is NOT activated. Add the price ID to the STRIPE_*_PRICE_ID env and replay this event from the Stripe dashboard.`,
            );
            return res.status(400).json({ error: "unknown_price_id", priceId });
          }

          if (orgId) {
            await updateOrgStripeSubscription(parseInt(orgId, 10), {
              stripeCustomerId,
              stripeSubscriptionId,
              stripePriceId: priceId,
              plan,
              planActivatedAt: new Date(),
            });
            console.log(`[Webhook] Activated plan '${plan}' for org ${orgId}`);
          }

          // PS-CRM-01: close the attribution loop.
          //
          // Billing knew org_id. The CRM (ps_outreach_leads) knows email. NOTHING translated
          // between them, so a lead we cold-emailed could sign up and pay and their row would
          // still read 'prospect' forever. routes.ts queried pipeline_stage='customer' -- a
          // value no code path has ever written. That is a dashboard reporting a state that
          // cannot exist.
          //
          // Best-effort by design: a failure here must NEVER fail the webhook. Stripe retries
          // on non-2xx, and a retry would re-run the org activation. Billing is the source of
          // truth; the CRM link is bookkeeping. Idempotent via customer_at IS NULL.
          const paidEmail = session.customer_details?.email ?? session.customer_email ?? null;
          if (paidEmail) {
            try {
              const linked = await linkStripeCustomerToLead(paidEmail, {
                stripeCustomerId,
                stripeSubscriptionId,
                tier: plan,
              });
              if (linked) {
                console.log(`[Webhook] CRM: ${paidEmail} lead -> customer (attributed to outreach)`);
              } else {
                // Not an error: organic signup, never cold-emailed. Worth seeing, not fixing.
                console.log(`[Webhook] CRM: ${paidEmail} paid but matches no lead (organic)`);
              }
            } catch (e) {
              console.error("[Webhook] CRM link failed (billing unaffected):", e);
            }
          } else {
            console.error("[Webhook] CRM: no payer email on session -- cannot attribute this customer");
          }
        } else if (event.type === "customer.subscription.deleted") {
          const sub = event.data.object as { metadata?: { org_id?: string } };
          const orgId = sub.metadata?.org_id;
          if (orgId) {
            await updateOrgStripeSubscription(parseInt(orgId, 10), {
              plan: "free",
              stripeSubscriptionId: "",
            });
            console.log(`[Webhook] Reverted org ${orgId} to free plan`);
          }
        }

        return res.json({ received: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown";
        console.error("[Webhook] Error:", message);
        return res.status(400).send(`Webhook error: ${message}`);
      }
    }
  );
}
