import { Seo } from "@/components/Seo";
import { seoForPath } from "@/lib/seoMeta";
import { Button } from "@/components/ui/button";
import { Shield, Check, ArrowRight } from "lucide-react";

const TRIAL = "/trial?utm_source=seo&utm_medium=web&utm_campaign=knowbe4_alternative";

const ROWS: Array<{ label: string; us: string; them: string }> = [
  { label: "Best fit", us: "MSPs and mid-market teams running many clients", them: "Enterprise security orgs with a dedicated SAT owner" },
  { label: "Time to first sim", us: "About 10 minutes, self-serve", them: "Demo / onboarding / sales cycle" },
  { label: "Trial", us: "30 days, no credit card", them: "Usually a demo-gated evaluation" },
  { label: "Growth price", us: "$299/mo for 500 users (60¢ each)", them: "Enterprise SKUs, per-seat minimums, quote-based" },
  { label: "MSP tenancy", us: "Multi-client dashboard from day one", them: "Built primarily for a single enterprise tenant" },
  { label: "White-label", us: "Logo, colors, custom domain on Pro+", them: "Partner / higher-tier packaging" },
  { label: "Compliance evidence", us: "HIPAA, GLBA, CMMC, NY DFS, SOC 2 packs", them: "Broad library + mature reporting suite" },
  { label: "Content library depth", us: "AI templates + focused training modules", them: "Largest ready-made library in the category" },
  { label: "PSA ticketing", us: "ConnectWise Manage & Halo (real reports only)", them: "Broad enterprise integrations" },
];

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Is PhishSim AI a full KnowBe4 replacement?",
    a: "For MSPs and smaller teams that need simulations, training, and audit-ready logs — yes, that is the job we are built for. If you need KnowBe4's deepest content catalog and enterprise program tooling, keep KnowBe4.",
  },
  {
    q: "How does pricing compare for a 500-seat book?",
    a: "PhishSim AI Growth is $299/mo for 500 users (60¢ each), month-to-month, 30-day trial with no card. KnowBe4 is typically quote-based per seat with enterprise minimums — model both at your real seat count before you switch.",
  },
  {
    q: "Can MSPs white-label PhishSim AI for clients?",
    a: "Yes. Pro and Enterprise include multi-tenant management and branding so clients see your brand, not ours. Provision a new client org in under a minute.",
  },
  {
    q: "Will this satisfy cyber-insurance phishing questions?",
    a: "PhishSim AI generates timestamped campaign history, click-rate trends, training completion, and an attestation page aimed at carrier supplemental questionnaires (Coalition, At-Bay, Travelers, Chubb, Beazley are the ones we designed the pack around).",
  },
];

/**
 * Public SEO comparison for "KnowBe4 alternative" SERP intent.
 * Competitor names stay off the pricing page (PS-PRICE-05); this route is the honest landing.
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
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <a href="/pricing-comparison" className="hover:text-foreground">Pricing comparison</a>
            <a href="/msp-phishing-training" className="hover:text-foreground">MSP training</a>
            <a href="/pricing" className="hover:text-foreground">Pricing</a>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-400 mb-3">KnowBe4 alternative</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">
          KnowBe4 vs PhishSim AI — the MSP-fit alternative
        </h1>
        <p className="text-muted-foreground leading-relaxed mb-6">
          KnowBe4 is a capable enterprise security-awareness platform. If you need its library depth and
          have the budget and headcount, it is a defensible choice. If you are an MSP or mid-market team
          that needs phishing simulations, training, and reportable logs without a procurement cycle,
          PhishSim AI is the leaner path: 60¢/user, $299/mo for 500 seats, 30-day trial, no credit card.
        </p>

        <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 mb-8 text-sm">
          <strong className="text-foreground">Larger-company ICP via search:</strong>{" "}
          <span className="text-muted-foreground">
            Built for MSPs and IT teams running 100–10,000 seats across multiple client orgs — not a
            single-tenant enterprise suite dressed up for partners.
          </span>
        </div>

        <h2 className="text-xl font-bold mb-3">Side-by-side comparison</h2>
        <div className="overflow-x-auto rounded-xl border border-border/60 mb-10">
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

        <h2 className="text-xl font-bold mb-3">When to pick each</h2>
        <div className="grid md:grid-cols-2 gap-4 mb-10 text-sm">
          <div className="rounded-xl border border-border/60 p-4">
            <p className="font-semibold mb-2">Pick KnowBe4 if</p>
            <ul className="space-y-2 text-muted-foreground">
              <li>• You have a dedicated SecOps / SAT owner</li>
              <li>• You need the largest ready-made content catalog</li>
              <li>• You are buying for one large enterprise tenant</li>
              <li>• Budget is measured in $/user/year with enterprise procurement</li>
            </ul>
          </div>
          <div className="rounded-xl border border-violet-500/40 bg-violet-500/5 p-4">
            <p className="font-semibold mb-2">Pick PhishSim AI if</p>
            <ul className="space-y-2 text-muted-foreground">
              <li>• You are an MSP / MSSP billing downstream</li>
              <li>• You want transparent MSP pricing that protects margin</li>
              <li>• You need multi-tenant + white-label from day one</li>
              <li>• You want live in ~10 minutes, not a three-week onboarding</li>
            </ul>
          </div>
        </div>

        <h2 className="text-xl font-bold mb-3">What you get on day one</h2>
        <ul className="space-y-2 text-sm text-muted-foreground mb-10">
          {[
            "AI phishing templates plus department targeting (Finance, HR, Ops, custom)",
            "Auto-enroll clickers into short training modules",
            "Compliance certificates for HIPAA, GLBA, CMMC, NY DFS, SOC 2, and more",
            "MSP portal: provision clients, consolidated reporting, optional PSA tickets for real reports",
            "No invented customer counts or savings claims — price and fit only",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              {t}
            </li>
          ))}
        </ul>

        <h2 className="text-xl font-bold mb-3">FAQ</h2>
        <div className="space-y-4 mb-10">
          {FAQS.map((f) => (
            <div key={f.q} className="rounded-xl border border-border/60 p-4">
              <p className="font-semibold mb-1">{f.q}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <Button className="h-11 bg-violet-600 hover:bg-violet-500" onClick={() => { window.location.href = TRIAL; }}>
            Start 30-day free trial <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <a href="/pricing-comparison" className="text-sm text-violet-400 hover:underline">
            See KnowBe4 pricing comparison →
          </a>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Full access. No card. 60¢/user · $299/500 seats.</p>
        <p className="mt-6 text-xs text-muted-foreground">
          Related:{" "}
          <a className="underline hover:text-foreground" href="/blog/knowbe4-alternative-small-teams-msps">
            Honest KnowBe4 alternative guide
          </a>
          {" · "}
          <a className="underline hover:text-foreground" href="/msp-phishing-training">
            MSP phishing training
          </a>
        </p>
      </main>
    </div>
  );
}
