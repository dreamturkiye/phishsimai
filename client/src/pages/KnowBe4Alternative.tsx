import { Seo } from "@/components/Seo";
import { seoForPath } from "@/lib/seoMeta";
import { Button } from "@/components/ui/button";
import { getLanding, trialHref, TRIAL_OFFER, CLUSTER_NAV } from "@/content/seoLandings";
import { Shield, Check, ArrowRight } from "lucide-react";

const TRIAL = "/trial?utm_source=seo&utm_medium=web&utm_campaign=knowbe4_alternative";

const ROWS: Array<{ label: string; us: string; them: string }> = [
  { label: "Best fit", us: "MSPs, IT teams, mid-market books", them: "Enterprise security orgs" },
  { label: "Time to first sim", us: "About 10 minutes, self-serve", them: "Onboarding / sales cycle" },
  { label: "Trial", us: "30 days, no credit card", them: "Usually a demo-gated eval" },
  { label: "Growth price", us: "$299/mo for 500 users (60¢ each)", them: "Enterprise SKUs, per-seat minimums" },
  { label: "MSP tenancy", us: "Multi-client from day one", them: "Built for a single enterprise tenant" },
];

/**
 * Cluster hub for KnowBe4-alternative intent. Competitor names stay off /pricing
 * (PS-PRICE-05). Trial CTAs are crawlable <a href> (PS-SEO-05).
 */
export default function KnowBe4Alternative() {
  const seo = seoForPath("/knowbe4-alternative");
  const landing = getLanding("/knowbe4-alternative");
  const trial = trialHref("knowbe4_alternative");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Seo title={seo.title} description={seo.description} path={seo.path} />
      <header className="border-b border-border/50">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-semibold">
            <Shield className="w-5 h-5 text-primary" /> PhishSim AI
          </a>
          <div className="flex items-center gap-4 text-sm">
            <a href="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</a>
            <a href="/blog" className="text-muted-foreground hover:text-foreground">Blog</a>
            <a href={TRIAL} className="text-violet-400 hover:text-violet-300 font-medium">Free trial</a>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-400 mb-3">KnowBe4 alternative</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">
          A KnowBe4 alternative for MSPs and small teams
        </h1>
        <p className="text-muted-foreground leading-relaxed mb-8">
          KnowBe4 is a capable enterprise platform. If you need its depth and have the budget, it is a
          defensible choice. If you are an MSP, a mid-market IT team, or a small company that needs
          simulations, training, and reportable logs without a procurement cycle, PhishSim AI is the
          leaner path: 60¢/user, $299/mo for 500 seats, 30-day trial, no credit card.
        </p>

        <Button asChild className="h-11 bg-violet-600 hover:bg-violet-500 mb-8">
          <a href={TRIAL}>
            Start 30-day free trial <ArrowRight className="w-4 h-4 ml-2" />
          </a>
        </Button>
        <p className="mb-8 -mt-5 text-xs text-muted-foreground">{TRIAL_OFFER}</p>

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

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3">The honest split</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            We are not claiming to out-feature KnowBe4. We are claiming a better fit for MSPs and
            teams that run the simulate → train → report loop themselves. No invented customer
            counts, no fabricated discount math, no invented KnowBe4 list price.
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              "First campaign is three clicks after you import a list",
              "Public pricing — Growth $299/mo covers 500 users",
              "Native multi-client tenancy for MSP books, including larger 500–10,000 seat practices",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                {t}
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3">Go deeper on the query you actually typed</h2>
          <ul className="space-y-2 text-sm">
            <li><a href="/knowbe4-vs" className="text-violet-400 hover:underline">KnowBe4 vs PhishSim AI</a> — side-by-side fit, tenancy, time-to-value.</li>
            <li><a href="/knowbe4-pricing" className="text-violet-400 hover:underline">KnowBe4 pricing</a> — why “cheaper than KnowBe4” is a seat-tax structure, not a fake invoice.</li>
            <li><a href="/knowbe4-for-msps" className="text-violet-400 hover:underline">KnowBe4 for MSPs</a> — multi-tenant books vs a single-enterprise SAT.</li>
            <li><a href="/phishing-training-for-msps" className="text-violet-400 hover:underline">Phishing training for MSPs</a> — packaging the service for larger client books.</li>
            <li><a href="/blog/knowbe4-alternative-small-teams-msps" className="text-violet-400 hover:underline">Long-form comparison</a> — the original honest write-up.</li>
          </ul>
        </section>

        {landing?.faq && (
          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-4">Frequently asked questions</h2>
            <dl className="space-y-5">
              {landing.faq.map((f) => (
                <div key={f.q}>
                  <dt className="font-medium mb-1">{f.q}</dt>
                  <dd className="text-sm text-muted-foreground leading-relaxed">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <Button asChild className="h-11 bg-violet-600 hover:bg-violet-500">
          <a href={trial}>
            Start 30-day free trial <ArrowRight className="w-4 h-4 ml-2" />
          </a>
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">Full access. No card. 60¢/user · $299/500 seats.</p>

        <nav aria-label="Cluster" className="mt-10 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground mb-2">More on this topic</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {CLUSTER_NAV.filter((l) => l.href !== "/knowbe4-alternative").map((l) => (
              <li key={l.href}><a href={l.href} className="hover:text-foreground underline-offset-2 hover:underline">{l.label}</a></li>
            ))}
          </ul>
        </nav>
      </main>
    </div>
  );
}
