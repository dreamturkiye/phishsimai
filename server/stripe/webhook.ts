import type { Express } from "express";
import express from "express";
import { updateOrgStripeSubscription } from "../db";
import { linkStripeCustomerToLead } from "../os/crmLink";
import { planForPriceId } from "./prices";

type StripePlan = "free" | "starter" | "growth" | "pro" | "unlimited" | "enterprise";

/**
 * PS-STRIPE-PRICEMAP-01: the price->plan lookup now reads Stripe (server/stripe/prices.ts),
 * not env var names.
 *
 * The old buildPriceMap() built the map from STRIPE_*_PRICE_ID env vars. In production NONE of
 * those names were set (Vercel had STRIPE_PRICE_STARTER etc.), so the map resolved exactly one
 * entry -- STRIPE_PRICE_PRO -- and that value was a price from a DIFFERENT Stripe account. Every
 * real purchase missed the map and 400'd. Env names were the thing that drifted, so we stopped
 * trusting them: planForPriceId() matches priceId against the live Stripe account, which
 * memory.ts:72 already names as the source of truth.
 */

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

        if (event.type === "checkout.session.completed") {
          const session = event.data.object as {
            metadata?: { org_id?: string; price_id?: string; lead_id?: string; plan?: string };
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
          // PS-STRIPE-PRICEMAP-01: resolve against the live Stripe account, not env. A miss here
          // means the price is inactive or its product is not named "PhishSim AI *" (e.g. it
          // belongs to a sibling product in the shared account). Still FAIL LOUD, NEVER GUESS.
          const plan = await planForPriceId(priceId);
          if (!plan) {
            console.error(
              `[Webhook] PS-STRIPE-PRICEMAP-01: price "${priceId}" did not resolve to a PhishSim plan ` +
                `for org ${orgId ?? "?"} / lead ${session.metadata?.lead_id ?? "?"} — REFUSING to guess. ` +
                `The price must be ACTIVE and its Stripe product named "PhishSim AI <Tier>". ` +
                `The customer HAS been charged and is NOT activated. Fix the product/price in Stripe and replay this event.`,
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
          } else if (session.metadata?.lead_id) {
            // PS-CHECKOUT-PROVISION-01: a cold-email magic-link purchase has NO org yet — the
            // payer is a lead who never had an account. The charge succeeded and the plan
            // resolved, but there is nothing to activate. This is a real provisioning gap, not
            // an error to swallow: fail LOUD so a paid customer is never left dark. The CRM link
            // below still records the payment against the lead; org creation is a product
            // decision, filed separately.
            console.error(
              `[Webhook] PS-CHECKOUT-PROVISION-01: lead ${session.metadata.lead_id} PAID (${plan}, ` +
                `sub ${stripeSubscriptionId || "?"}) but has NO org to activate. Customer is charged and NOT ` +
                `provisioned. Create an org for this lead and attach the subscription.`,
            );
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
