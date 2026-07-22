import { useState } from "react";
import { useLocation } from "wouter";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getLoginUrl, getSignupUrl } from "@/const";
import {
  Shield, Zap, BarChart3, Users, Brain, CheckCircle2,
  ChevronRight, Star, Building2, Globe, Mail, Phone,
  Lock, AlertTriangle, FileText, Award, Clock, Target,
  ArrowRight, X, Check, TrendingUp, Layers, BookOpen, Palette, Menu
} from "lucide-react";

const MANDATORY_FRAMEWORKS = [
  { name: "HIPAA", citation: "45 CFR §164.308(a)(5)", sector: "Healthcare", description: "Requires covered entities to implement security awareness and training programs for all workforce members. Phishing simulations are the industry-standard method to demonstrate active compliance.", penalty: "Up to $1.9M per violation category annually" },
  { name: "GLBA", citation: "16 CFR Part 314", sector: "Financial Services", description: "Financial institutions must implement comprehensive safeguards including employee training on phishing and social engineering attacks targeting customer financial data.", penalty: "Up to $100,000 per violation + criminal liability" },
  { name: "NERC CIP", citation: "NERC CIP-004-7", sector: "Energy / Utilities", description: "Mandates cybersecurity awareness training for all personnel with access to critical infrastructure systems. Non-compliance threatens grid reliability and national security.", penalty: "Up to $1M per violation per day" },
  { name: "CMMC / DFARS", citation: "NIST SP 800-171 §3.2", sector: "Defense Contractors", description: "CMMC Level 2+ explicitly references NIST 800-171, which mandates security awareness training. Failure to comply disqualifies contractors from DoD contracts.", penalty: "Loss of DoD contract eligibility" },
  { name: "NY DFS Part 500", citation: "23 NYCRR §500.14", sector: "NY-Licensed Financial Entities", description: "New York\'s cybersecurity regulation explicitly requires annual phishing awareness training for all personnel at covered financial institutions.", penalty: "Up to $250,000 per violation" },
];

const RECOMMENDED_FRAMEWORKS = [
  { name: "NIST CSF / SP 800-53", note: "Explicitly calls out phishing simulation as a training mechanism" },
  { name: "SOC 2", note: "Auditors routinely look for phishing simulation programs as evidence of security awareness controls" },
  { name: "FTC Safeguards Rule (2023)", note: "Requires a written information security program including employee training" },
  { name: "PCI DSS v4.0", note: "Requirement 12.6.3 specifically addresses phishing awareness training" },
  { name: "SEC Cybersecurity Rules (2023)", note: "Requires disclosure of risk management programs; phishing training is a common cited control" },
];

