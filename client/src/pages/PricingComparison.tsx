import { Seo } from "@/components/Seo";
import { seoForPath } from "@/lib/seoMeta";
import { Button } from "@/components/ui/button";
import { Shield, ArrowRight } from "lucide-react";

const TRIAL = "/trial?utm_source=seo&utm_medium=web&utm_campaign=pricing_comparison";

const PLANS = [
  { name: "Starter", price: "$149/mo", seats: "100 users", per: "$1.49/user", note: "First managed client" },
  { name: "Growth", price: "$299/mo", seats: "500 users", per: "60¢/user", note: "Most popular for MSPs" },
  { name: "Pro", price: "$749/mo", seats: "2,500 users", per: "30¢/user", note: "~20 client orgs" },
  { name: "Enterprise", price: "$1,499/mo", seats: "10,000 users", per: "15¢/user", note: "Unlimited orgs + white-label" },
];

/**
 * SEO landing for "KnowBe4 pricing" / "phishing training pricing comparison" intent.
 * Publishes only PhishSim public list prices; competitor figures stay directional.
 */
export default function PricingComparison() {
  const seo = seoForPath("/pricing-comparison");
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Seo title={seo.title} description={seo.description} path={seo.path} />
      <header className="border-b border-border/50">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-semibold">
            <Shield className="w-5 h-5 text-primary" /> PhishSim AI
          </a>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <a href="/knowbe4-alternative" className="hover:text-foreground">KnowBe4 alt</a>
            <a href="/pricing" className="hover:text-foreground">Full pricing</a>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-400 mb-3">Pricing comparison</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">
          PhishSim AI vs KnowBe4 pricing — transparent MSP math
        </h1>
        <p className="text-muted-foreground leading-relaxed mb-8">
          Enterprise awareness platforms usually quote per seat with annual contracts. PhishSim AI publishes
          flat monthly MSP tiers so you can price a client book without a sales call. Model both at your
          real seat count before you switch.
        </p>

        <h2 className="text-xl font-bold mb-3">PhishSim AI public list prices</h2>
        <div className="overflow-x-auto rounded-xl border border-border/60 mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-secondary/20">
                <th className="text-left p-3">Plan</th>
                <th className="text-left p-3">Monthly</th>
                <th className="text-left p-3">Seats</th>
                <th className="text-left p-3">Per user</th>
                <th className="text-left p-3">Fit</th>
              </tr>
            </thead>
            <tbody>
              {PLANS.map((p) => (
                <tr key={p.name} className="border-b border-border/40 last:border-0">
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3">{p.price}</td>
                  <td className="p-3">{p.seats}</td>
                  <td className="p-3">{p.per}</td>
                  <td className="p-3 text-muted-foreground">{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="text-xl font-bold mb-3">How this compares to KnowBe4-style pricing</h2>
        <div className="rounded-xl border border-border/60 p-5 mb-8 text-sm space-y-3 text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-foreground">KnowBe4</strong> is typically sold as quote-based per-seat
            licensing with enterprise packaging. Public third-party comparisons often cite roughly
            $20–40/user/year depending on tier and negotiation — a 2,000-user book can land as a five-figure
            annual line item before you add your own service margin.
          </p>
          <p>
            <strong className="text-foreground">PhishSim AI Growth</strong> covers 500 users at $299/mo
            (~$3,588/year, 60¢/user/mo). <strong className="text-foreground">Pro</strong> covers 2,500 users
            at $749/mo. You are not re-quoting every time a client adds headcount inside the plan ceiling.
          </p>
          <p className="text-xs">
            KnowBe4 figures above are directional from public competitor comparisons, not KnowBe4 quotes.
            Always verify current KnowBe4 pricing with their sales team.
          </p>
        </div>

        <h2 className="text-xl font-bold mb-3">Worked MSP examples</h2>
        <ul className="space-y-3 text-sm text-muted-foreground mb-10">
          <li className="rounded-xl border border-border/60 p-4">
            <strong className="text-foreground">5 clients × ~100 seats</strong> → Growth $299/mo. Sell a
            $5–15/user/mo awareness line and keep the spread.
          </li>
          <li className="rounded-xl border border-border/60 p-4">
            <strong className="text-foreground">20 clients × ~100–125 seats</strong> → Pro $749/mo for 2,500
            seats. Multi-tenant dashboard; margin grows as you add clients inside the ceiling.
          </li>
          <li className="rounded-xl border border-border/60 p-4">
            <strong className="text-foreground">Enterprise book / white-label</strong> → Enterprise $1,499/mo
            for 10,000 seats with custom branding and dedicated support.
          </li>
        </ul>

        <Button className="h-11 bg-violet-600 hover:bg-violet-500" onClick={() => { window.location.href = TRIAL; }}>
          Start 30-day free trial <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">No credit card. Cancel anytime. Full feature access on trial.</p>
        <p className="mt-6 text-xs text-muted-foreground">
          Related:{" "}
          <a className="underline hover:text-foreground" href="/knowbe4-alternative">KnowBe4 alternative</a>
          {" · "}
          <a className="underline hover:text-foreground" href="/pricing">Full feature matrix</a>
          {" · "}
          <a className="underline hover:text-foreground" href="/msp-phishing-training">MSP phishing training</a>
        </p>
      </main>
    </div>
  );
}
