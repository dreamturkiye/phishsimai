import { Seo } from "@/components/Seo";
import { seoForPath } from "@/lib/seoMeta";
import { Button } from "@/components/ui/button";
import { Shield, Check, ArrowRight } from "lucide-react";

const TRIAL = "/trial?utm_source=seo&utm_medium=web&utm_campaign=knowbe4_alternative";

const ROWS: Array<{ label: string; us: string; them: string }> = [
  { label: "Best fit", us: "MSPs and small teams", them: "Enterprise security orgs" },
  { label: "Time to first sim", us: "About 10 minutes, self-serve", them: "Onboarding / sales cycle" },
  { label: "Trial", us: "30 days, no credit card", them: "Usually a demo-gated eval" },
  { label: "Growth price", us: "$299/mo for 500 users (60¢ each)", them: "Enterprise SKUs, per-seat minimums" },
  { label: "MSP tenancy", us: "Multi-client from day one", them: "Built for a single enterprise tenant" },
];

/**
 * Lightweight public SEO comparison. Competitor names stay off the pricing page
 * (PS-PRICE-05); this dedicated route is the honest KnowBe4-alternative landing
 * and CTAs to /trial with the live frozen offer.
 */
export default function KnowBe4Alternative() {
  const seo = seoForPath("/knowbe4-alternative");
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Seo title={seo.title} description={seo.description} path={seo.path} />
      <header className="border-b border-border/50">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-semibold">
            <Shield className="w-5 h-5 text-primary" /> PhishSim AI
          </a>
          <a href="/pricing" className="text-sm text-muted-foreground hover:text-foreground">Pricing</a>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-400 mb-3">KnowBe4 alternative</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">
          A KnowBe4 alternative for MSPs and small teams
        </h1>
        <p className="text-muted-foreground leading-relaxed mb-8">
          KnowBe4 is a capable enterprise platform. If you need its depth and have the budget, it is a
          defensible choice. If you are an MSP or a small team that needs simulations, training, and
          reportable logs without a procurement cycle, PhishSim AI is the leaner path: 60¢/user,
          $299/mo for 500 seats, 30-day trial, no credit card.
        </p>

        <div className="overflow-x-auto rounded-xl border border-border/60 mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-secondary/20">
                <th className="text-left p-3 font-semibold"> </th>
                <th className="text-left p-3 font-semibold">PhishSim AI</th>
                <th className="text-left p-3 font-semibold text-muted-foreground">KnowBe4</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label} className="border-b border-border/40 last:border-0">
                  <td className="p-3 font-medium">{r.label}</td>
                  <td className="p-3">{r.us}</td>
                  <td className="p-3 text-muted-foreground">{r.them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="space-y-2 text-sm text-muted-foreground mb-8">
          {[
            "No invented customer counts or savings claims",
            "First campaign is three clicks after you import a list",
            "We are not claiming to out-feature KnowBe4 — we are claiming a better fit for this tier",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              {t}
            </li>
          ))}
        </ul>

        <Button className="h-11 bg-violet-600 hover:bg-violet-500" onClick={() => { window.location.href = TRIAL; }}>
          Start 30-day free trial <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">Full access. No card. 60¢/user · $299/500 seats.</p>
      </main>
    </div>
  );
}