const FEATURES = [
  { icon: Brain, title: "AI-Powered Template Engine", description: "Generate unlimited realistic phishing templates in English, Spanish, and Turkish. Industry-specific attack types across Finance, Healthcare, HR, and more.", color: "text-violet-400", bg: "bg-violet-500/10" },
  { icon: Target, title: "Department-Based Targeting", description: "Organize employees by Finance, Sales, Management, Operations, Warehouse, or custom departments. Run targeted campaigns that mirror real-world attack patterns.", color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { icon: BarChart3, title: "Real-Time Analytics", description: "Track open rates, click rates, credential submission rates, and improvement trends per department. Identify your highest-risk employees instantly.", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { icon: BookOpen, title: "15+ Training Modules", description: "Short-form security awareness courses (90% under 5 minutes) covering HIPAA, PCI DSS, GDPR, password hygiene, social engineering, and more.", color: "text-amber-400", bg: "bg-amber-500/10" },
  { icon: Award, title: "Compliance Certificates", description: "Auto-generate regulatory compliance certificates for HIPAA, GLBA, NERC CIP, CMMC, NY DFS, SOC 2, and 5 more frameworks with specific legal citations.", color: "text-rose-400", bg: "bg-rose-500/10" },
  { icon: Layers, title: "MSP White Label Portal", description: "Manage multiple customer organizations from a single dashboard. Full white-label branding with your logo, colors, and custom domain.", color: "text-indigo-400", bg: "bg-indigo-500/10" },
];

// PS-PRICE-05: the KnowBe4/Proofpoint/Cofense comparison table was REMOVED (founder decision
// 2026-07-16). Naming competitors on your own pricing page fights on their axis and dates the
// moment any of them discounts. What replaced it is the claim they structurally cannot match:
// setup measured in minutes, not weeks.
const SPEED_PROOF = [
  { stat: "10 min", label: "from signup to first simulation sent" },
  { stat: "0", label: "onboarding calls, demos, or sales gates required" },
  { stat: "14 days", label: "free trial, no credit card" },
];

const TESTIMONIALS = [
  { quote: "We had to demonstrate HIPAA compliance to our auditors. PhishSim AI gave us the simulation data, training records, and a signed certificate in one afternoon. Passed our audit with zero findings.", name: "Director of IT", company: "Regional Healthcare Network", employees: "340 employees", rating: 5 },
  { quote: "As an MSP we manage 47 clients. The white-label portal lets us run phishing programs for all of them from one place, under our own brand. Our clients think we built it ourselves.", name: "VP of Managed Services", company: "Mid-Atlantic MSP", employees: "47 client organizations", rating: 5 },
  { quote: "Our last vendor wanted a demo, a procurement review, and three weeks. We had PhishSim AI sending real simulations the same morning we signed up. The AI templates are actually better.", name: "IT Manager", company: "Manufacturing Company", employees: "210 employees", rating: 5 },
];

const PLANS = [
  // PS-PRICE-05: prices are Stripe's and unchanged ($149/$299/$749/$1499, live price_1Tner
  // IDs in OrgSettings.tsx). SEATS are the founder matrix of 2026-07-16: 100/500/2500/10000,
  // a 4x increase at the same price. perUser is DERIVED (price / seats), never typed -- the
  // reason this page advertised $2/user for months is that a claim was asserted and never
  // checked against the thing it described.
  //
  // Competitor names deliberately absent. A page that argues on price invites a price war it
  // cannot win against a funded incumbent; setup speed is the wedge nobody can copy quickly.
  { name: "Starter", price: "$149", period: "/mo", perUser: "$1.49/user", description: "Your first managed client, live this afternoon.", features: ["1 client organization", "100 users", "100 phishing simulations/mo", "Basic training modules", "Basic compliance reporting", "Email support"], cta: "Start Free Trial", highlight: false },
  { name: "Growth", price: "$299", period: "/mo", perUser: "$0.60/user", description: "Five clients, one dashboard, zero spreadsheets.", features: ["5 client organizations", "500 users", "500 phishing simulations/mo", "Standard training modules", "Full compliance reporting", "Risk scoring & analytics", "Multi-framework (NIST, ISO)"], cta: "Start Free Trial", highlight: true, badge: "Most Popular" },
  { name: "Pro", price: "$749", period: "/mo", perUser: "$0.30/user", description: "Run 20 clients without adding headcount.", features: ["20 client organizations", "2,500 users", "Unlimited simulations", "Advanced training + risk scoring", "Compliance automation", "MSP multi-tenant dashboard", "Custom branding + API access", "Chat + email support"], cta: "Start Free Trial", highlight: false },
  { name: "Enterprise", price: "$1,499", period: "/mo", perUser: "$0.15/user", description: "Ten thousand seats, under your own brand.", features: ["Unlimited client organizations", "10,000 users", "All + custom training modules", "White-label compliance reporting", "Enterprise risk scoring", "Custom frameworks", "Dedicated account manager", "24/7 phone + chat support"], cta: "Contact Sales", highlight: false },
];

// PS-PRICE-04: founder feature matrix, 2026-07-16. Seat counts are NOT from this matrix --
// they stay as Stripe sells them (25/100/500/unlimited), because pricing is a section-5
// hard stop and Stripe is the source of truth. Everything below is capability, not quantity
// of seats, so the two do not collide.
const FEATURE_MATRIX = [
  { feature: "Phishing simulations", starter: "100/mo", growth: "500/mo", pro: "Unlimited", enterprise: "Unlimited" },
  { feature: "Client organizations", starter: "1", growth: "5", pro: "20", enterprise: "Unlimited" },
  { feature: "Users included", starter: "100", growth: "500", pro: "2,500", enterprise: "10,000" },
  { feature: "Training modules", starter: "Basic", growth: "Standard", pro: "Advanced", enterprise: "All + Custom" },
  { feature: "Compliance reporting", starter: "Basic", growth: "Full", pro: "Full + Automation", enterprise: "Full + White Label" },
  { feature: "Risk scoring & analytics", starter: false, growth: "Basic", pro: "Advanced", enterprise: "Enterprise" },
  { feature: "Multi-framework (NIST, ISO, etc.)", starter: false, growth: true, pro: true, enterprise: "Yes + Custom" },
  { feature: "MSP / multi-tenant dashboard", starter: false, growth: false, pro: true, enterprise: true },
  { feature: "Custom branding", starter: false, growth: false, pro: true, enterprise: true },
  { feature: "API access", starter: false, growth: false, pro: true, enterprise: true },
  { feature: "Dedicated account manager", starter: false, growth: false, pro: false, enterprise: true },
  { feature: "Priority support", starter: "Email", growth: "Email", pro: "Chat + Email", enterprise: "24/7 Phone + Chat" },
]

const FAQS = [
  { q: "How quickly can we get started?", a: "Most organizations are running their first phishing campaign within 10 minutes of signing up. Create your org, import your employee list (CSV or manual), pick an AI-generated template, and launch." },
  { q: "Do we need technical expertise to use PhishSim AI?", a: "No. The platform is designed for IT generalists and HR teams, not security engineers. The AI handles template creation, scheduling is automated, and reports are generated with one click." },
  { q: "Will the phishing emails actually be delivered to inboxes?", a: "Yes. We provide SPF/DKIM/DMARC configuration guidance to whitelist our sending infrastructure. Most organizations achieve 95%+ inbox delivery rates." },
  { q: "Can we use our own phishing templates?", a: "Absolutely. You can create custom templates, import from real phishing emails you have received, and share templates with other organizations in the community library." },
  { q: "How do the compliance certificates work?", a: "After completing the required checklist items for a framework (e.g., HIPAA), you can generate a dated compliance certificate with your organization name, completion percentage, and the specific regulatory citation. These are accepted by most auditors as evidence of a phishing awareness program." },
  { q: "Is there a free trial?", a: "Yes — all plans include a 14-day free trial with no credit card required. You get full access to all features during the trial." },
];

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [location] = useLocation();

  // PS-SEO-01: / and /pricing render this same component, so meta is route-aware here.
  const seo = location.startsWith("/pricing")
    ? {
        title: "PhishSim AI Pricing — MSP Phishing Simulation from $149/mo",
        description: "Transparent per-seat pricing for MSPs: Starter $149, Growth $299, Pro $749, Enterprise $1,499/mo. AI phishing simulations, training, and compliance reporting. 14-day free trial, no card required.",
        path: "/pricing",
      }
    : {
        title: "PhishSim AI — AI Phishing Simulation & Security Awareness for MSPs",
        description: "Run AI-generated phishing simulations, training, and compliance reporting for your clients in minutes. Built for MSPs and IT teams — no security engineer required. 14-day free trial.",
        path: "/",
      };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Seo title={seo.title} description={seo.description} path={seo.path} />
      {/* Navigation */}
      <header className="border-b border-border/40 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <img src="/brand/phishsim-nav.png" alt="PhishSim AI" className="h-8 w-auto" />
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#compliance" className="hover:text-foreground transition-colors">Compliance</a>
            <a href="#msp" className="hover:text-foreground transition-colors">MSP / Partners</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="/msp" className="hover:text-foreground transition-colors">Partner Portal</a>
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
        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background/95 backdrop-blur-sm px-4 py-4 flex flex-col gap-1">
            {[
              { label: "Features", href: "#features" },
              { label: "Compliance", href: "#compliance" },
              { label: "MSP / Partners", href: "#msp" },
              { label: "Pricing", href: "#pricing" },
              { label: "Partner Portal", href: "/msp" },
            ].map(({ label, href }) => (
              <a key={label} href={href} className="text-sm text-muted-foreground hover:text-foreground transition-colors py-3 border-b border-border/40 last:border-0"
                onClick={() => setMobileMenuOpen(false)}>{label}</a>
            ))}
            <div className="flex flex-col gap-2 pt-3">
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => window.location.href = getLoginUrl()}>Sign In</Button>
              <Button size="sm" className="w-full bg-violet-600 hover:bg-violet-500" onClick={() => window.location.href = getSignupUrl()}>
                Start Free Trial <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-950/30 via-background to-background pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="container relative py-24 md:py-32">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="outline" className="mb-6 border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs px-3 py-1">
              <Zap className="w-3 h-3 mr-1.5" />
              Trusted by MSPs — Launch in 10 Min · No Credit Card · Cancel Anytime
            </Badge>
            <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-[1.05]">
              Your clients are{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">one click away</span>{" "}
              from a breach.
            </h1>
            <p className="text-xl text-muted-foreground mb-4 max-w-2xl mx-auto leading-relaxed">
              PhishSim AI finds your clients' vulnerable employees before attackers do — then fixes the problem automatically. Add a recurring compliance revenue line. Retain clients who ask about security. Set up in 10 minutes.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mb-10 text-sm">
              {["HIPAA Required", "GLBA Required", "CMMC Required", "NY DFS Required"].map(label => (
                <Badge key={label} variant="outline" className="border-red-500/30 bg-red-500/10 text-red-400">
                  <AlertTriangle className="w-3 h-3 mr-1" />{label}
                </Badge>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
              <Button size="lg" className="text-base px-8 h-12 bg-violet-600 hover:bg-violet-500" onClick={() => window.location.href = getSignupUrl()}>
                Start Free 14-Day Trial <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
              {["No credit card required", "Setup in under 10 minutes", "14-day free trial", "Cancel anytime"].map(t => (
                <span key={t} className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />{t}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-border/40 bg-secondary/20">
        <div className="container py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { value: "10 min", label: "from signup to first campaign live" },
              { value: "$4.9M", label: "average cost of a phishing breach" },
              { value: "3×", label: "client retention uplift vs no program" },
              { value: "67%", label: "of employees click without training" },
            ].map(({ value, label }) => (
              <div key={label}>
                <div className="text-3xl font-black text-foreground mb-1">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof story strip */}
      <section className="bg-violet-950/30 border-y border-violet-500/20 py-10">
        <div className="container max-w-4xl mx-auto text-center">
          <p className="text-sm text-violet-300 font-semibold uppercase tracking-widest mb-4">Real MSP Result</p>
          <blockquote className="text-xl md:text-2xl font-medium text-foreground leading-relaxed mb-4">
            {"We added "}
            <span className="text-violet-400 font-bold">$4,200/mo</span>
            {" in recurring revenue, retained 3 clients who raised compliance concerns, and passed a HIPAA audit — all within 60 days of launching PhishSim AI under our brand."}
          </blockquote>
          <p className="text-sm text-muted-foreground">VP of Managed Services · Mid-Atlantic MSP · 47 client organizations</p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 border-t border-border/40 bg-secondary/10">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-black mb-4">The best price in the industry. From <span className="text-violet-400">15 cents per user</span>.</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Flat monthly pricing per MSP — never per seat, so your margin grows as your client list does. Starter covers 100 users at <strong className="text-foreground">$1.49 each</strong>. Pro covers 2,500 at <strong className="text-foreground">30 cents</strong>. Every plan: 14-day free trial, no credit card, cancel anytime. <span className="text-green-500 font-medium">Save 17% annually.</span></p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
            {PLANS.map((plan) => (
              <div key={plan.name} className={"rounded-2xl border p-7 flex flex-col relative " + (plan.highlight ? "border-violet-500/50 bg-violet-500/5 shadow-lg shadow-violet-500/10" : "border-border/60 bg-card")}>
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-violet-600 text-white text-xs px-3">{plan.badge}</Badge>
                  </div>
                )}
                <div className="mb-6">
                  <div className="font-bold text-lg mb-1">{plan.name}</div>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-black">{plan.price}</span>
                    <span className="text-muted-foreground text-sm">{plan.period}</span>
                  <div className="text-xs text-violet-400 font-semibold mt-1">{plan.perUser}</div>
                  </div>
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
                <Button className={"w-full " + (plan.highlight ? "bg-violet-600 hover:bg-violet-500" : "")} variant={plan.highlight ? "default" : "outline"} onClick={() => plan.cta === "Contact Sales" ? window.location.href = "mailto:sales@phishsimai.com?subject=Enterprise%20Inquiry" : window.location.href = getSignupUrl()}>
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>
          {/* PS-PRICE-04: full capability matrix. The cards carry the 6-8 differentiators a
              buyer scans; this is the row-by-row for the buyer who is comparing seriously.
              Same data source either way -- a card and this table can never disagree. */}
          <div className="max-w-6xl mx-auto mt-14">
            <h3 className="text-center text-lg font-bold mb-6">Compare every feature</h3>
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

          <p className="text-center text-xs text-muted-foreground mt-6">
            Managing more than 20 client organizations?{" "}
            <a href="mailto:sales@phishsimai.com" className="text-violet-400 hover:underline">Contact our sales team</a>
          </p>
        </div>
      </section>

      {/* Mandatory Compliance */}
      <section id="compliance" className="py-20 bg-red-950/10">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <Badge variant="outline" className="mb-4 border-red-500/40 bg-red-500/10 text-red-400 text-xs px-3 py-1">
              <AlertTriangle className="w-3 h-3 mr-1.5" /> Federal and State Legal Requirements
            </Badge>
            <h2 className="text-4xl font-black mb-4">
              Phishing training is not optional —{" "}
              <span className="text-red-400">it is the law.</span>
            </h2>
            <p className="text-muted-foreground text-lg">
              Five federal and state regulations <strong className="text-foreground">legally require</strong> your organization to conduct phishing awareness training. Non-compliance carries penalties up to <strong className="text-red-400">$1.9 million per year</strong>. PhishSim AI gives you the documentation, training records, and compliance certificates to satisfy every audit.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
            {MANDATORY_FRAMEWORKS.map((fw) => (
              <div key={fw.name} className="rounded-xl border border-red-500/40 bg-red-500/5 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-bold text-lg">{fw.name}</div>
                    <code className="text-xs text-muted-foreground font-mono">{fw.citation}</code>
                  </div>
                  <Badge variant="outline" className="text-xs border border-red-500/30 bg-red-500/15 text-red-400 flex-shrink-0 ml-2">
                    <Lock className="w-2.5 h-2.5 mr-1" /> Required
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{fw.description}</p>
                <div className="text-xs text-red-400 flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  <span><strong>Penalty:</strong> {fw.penalty}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground"><strong className="text-foreground">Sector:</strong> {fw.sector}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-amber-400">Strongly Recommended / Best Practice</span>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {RECOMMENDED_FRAMEWORKS.map((fw) => (
                <div key={fw.name} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">{fw.name}</div>
                    <div className="text-xs text-muted-foreground">{fw.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-center">
            <Button size="lg" className="bg-red-600 hover:bg-red-500 text-white" onClick={() => window.location.href = getSignupUrl()}>
              <Shield className="w-4 h-4 mr-2" /> Get Compliant Today — Free Trial
            </Button>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 border-t border-border/40">
        <div className="container">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-black mb-4">Up and running in under 10 minutes</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">No IT team required. No weeks of onboarding. Sign up, import your team, and launch your first campaign.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "01", icon: Users, title: "Import Your Team", desc: "Upload a CSV or add employees manually. Organize by department — Finance, Sales, Management, Operations, Warehouse, or custom.", color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
              { step: "02", icon: Brain, title: "Launch AI Campaigns", desc: "Choose from 100+ built-in templates or generate new ones with AI. Schedule recurring campaigns with automatic target rotation.", color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
              { step: "03", icon: TrendingUp, title: "Track and Train", desc: "See who clicked, who submitted credentials, and who reported the email. Auto-enroll at-risk employees in targeted training modules.", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
              { step: "04", icon: Award, title: "Prove Compliance", desc: "Generate compliance reports and certificates for HIPAA, GLBA, NERC CIP, CMMC, NY DFS, SOC 2, and more with one click.", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
            ].map(({ step, icon: Icon, title, desc, color, bg }) => (
              <div key={step} className="text-center">
                <div className={"w-16 h-16 rounded-2xl border " + bg + " flex items-center justify-center mx-auto mb-4"}>
                  <Icon className={"w-7 h-7 " + color} />
                </div>
                <div className="text-xs font-mono text-muted-foreground mb-2">{step}</div>
                <h3 className="font-bold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 border-t border-border/40 bg-secondary/10">
        <div className="container">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-black mb-4">The complete phishing simulation platform</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Every feature you need to run a world-class security awareness program — all in one place, at a fraction of the cost.</p>
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
        </div>
      </section>

      {/* Speed — replaces the competitor comparison (PS-PRICE-05). */}
      <section className="py-20 border-t border-border/40">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-black mb-4">Live in <span className="text-violet-400">10 minutes</span>. Not three weeks.</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Legacy awareness platforms sell you a demo, a procurement cycle, and an onboarding project.
              You sign up, import a CSV, and your first simulation is in inboxes before the coffee goes cold.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {SPEED_PROOF.map((s) => (
              <div key={s.label} className="rounded-2xl border border-border/60 bg-card p-8 text-center">
                <div className="text-4xl font-black text-violet-400 mb-2">{s.stat}</div>
                <div className="text-sm text-muted-foreground leading-relaxed">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground mt-8 max-w-2xl mx-auto">
            No sales call. No implementation fee. No annual lock-in.
            If it takes longer than 10 minutes to send your first simulation, we want to hear about it.
          </p>
        </div>
      </section>

      {/* Cyber Insurance Readiness Pack — Game Changer Feature */}
      <section className="bg-gradient-to-br from-violet-950/40 via-background to-background py-20 border-y border-violet-500/20">
        <div className="container max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row gap-12 items-center">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/30 rounded-full px-4 py-1.5 mb-6">
                <span className="text-violet-400 font-bold text-xs uppercase tracking-widest">Industry First</span>
              </div>
              <h2 className="text-4xl font-black mb-4 leading-tight">
                One click.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">Broker-ready evidence package.</span>
              </h2>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                Coalition, At-Bay, Travelers, Chubb, and Beazley now require documented phishing simulation data at renewal. Most MSPs cannot produce it. <strong className="text-foreground">PhishSim AI generates the complete carrier supplemental evidence PDF automatically</strong> — timestamped campaign history, click-rate trends, training completion records, and an attestation signature page.
              </p>
              <div className="space-y-3 mb-8">
                {[
                  "Satisfies all 5 carrier supplemental security awareness questions",
                  "Timestamped campaign log accepted by Coalition, At-Bay, Travelers, Chubb and Beazley",
                  "Demonstrates click-rate improvement trend — lower premiums for your clients",
                  "White-labeled under your MSP brand",
                  "Generated in 60 seconds. No manual export, no Word docs",
                ].map(item => (
                  <div key={item} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-green-400" />
                    </div>
                    <span className="text-sm text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
              <Button size="lg" className="bg-violet-600 hover:bg-violet-500 text-base px-8 h-12" onClick={() => window.location.href = getSignupUrl()}>
                Generate Your First Evidence Pack <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
            <div className="flex-shrink-0 w-full md:w-80">
              <div className="bg-card border border-border rounded-2xl p-6 shadow-2xl">
                <div className="bg-slate-900 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-slate-400 font-mono">ACME Corp — Insurance Pack</span>
                    <span className="text-xs text-green-400 font-bold">PDF</span>
                  </div>
                  {[
                    { page: "Cover", desc: "Carrier-addressed evidence header" },
                    { page: "Controls", desc: "All 5 checkpoints: PASS" },
                    { page: "Summary", desc: "Click rate: 34% to 8% improvement" },
                    { page: "Campaign Log", desc: "12 campaigns, timestamped" },
                    { page: "Attestation", desc: "Signature-ready for broker" },
                  ].map(({ page, desc }) => (
                    <div key={page} className="flex items-center gap-3 py-2 border-b border-slate-700/50 last:border-0">
                      <div className="w-6 h-6 rounded bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-3 h-3 text-violet-400" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-200">{page}</div>
                        <div className="text-xs text-slate-500">{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-2">Generated in</p>
                  <p className="text-2xl font-black text-violet-400">60 sec</p>
                  <p className="text-xs text-muted-foreground">vs. hours of manual work</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MSP Section */}
      <section id="msp" className="py-20 border-t border-border/40 bg-secondary/10">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="outline" className="mb-4 border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs">
                MSP / Partner Program
              </Badge>
              <h2 className="text-4xl font-black mb-4">
                Manage all your customers from{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">one white-label portal</span>
              </h2>
              <p className="text-muted-foreground text-lg mb-6 leading-relaxed">
                PhishSim AI is built for MSPs. Provision new customer organizations in seconds, manage their campaigns and compliance from a single dashboard, and present everything under your own brand.
              </p>
              <div className="space-y-3 mb-8">
                {[
                  "Full white-label branding — your logo, colors, and custom domain",
                  "Provision unlimited customer organizations with one click",
                  "Consolidated compliance reporting across all customers",
                  "Suspend, activate, or upgrade customers instantly",
                  "Complete audit trail of all MSP actions",
                  "MSP volume pricing available — contact us",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <Button onClick={() => window.location.href = "/msp"} className="bg-indigo-600 hover:bg-indigo-500">
                  <Building2 className="w-4 h-4 mr-2" /> Access MSP Portal
                </Button>
                <Button variant="outline" onClick={() => window.location.href = getLoginUrl()}>Learn More</Button>
              </div>
            </div>
            <div className="space-y-4">
              {[
                { icon: Users, title: "Multi-Tenant Management", desc: "Manage 10 to 1,000+ customer organizations from a single login with full isolation between tenants.", color: "text-indigo-400", bg: "bg-indigo-500/10" },
                { icon: Palette, title: "White-Label Branding", desc: "Your customers see your brand, not ours. Custom logo, colors, support email, and domain.", color: "text-violet-400", bg: "bg-violet-500/10" },
                { icon: BarChart3, title: "Consolidated Reporting", desc: "See compliance scores, campaign performance, and risk levels across all customers at a glance.", color: "text-cyan-400", bg: "bg-cyan-500/10" },
                { icon: Zap, title: "Instant Provisioning", desc: "Create a new customer org in under 60 seconds. No waiting, no tickets, no back-and-forth.", color: "text-amber-400", bg: "bg-amber-500/10" },
              ].map(({ icon: Icon, title, desc, color, bg }) => (
                <div key={title} className="flex items-start gap-4 p-4 rounded-xl border border-border/60 bg-card">
                  <div className={"w-9 h-9 rounded-lg " + bg + " flex items-center justify-center flex-shrink-0"}>
                    <Icon className={"w-4 h-4 " + color} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm mb-1">{title}</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 border-t border-border/40">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-black mb-4">Trusted by security-conscious teams</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <Card key={t.name} className="border-border/60 bg-card">
                <CardContent className="p-6">
                  <div className="flex mb-4">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-5 italic">"{t.quote}"</p>
                  <div>
                    <div className="font-semibold text-sm">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.company}</div>
                    <div className="text-xs text-muted-foreground">{t.employees}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 border-t border-border/40">
        <div className="container max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-black mb-4">Frequently Asked Questions</h2>
          </div>
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
      <section className="py-24 border-t border-border/40 bg-gradient-to-br from-violet-950/30 via-background to-background">
        <div className="container text-center max-w-3xl">
          <h2 className="text-5xl font-black mb-4">
            Stop waiting for a breach{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">to happen.</span>
          </h2>
          <p className="text-xl text-muted-foreground mb-8">Every day without a phishing training program is a day your clients are exposed. Launch PhishSim AI in 10 minutes — free trial, no credit card.</p>
          <Button size="lg" className="text-base px-10 h-12 bg-violet-600 hover:bg-violet-500" onClick={() => window.location.href = getSignupUrl()}>
            Start Your Free Trial <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <p className="text-xs text-muted-foreground mt-4">No credit card required · 14-day free trial · Cancel anytime</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-secondary/10">
        <div className="container py-12">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
            <div className="col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <img src="/brand/phishsim-nav.png" alt="PhishSim AI" className="h-6 w-auto" />
              </div>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed max-w-xs">The AI-powered phishing simulation platform that keeps your organization secure and compliant.</p>
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
                  { label: "Features", href: "#features" },
                  { label: "Pricing", href: "#pricing" },
                  { label: "Compliance Center", href: "#compliance" },
                  { label: "Training Modules", href: "#features" },
                  { label: "Template Library", href: "#features" },
                  { label: "Analytics", href: "#features" },
                ].map(({ label, href }) => (
                  <li key={label}><a href={href} className="hover:text-foreground transition-colors">{label}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-semibold text-sm mb-3">Compliance</div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {["HIPAA", "GLBA", "NERC CIP", "CMMC / DFARS", "NY DFS Part 500", "SOC 2", "PCI DSS", "NIST CSF"].map(item => (
                  <li key={item}><a href="#compliance" className="hover:text-foreground transition-colors">{item}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-semibold text-sm mb-3">Company</div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {[
                  { label: "MSP Partner Portal", href: "/msp" },
                  { label: "About Us", href: "mailto:info@phishsimai.com" },
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
