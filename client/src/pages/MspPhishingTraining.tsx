import { Seo } from "@/components/Seo";
import { seoForPath } from "@/lib/seoMeta";
import { Button } from "@/components/ui/button";
import { Shield, Check, ArrowRight } from "lucide-react";

const TRIAL = "/trial?utm_source=seo&utm_medium=web&utm_campaign=msp_phishing_training";

const FEATURES = [
  "Multi-tenant MSP portal — isolate every client org",
  "White-label branding (logo, colors, custom domain on Pro+)",
  "AI phishing simulations + department targeting",
  "Auto-enroll clickers into short training modules",
  "Compliance packs: HIPAA, GLBA, CMMC, NY DFS, SOC 2",
  "Cyber-insurance evidence PDF for carrier renewals",
  "PSA ticketing for ConnectWise Manage & Halo (real reports only)",
  "Flat MSP pricing from $149/mo — not per-seat chaos across tenants",
];

/**
 * SEO landing for "MSP phishing training" / "phishing awareness training MSP" intent.
 */
export default function MspPhishingTraining() {
  const seo = seoForPath("/msp-phishing-training");
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
            <a href="/pricing" className="hover:text-foreground">Pricing</a>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-400 mb-3">MSP phishing training</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">
          Phishing awareness training built for MSPs
        </h1>
        <p className="text-muted-foreground leading-relaxed mb-6">
          Enterprise SAT tools assume one tenant and one security team. MSPs need the opposite: many
          clients, white-label delivery, predictable cost, and evidence packs clients (and their
          insurers) will actually accept. PhishSim AI is phishing simulation + security awareness
          training shaped for that book of business.
        </p>

        <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 mb-8 text-sm text-muted-foreground">
          <strong className="text-foreground">Ideal ICP:</strong> MSPs and IT providers managing
          100–10,000 seats across healthcare, finance, professional services, and defense-adjacent
          clients who ask for HIPAA / GLBA / CMMC / cyber-insurance proof.
        </div>

        <h2 className="text-xl font-bold mb-3">What MSPs run on PhishSim AI</h2>
        <ul className="space-y-2 text-sm text-muted-foreground mb-10">
          {FEATURES.map((t) => (
            <li key={t} className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              {t}
            </li>
          ))}
        </ul>

        <h2 className="text-xl font-bold mb-3">How a client goes live</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground mb-10">
          <li>Sign up — 30-day trial, no credit card</li>
          <li>Import a CSV (or add users) and organize by department</li>
          <li>Launch an AI campaign; schedule recurring sims with target rotation</li>
          <li>Auto-train clickers; export compliance / insurance evidence when asked</li>
        </ol>

        <h2 className="text-xl font-bold mb-3">Why MSPs leave per-seat enterprise SAT</h2>
        <div className="space-y-3 text-sm text-muted-foreground mb-10">
          <p className="rounded-xl border border-border/60 p-4">
            <strong className="text-foreground">Margin math breaks.</strong> Per-seat quotes across every
            tenant make fixed-fee MSP packages painful. Flat tiers ($299 for 500, $749 for 2,500) keep
            the spreadsheet honest.
          </p>
          <p className="rounded-xl border border-border/60 p-4">
            <strong className="text-foreground">Onboarding is too slow.</strong> Clients expect a program
            this month. PhishSim AI targets first simulation in about 10 minutes after CSV import.
          </p>
          <p className="rounded-xl border border-border/60 p-4">
            <strong className="text-foreground">Single-tenant UX fights the MSP shape.</strong> Multi-client
            isolation and white-label are first-class here, not a partner afterthought.
          </p>
        </div>

        <Button className="h-11 bg-violet-600 hover:bg-violet-500" onClick={() => { window.location.href = TRIAL; }}>
          Start MSP trial <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">60¢/user · $299/500 seats · live in 10 min.</p>
        <p className="mt-6 text-xs text-muted-foreground">
          Related:{" "}
          <a className="underline hover:text-foreground" href="/knowbe4-alternative">KnowBe4 alternative for MSPs</a>
          {" · "}
          <a className="underline hover:text-foreground" href="/pricing-comparison">Pricing comparison</a>
          {" · "}
          <a className="underline hover:text-foreground" href="/blog/hipaa-phishing-simulation-healthcare-msp-2026">
            HIPAA phishing for healthcare MSPs
          </a>
        </p>
      </main>
    </div>
  );
}
