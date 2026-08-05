import { useState } from "react";
import { useLocation } from "wouter";
import { Seo } from "@/components/Seo";
import { seoForPath } from "@/lib/seoMeta";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getLoginUrl, getSignupUrl } from "@/const";
import {
  Shield, Zap, BarChart3, Building2, CheckCircle2,
  ChevronRight, Globe, Mail, Phone, FileText, Award, Target,
  ArrowRight, X, Check, BookOpen, Menu, Ticket, Users,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
//  MSP/MSSP-facing homepage. Audience = MSP owner, vCIO, service-desk lead, security
//  practice lead — not a single end-company. Every claim below maps to a feature verified
//  as built, on, and functional (pre-homepage verification).
//
//  HONESTY GUARDS PRESERVED (do not reintroduce):
//   • No fabricated testimonials / customer counts (PS-NOFAKE-01) — 0 paying customers.
//   • No "cancel anytime" — there is no Stripe billing-portal config live, so a customer
//     cannot self-cancel in-product yet. Restore only once the portal exists.
//   • No custom-domain white-label — that field is stored but not served (deferred).
//   • CW/Halo: "available … when connected and mapped", never "live-verified".
//   • Template library is ~100 curated built-ins, NOT "unlimited AI-generated".
// ─────────────────────────────────────────────────────────────────────────────

// The MSP-weighted feature grid. Order = buyer priority.
const FEATURES = [
  { icon: Building2, title: "Set-and-forget, multi-client", description: "Run every client from one multi-tenant console. Provision a customer org in under a minute and send the first simulation the same afternoon — no onboarding call, no implementation project.", color: "text-indigo-400", bg: "bg-indigo-500/10" },
  { icon: BookOpen, title: "Learning Moments on click", description: "The moment a user clicks a simulated lure, they get a short micro-lesson tied to that exact attack — the specific red flags they missed. Reviewing it can count toward their training record.", color: "text-amber-400", bg: "bg-amber-500/10" },
  { icon: Shield, title: "Report Phish without ticket noise", description: "Give your clients' staff a one-click way to report suspicious mail. Simulation reports are scored only and never open a ticket, so the service desk sees real threats, not training noise. (Outlook add-in available; deployed by the client's Microsoft 365 admin.)", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { icon: Ticket, title: "ConnectWise Manage & Halo PSA", description: "ConnectWise Manage and Halo PSA integrations are available: reported real phishing can open a ticket in your PSA — when connected and mapped — while simulation reports are scored only and do not create tickets.", color: "text-sky-400", bg: "bg-sky-500/10" },
  { icon: Mail, title: "Allowlist wizard", description: "A guided wizard walks each client's admin through inbox allowlisting before the first campaign, so simulations land in the inbox instead of the spam folder.", color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { icon: Zap, title: "Auto-remediation", description: "When an employee fails a simulation, PhishSim automatically enrolls them in the training module that matches the attack they fell for — no manual follow-up.", color: "text-violet-400", bg: "bg-violet-500/10" },
  { icon: BarChart3, title: "Human Risk Score for QBRs", description: "One QBR-ready risk number per client, built from real behavior. When the data is still thin, it says so honestly instead of inventing a score.", color: "text-rose-400", bg: "bg-rose-500/10" },
  { icon: FileText, title: "Insurance evidence pack", description: "Generate a carrier-style evidence PDF for cyber-insurance renewals — campaign history, click-rate trends, and training records — white-labeled under your MSP brand.", color: "text-teal-400", bg: "bg-teal-500/10" },
];

// "Built for the MSP desk" strip — 4 outcomes, no hype.
const MSP_STRIP = [
  { icon: Building2, text: "Run every client from one multi-tenant console" },
  { icon: Ticket, text: "Real reports can ticket to ConnectWise & Halo — simulations never flood the board" },
  { icon: FileText, text: "QBR risk scores and insurance evidence under your brand" },
  { icon: BarChart3, text: "Flat MSP pricing, so margin grows with every seat" },
];

// How it works — 4 steps, one sentence each.
const HOW = [
  { n: "01", icon: Mail, title: "Add a client org & allowlist", desc: "Provision a client in the portal and run the guided allowlist wizard so simulations reach the inbox." },
  { n: "02", icon: Target, title: "Launch realistic simulations", desc: "Send from a library of ~100 realistic templates, scheduled with automatic target rotation." },
  { n: "03", icon: BookOpen, title: "Learning Moments + auto-remediation", desc: "Anyone who clicks gets a per-lure micro-lesson and is auto-enrolled in the matching training." },
  { n: "04", icon: Award, title: "Report risk & evidence to the client", desc: "Hand over a QBR-ready Human Risk Score and a white-label cyber-insurance evidence pack." },
];

// Compliance proof — compact chips, no wall of CFR text. Specific citations live in-app.
const FRAMEWORK_CHIPS = ["HIPAA", "GLBA", "NERC CIP", "CMMC / DFARS", "NY DFS Part 500", "SOC 2", "PCI DSS v4.0", "NIST CSF"];

const PLANS = [
  // PS-PRICE-05: prices are Stripe's and unchanged ($149/$299/$749/$1499). SEATS are the founder
  // matrix of 2026-07-16: 100/500/2500/10000. perUser is DERIVED (price / seats), never typed.
  { name: "Starter", price: "$149", period: "/mo", perUser: "$1.49/user", description: "Your first managed client, live this afternoon.", features: ["1 client organization", "100 users", "100 phishing simulations/mo", "Basic training modules", "Basic compliance reporting", "Email support"], cta: "Start Free Trial", highlight: false },
  { name: "Growth", price: "$299", period: "/mo", perUser: "$0.60/user", description: "Five clients, one dashboard, zero spreadsheets.", features: ["5 client organizations", "500 users", "500 phishing simulations/mo", "Standard training modules", "Full compliance reporting", "Risk scoring & analytics", "Multi-framework (NIST, ISO)"], cta: "Start Free Trial", highlight: true, badge: "Most Popular" },
  { name: "Pro", price: "$749", period: "/mo", perUser: "$0.30/user", description: "Run 20 clients without adding headcount.", features: ["20 client organizations", "2,500 users", "Unlimited simulations", "Advanced training + risk scoring", "ConnectWise & Halo PSA ticketing", "MSP multi-tenant dashboard", "Custom branding + API access", "Chat + email support"], cta: "Start Free Trial", highlight: false },
  { name: "Enterprise", price: "$1,499", period: "/mo", perUser: "$0.15/user", description: "Ten thousand seats, under your own brand.", features: ["Unlimited client organizations", "10,000 users", "All + custom training modules", "White-label compliance reporting", "Enterprise risk scoring", "Custom frameworks", "Dedicated account manager", "24/7 phone + chat support"], cta: "Contact Sales", highlight: false },
];

const FEATURE_MATRIX = [
  { feature: "Phishing simulations", starter: "100/mo", growth: "500/mo", pro: "Unlimited", enterprise: "Unlimited" },
  { feature: "Client organizations", starter: "1", growth: "5", pro: "20", enterprise: "Unlimited" },
  { feature: "Users included", starter: "100", growth: "500", pro: "2,500", enterprise: "10,000" },
  { feature: "Learning Moments + auto-remediation", starter: true, growth: true, pro: true, enterprise: true },
  { feature: "ConnectWise & Halo PSA ticketing", starter: false, growth: false, pro: true, enterprise: true },
  { feature: "Human Risk Score (QBR)", starter: false, growth: "Basic", pro: "Advanced", enterprise: "Enterprise" },
  { feature: "Insurance evidence pack", starter: false, growth: true, pro: true, enterprise: "White Label" },
  { feature: "MSP / multi-tenant dashboard", starter: false, growth: false, pro: true, enterprise: true },
  { feature: "White-label branding", starter: false, growth: false, pro: true, enterprise: true },
  { feature: "API access", starter: false, growth: false, pro: true, enterprise: true },
  { feature: "Priority support", starter: "Email", growth: "Email", pro: "Chat + Email", enterprise: "24/7 Phone + Chat" },
];

const FAQS = [
  { q: "How quickly can we stand this up for a client?", a: "Most MSPs run a client's first phishing campaign within about 10 minutes: create the client org, run the allowlist wizard, import the employee list (CSV or manual), pick a template, and launch." },
  { q: "Do simulation reports create PSA tickets?", a: "No. Simulation reports are scored only and never open a ticket, so training noise stays off the board. A reported REAL (non-simulation) email can open a ticket in ConnectWise Manage or Halo — but only when that client's connection is configured, mapped, and enabled by the MSP." },
  { q: "Will the phishing emails actually reach inboxes?", a: "Simulated phishing looks like phishing by design, so it can land in spam even with SPF/DKIM/DMARC passing. The guided allowlist wizard walks each client's admin through inbox allowlisting before the first campaign so simulations reach the inbox." },
  { q: "Can we use our own templates or share them?", a: "Yes. You get ~100 realistic built-in templates and can create your own. Templates shared to the community library are reviewed and approved before they publish." },
  { q: "How do the compliance and insurance artifacts work?", a: "Generate dated compliance certificates for frameworks like HIPAA, GLBA, CMMC, NY DFS and SOC 2, plus a carrier-style cyber-insurance evidence pack — timestamped campaign history, click-rate trends, and training records — white-labeled under your MSP brand." },
  { q: "Is there a free trial?", a: "Yes — every plan includes a 30-day free trial with no credit card required, and full access to features during the trial." },
];

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [location] = useLocation();
  const seo = seoForPath(location); // PS-SEO-02: shared with the prerender so raw HTML == hydrated

  const NAV = [
    { label: "How it works", href: "#how" },
    { label: "Features", href: "#features" },
    { label: "For MSPs", href: "#for-msps" },
    { label: "Pricing", href: "#pricing" },
    { label: "Partner Portal", href: "/msp" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Seo title={seo.title} description={seo.description} path={seo.path} />

      {/* Navigation */}
      <header className="border-b border-border/40 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <img src="/brand/phishsim-nav.png" alt="PhishSim AI" className="h-8 w-auto" />
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            {NAV.map(({ label, href }) => (
              <a key={label} href={href} className="hover:text-foreground transition-colors">{label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => window.location.href = getLoginUrl()}>Sign In</Button>
              <Button size="sm" onClick={() => window.location.href = getSignupUrl()}>
                Start Free Trial <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background/95 backdrop-blur-sm px-4 py-4 flex flex-col gap-1">
            {NAV.map(({ label, href }) => (
              <a key={label} href={href} className="text-sm text-muted-foreground hover:text-foreground transition-colors py-3 border-b border-border/40 last:border-0"
                onClick={() => setMobileMenuOpen(false)}>{label}</a>
            ))}
            <div className="flex flex-col gap-2 pt-3">
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => window.location.href = getLoginUrl()}>Sign In</Button>
              <Button size="sm" className="w-full" onClick={() => window.location.href = getSignupUrl()}>
                Start Free Trial <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* Hero — MSP/MSSP buyer, operator tone */}
      <section className="relative border-b border-border/40">
        <div className="absolute inset-0 bg-gradient-to-b from-violet-950/20 to-background pointer-events-none" />
        <div className="container relative py-20 md:py-28">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div className="max-w-3xl">
            <Badge variant="outline" className="mb-6 border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs px-3 py-1">
              For MSPs &amp; MSSPs · 30-day free trial, no credit card
            </Badge>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight mb-5 leading-[1.08]">
              Phishing simulations &amp; awareness training for{" "}
              <span className="text-violet-400">every client</span>, from one console.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl leading-relaxed">
              PhishSim gives MSPs multi-tenant simulations, per-lure Learning Moments, and desk-friendly reporting
              into ConnectWise Manage and Halo — plus QBR risk scores and cyber-insurance evidence under your brand.
              Flat MSP pricing, so your margin grows with every seat.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <Button size="lg" className="text-base px-7 h-12" onClick={() => window.location.href = getSignupUrl()}>
                Start Free 30-Day Trial <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button size="lg" variant="outline" className="text-base px-7 h-12" onClick={() => { window.location.hash = "#how"; }}>
                See how it works
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              {["No credit card required", "30-day free trial", "Built for multi-tenant MSPs"].map(t => (
                <span key={t} className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />{t}</span>
              ))}
            </div>
          </div>

          {/* RIGHT: hero visual — desktop only, so the phone CTA stack stays clean */}
          <div className="hidden lg:flex justify-center lg:justify-end">
            <img
              src="/brand/hero-learning-moment.png"
              alt="Phishing simulation email with an instant Learning Moment tip card"
              className="w-full max-w-lg xl:max-w-xl rounded-2xl border border-border/40 shadow-2xl shadow-violet-950/40"
              width={1200}
              height={800}
              loading="eager"
              decoding="async"
            />
          </div>
          </div>
        </div>
      </section>

      {/* Built for the MSP desk — strip */}
      <section id="for-msps" className="border-b border-border/40 bg-secondary/20">
        <div className="container py-10">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {MSP_STRIP.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-violet-400" />
                </div>
                <span className="text-sm text-muted-foreground leading-relaxed pt-1.5">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20 border-b border-border/40">
        <div className="container">
          <div className="max-w-2xl mb-14">
            <h2 className="text-3xl md:text-4xl font-black mb-3">Stand up a client in about 10 minutes</h2>
            <p className="text-muted-foreground text-lg">No implementation project, no security engineer required — the same path your techs run for every new client.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW.map(({ n, icon: Icon, title, desc }) => (
              <div key={n}>
                <div className="w-12 h-12 rounded-xl border border-border/60 bg-card flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-violet-400" />
                </div>
                <div className="text-xs font-mono text-muted-foreground mb-2">{n}</div>
                <h3 className="font-bold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid — MSP-weighted */}
      <section id="features" className="py-20 border-b border-border/40 bg-secondary/10">
        <div className="container">
          <div className="max-w-2xl mb-14">
            <h2 className="text-3xl md:text-4xl font-black mb-3">Built for the MSP service desk</h2>
            <p className="text-muted-foreground text-lg">From guided allowlisting to per-lure Learning Moments, PSA ticketing, and carrier-ready insurance evidence — plus ~100 realistic built-in simulation templates, all in one place.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <Card key={f.title} className="border-border/60 bg-card hover:border-border transition-colors">
                <CardContent className="p-6">
                  <div className={"w-10 h-10 rounded-xl " + f.bg + " flex items-center justify-center mb-4"}>
                    <f.icon className={"w-5 h-5 " + f.color} />
                  </div>
                  <h3 className="font-bold mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-6 flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            Shared community templates are reviewed and approved before they publish.
          </p>
        </div>
      </section>

      {/* Proof band — compliance chips + insurance one-liner (compact, no CFR wall) */}
      <section id="compliance" className="py-16 border-b border-border/40">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-2xl md:text-3xl font-black mb-3">Evidence your clients' auditors and insurers accept</h2>
              <p className="text-muted-foreground mb-5 leading-relaxed">
                Generate dated compliance certificates and a carrier-style cyber-insurance evidence PDF —
                timestamped campaign history, click-rate trends, and training records — white-labeled under your MSP brand.
              </p>
              <div className="flex flex-wrap gap-2">
                {FRAMEWORK_CHIPS.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-xs text-muted-foreground">
                    <Shield className="w-3 h-3 text-violet-400" />{c}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">Specific regulatory citations are shown in the in-app Compliance Center.</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-6">
              <div className="flex items-center gap-2 mb-4 text-sm font-semibold"><FileText className="w-4 h-4 text-violet-400" /> Cyber-insurance evidence pack</div>
              <ul className="space-y-2.5">
                {["Timestamped campaign history", "Click-rate improvement trend", "Training completion records", "White-labeled under your MSP brand"].map(item => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />{item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 border-b border-border/40 bg-secondary/10">
        <div className="container">
          <div className="max-w-2xl mb-12">
            <h2 className="text-3xl md:text-4xl font-black mb-3">Priced for MSP margin, not enterprise procurement</h2>
            <p className="text-muted-foreground text-lg">Flat monthly pricing per MSP — never per seat — so your margin grows as your client list does. Starter covers 100 users at <strong className="text-foreground">$1.49 each</strong>; Pro covers 2,500 at <strong className="text-foreground">30 cents</strong>. Every plan includes a 30-day free trial with no credit card. <span className="text-green-500 font-medium">Save 17% annually.</span></p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl">
            {PLANS.map((plan) => (
              <div key={plan.name} className={"rounded-2xl border p-7 flex flex-col relative " + (plan.highlight ? "border-violet-500/50 bg-violet-500/5 shadow-lg shadow-violet-500/10" : "border-border/60 bg-card")}>
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-violet-600 text-white text-xs px-3">{plan.badge}</Badge>
                  </div>
                )}
                <div className="mb-6">
                  <div className="font-bold text-lg mb-1">{plan.name}</div>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-4xl font-black">{plan.price}</span>
                    <span className="text-muted-foreground text-sm">{plan.period}</span>
                  </div>
                  <div className="text-xs text-violet-400 font-semibold mb-2">{plan.perUser}</div>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>
                <ul className="space-y-2.5 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
                <Button className="w-full" variant={plan.highlight ? "default" : "outline"} onClick={() => plan.cta === "Contact Sales" ? window.location.href = "mailto:sales@phishsimai.com?subject=Enterprise%20Inquiry" : window.location.href = getSignupUrl()}>
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>

          <div className="max-w-6xl mt-14">
            <h3 className="text-lg font-bold mb-6">Compare every plan</h3>
            <div className="overflow-x-auto rounded-2xl border border-border/60">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-border/60 bg-secondary/30">
                    <th className="text-left p-4 font-semibold">Feature</th>
                    <th className="p-4 font-semibold">Starter</th>
                    <th className="p-4 font-semibold text-violet-400">Growth</th>
                    <th className="p-4 font-semibold">Pro</th>
                    <th className="p-4 font-semibold">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_MATRIX.map((row, i) => (
                    <tr key={row.feature} className={"border-b border-border/40 last:border-0 " + (i % 2 ? "bg-secondary/10" : "")}>
                      <td className="p-4 text-muted-foreground">{row.feature}</td>
                      {([row.starter, row.growth, row.pro, row.enterprise] as (string | boolean)[]).map((cell, j) => (
                        <td key={j} className={"p-4 text-center " + (j === 1 ? "bg-violet-500/5" : "")}>
                          {cell === false ? (
                            <span className="text-muted-foreground/40">—</span>
                          ) : cell === true ? (
                            <Check className="w-4 h-4 text-violet-400 mx-auto" />
                          ) : (
                            <span className="font-medium">{cell}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-6">
            Managing more than 20 client organizations?{" "}
            <a href="mailto:sales@phishsimai.com" className="text-violet-400 hover:underline">Contact our sales team</a>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 border-b border-border/40">
        <div className="container max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-black mb-10">Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="rounded-xl border border-border/60 bg-card overflow-hidden">
                <button className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/30 transition-colors" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span className="font-semibold text-sm pr-4">{faq.q}</span>
                  <ChevronRight className={"w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform " + (openFaq === i ? "rotate-90" : "")} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-border/40 pt-4">{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-gradient-to-b from-background to-violet-950/20">
        <div className="container max-w-3xl">
          <h2 className="text-4xl md:text-5xl font-black mb-4">Stand up phishing + awareness for your clients this week.</h2>
          <p className="text-lg text-muted-foreground mb-8">Launch your first multi-tenant campaign in about 10 minutes. Free for 30 days, no credit card.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button size="lg" className="text-base px-8 h-12" onClick={() => window.location.href = getSignupUrl()}>
              Start Free 30-Day Trial <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8 h-12" onClick={() => window.location.href = "/msp"}>
              <Users className="w-4 h-4 mr-2" /> Open the Partner Portal
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-4">No credit card required · 30-day free trial</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-secondary/10">
        <div className="container py-12">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
            <div className="col-span-2">
              <img src="/brand/phishsim-nav.png" alt="PhishSim AI" className="h-6 w-auto mb-4" />
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed max-w-xs">Multi-tenant phishing simulation and security awareness training, built for MSPs and MSSPs.</p>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <div className="flex items-center gap-2"><Globe className="w-3.5 h-3.5" /><a href="https://www.phishsimai.com" className="hover:text-foreground transition-colors">www.phishsimai.com</a></div>
                <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /><a href="tel:4435941184" className="hover:text-foreground transition-colors">443-594-1184</a></div>
                <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /><a href="mailto:info@phishsimai.com" className="hover:text-foreground transition-colors">info@phishsimai.com</a></div>
              </div>
            </div>
            <div>
              <div className="font-semibold text-sm mb-3">Product</div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {[
                  { label: "How it works", href: "#how" },
                  { label: "Features", href: "#features" },
                  { label: "For MSPs", href: "#for-msps" },
                  { label: "Pricing", href: "#pricing" },
                  { label: "Compliance", href: "#compliance" },
                ].map(({ label, href }) => (
                  <li key={label}><a href={href} className="hover:text-foreground transition-colors">{label}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-semibold text-sm mb-3">Compliance</div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {FRAMEWORK_CHIPS.map(item => (
                  <li key={item}><a href="#compliance" className="hover:text-foreground transition-colors">{item}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-semibold text-sm mb-3">Company</div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {[
                  { label: "MSP Partner Portal", href: "/msp" },
                  { label: "Contact Sales", href: "mailto:sales@phishsimai.com" },
                  { label: "Support", href: "mailto:support@phishsimai.com" },
                  { label: "Privacy Policy", href: "/privacy" },
                  { label: "Terms of Service", href: "/terms" },
                ].map(({ label, href }) => (
                  <li key={label}><a href={href} className="hover:text-foreground transition-colors">{label}</a></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-border/40 pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} PhishSim AI. All rights reserved.</span>
            <div className="flex items-center gap-4">
              <a href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a>
              <a href="/terms" className="hover:text-foreground transition-colors">Terms of Service</a>
              <a href="mailto:support@phishsimai.com" className="hover:text-foreground transition-colors">Support</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
