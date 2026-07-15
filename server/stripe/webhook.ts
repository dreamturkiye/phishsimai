import type { Express } from "express";
import express from "express";
import { updateOrgStripeSubscription } from "../db";
import { linkStripeCustomerToLead } from "../os/crmLink";

type StripePlan = "free" | "starter" | "growth" | "pro" | "unlimited" | "enterprise";

function buildPriceMap(): Record<string, StripePlan> {
  return {
    [process.env.STRIPE_STARTER_PRICE_ID ?? "starter_id"]: "starter",
    [process.env.STRIPE_GROWTH_PRICE_ID ?? "growth_id"]: "growth",
    [process.env.STRIPE_PRO_PRICE_ID ?? "pro_id"]: "pro",
    [process.env.STRIPE_UNLIMITED_PRICE_ID ?? "unlimited_id"]: "unlimited",
    [process.env.STRIPE_STARTER_MONTHLY_PRICE_ID ?? "starter_monthly"]: "starter",
    [process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID ?? "growth_monthly"]: "growth",
    [process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "pro_monthly"]: "pro",
    [process.env.STRIPE_UNLIMITED_MONTHLY_PRICE_ID ?? "unlimited_monthly"]: "unlimited",
    [process.env.STRIPE_STARTER_ANNUAL_PRICE_ID ?? "starter_annual"]: "starter",
    [process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID ?? "growth_annual"]: "growth",
    [process.env.STRIPE_PRO_ANNUAL_PRICE_ID ?? "pro_annual"]: "pro",
    [process.env.STRIPE_UNLIMITED_ANNUAL_PRICE_ID ?? "unlimited_annual"]: "unlimited",
    [process.env.STRIPE_PRICE_BASIC ?? "basic_id"]: "starter",
    [process.env.STRIPE_PRICE_PRO ?? "legacy_pro_id"]: "pro",
  };
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
          const plan = priceMap[priceId] ?? "starter";

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
