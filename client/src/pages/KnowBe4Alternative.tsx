import { Seo } from "@/components/Seo";
import { SeoTrialHeader } from "@/components/SeoTrialChrome";
import { KNOWBE4_FAQ, seoForPath } from "@/lib/seoMeta";
import { getTrialUrl } from "@/const";
import { Check, ArrowRight } from "lucide-react";

const TRIAL = getTrialUrl({ campaign: "knowbe4_alternative" });

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
      <SeoTrialHeader campaign="knowbe4_alternative" />
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

        <a
          href={TRIAL}
          className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-md bg-violet-600 hover:bg-violet-500 text-primary-foreground text-sm font-medium"
        >
          Start 30-day free trial <ArrowRight className="w-4 h-4" />
        </a>
        <p className="mt-3 text-xs text-muted-foreground">Full access. No card. 60¢/user · $299/500 seats.</p>

        <section className="mt-14">
          <h2 className="text-xl font-bold mb-4">KnowBe4 alternative FAQ</h2>
          <dl className="space-y-4">
            {KNOWBE4_FAQ.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold">{f.q}</dt>
                <dd className="text-sm text-muted-foreground mt-1 leading-relaxed">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <nav className="mt-14" aria-label="Related phishing training guides">
          <h2 className="text-xl font-bold mb-3">Related phishing training guides</h2>
          <ul className="space-y-2 text-sm">
            <li>
              <a className="text-violet-300 hover:underline" href="/blog/knowbe4-alternative-small-teams-msps">
                Honest KnowBe4 alternative comparison for small teams and MSPs
              </a>
            </li>
            <li>
              <a className="text-violet-300 hover:underline" href="/blog/hipaa-phishing-simulation-healthcare-msp-2026">
                Phishing training for HIPAA compliance
              </a>
            </li>
            <li>
              <a className="text-violet-300 hover:underline" href="/blog/cyber-insurance-phishing-simulation-requirement-2026">
                Does cyber insurance require phishing simulations?
              </a>
            </li>
            <li>
              <a className="text-violet-300 hover:underline" href="/blog/allowlist-phishing-simulation-microsoft-365">
                Allowlist phishing simulations in Microsoft 365
              </a>
            </li>
          </ul>
        </nav>
      </main>
    </div>
  );
}
