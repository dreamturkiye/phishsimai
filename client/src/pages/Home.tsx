import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import {
  Shield, Mail, BarChart3, BookOpen, Users, Trophy,
  ChevronRight, Check, Zap, Globe, Lock, ArrowRight, Phone, ShieldCheck,
  Target, Brain, Clock
} from "lucide-react";

const features = [
  {
    icon: Mail,
    title: "AI-Powered Phishing Campaigns",
    description: "Generate hyper-realistic phishing emails in English, Spanish, and Turkish using AI. Schedule recurring campaigns with full automation.",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
  },
  {
    icon: Target,
    title: "Department-Based Targeting",
    description: "Organize employees by Finance, Sales, Management, Operations, Warehouse, and custom departments. Target specific groups with tailored simulations.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    icon: BookOpen,
    title: "Security Awareness Training",
    description: "15+ bite-sized training modules covering HIPAA, PCI DSS, GDPR, password hygiene, social engineering, and more — all under 5 minutes.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    icon: BarChart3,
    title: "Real-Time Analytics",
    description: "Track open rates, click rates, credential submissions, and improvement over time. Drill down by department or individual.",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    icon: Trophy,
    title: "Gamification & Risk Scores",
    description: "Optional leaderboards, per-employee risk scores, and an org-wide security posture score. Motivate improvement through healthy competition.",
    color: "text-pink-400",
    bg: "bg-pink-500/10",
  },
  {
    icon: Brain,
    title: "Template Library",
    description: "Browse hundreds of built-in templates or create your own. Share templates with the community or keep them private to your organization.",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
  },
];

const stats = [
  { value: "91%", label: "of breaches start with phishing" },
  { value: "15+", label: "training modules included" },
  { value: "3", label: "languages supported" },
  { value: "5 min", label: "average training duration" },
];

const plans = [
  {
    name: "Starter",
    price: "$49",
    period: "/mo",
    description: "Perfect for small teams getting started with security awareness.",
    features: ["Up to 50 employees", "5 campaigns/month", "Basic analytics", "Email support", "10 training modules"],
    cta: "Start Free Trial",
    highlighted: false,
  },
  {
    name: "Professional",
    price: "$149",
    period: "/mo",
    description: "For growing organizations that need full phishing simulation capabilities.",
    features: ["Up to 500 employees", "Unlimited campaigns", "AI template generator", "Advanced analytics", "All training modules", "Gamification", "Priority support"],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large organizations with advanced compliance and customization needs.",
    features: ["Unlimited employees", "Custom integrations", "Dedicated CSM", "SLA guarantee", "Custom training content", "White-label option", "SAML SSO"],
    cta: "Contact Sales",
    highlighted: false,
  },
];

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">PhishSim AI</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#compliance" className="hover:text-foreground transition-colors">Compliance</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#stats" className="hover:text-foreground transition-colors">Why PhishSim AI</a>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Button onClick={() => navigate("/dashboard")} size="sm">
                Go to Dashboard <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => window.location.href = getLoginUrl()}>
                  Sign In
                </Button>
                <Button size="sm" onClick={() => window.location.href = getLoginUrl()}>
                  Get Started Free
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-24 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute top-1/3 left-1/4 w-[400px] h-[300px] bg-violet-500/5 rounded-full blur-3xl" />
        </div>

        <div className="container relative">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-xs font-medium border border-primary/30 bg-primary/10 text-primary">
              <Zap className="w-3 h-3 mr-1.5" />
              AI-Powered Security Awareness Platform
            </Badge>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-[1.1]">
              Turn your team into your{" "}
              <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
                strongest defense
              </span>
            </h1>

            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              PhishSim AI delivers realistic phishing simulations, AI-generated templates, and bite-sized training modules that measurably reduce your organization's risk of a breach.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="text-base px-8 h-12 shadow-lg shadow-primary/25"
                onClick={() => window.location.href = getLoginUrl()}
              >
                Start Free Trial
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="text-base px-8 h-12 border-border/60 bg-transparent hover:bg-accent"
                onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
              >
                See How It Works
              </Button>
            </div>

            <p className="mt-6 text-sm text-muted-foreground">
              No credit card required &middot; 14-day free trial &middot; Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section id="stats" className="py-16 border-y border-border/50">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-4xl font-bold text-primary mb-2">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Everything you need to build a security-aware culture</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              A complete platform for phishing simulation, security training, and risk measurement — all in one place.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-xl border border-border/60 bg-card hover:border-primary/30 hover:bg-card/80 transition-all duration-200 group"
              >
                <div className={`w-10 h-10 rounded-lg ${feature.bg} flex items-center justify-center mb-4`}>
                  <feature.icon className={`w-5 h-5 ${feature.color}`} />
                </div>
                <h3 className="font-semibold text-base mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-card/30 border-y border-border/50">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Up and running in minutes</h2>
            <p className="text-muted-foreground text-lg">Three steps to a more secure organization.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { step: "01", icon: Users, title: "Import your team", desc: "Upload employees by department. Supports CSV import or manual entry." },
              { step: "02", icon: Mail, title: "Launch a campaign", desc: "Choose a template or let AI generate one. Schedule it once or recurring." },
              { step: "03", icon: BarChart3, title: "Measure & improve", desc: "Track results in real time. Assign training to employees who clicked." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="relative inline-flex mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <item.icon className="w-7 h-7 text-primary" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                    {item.step.slice(1)}
                  </span>
                </div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance / Certification */}
      <section id="compliance" className="py-24 border-t border-border/50">
        <div className="container">

          {/* Section header */}
          <div className="text-center mb-14">
            <Badge variant="outline" className="mb-4 text-xs font-medium border-primary/40 text-primary bg-primary/5">
              Compliance &amp; Certification
            </Badge>
            <h2 className="text-4xl font-bold mb-4">Phishing training is not optional — it's the law</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Five major federal and state regulations <strong className="text-foreground">legally require</strong> organizations in healthcare, finance, energy, defense, and New York to conduct phishing simulation and security awareness training. Non-compliance carries fines, audits, and contract disqualification.
            </p>
          </div>

          {/* MANDATORY ALERT BANNER */}
          <div className="mb-12 rounded-2xl border border-red-500/40 bg-red-500/5 p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <div className="font-bold text-red-400 text-sm uppercase tracking-widest">Legally Mandated Frameworks</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Failure to comply may result in regulatory fines, audit failures, or contract disqualification</div>
                </div>
              </div>
              <div className="md:ml-auto">
                <Button onClick={() => navigate(getLoginUrl())} size="sm" className="bg-red-500 hover:bg-red-600 text-white border-0">
                  Get Compliant Now <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  name: "HIPAA",
                  fullName: "Health Insurance Portability and Accountability Act",
                  citation: "45 CFR §164.308(a)(5)",
                  requirement: "Covered entities must implement security awareness and training programs for all workforce members, including phishing simulation as the industry-standard demonstration of compliance.",
                  sector: "Healthcare",
                  penalty: "Up to $1.9M per violation category",
                },
                {
                  name: "GLBA",
                  fullName: "Gramm-Leach-Bliley Act — Safeguards Rule",
                  citation: "16 CFR Part 314",
                  requirement: "Financial institutions must implement safeguards including employee training on phishing and social engineering as part of a written information security program.",
                  sector: "Financial Services",
                  penalty: "FTC enforcement, civil penalties",
                },
                {
                  name: "NERC CIP",
                  fullName: "NERC Critical Infrastructure Protection",
                  citation: "NERC CIP-004-7 R1",
                  requirement: "Personnel with access to critical infrastructure must complete cybersecurity awareness training including phishing and social engineering attack recognition.",
                  sector: "Energy / Utilities",
                  penalty: "Up to $1M per violation per day",
                },
                {
                  name: "CMMC / DFARS",
                  fullName: "Cybersecurity Maturity Model Certification",
                  citation: "NIST SP 800-171 AT.2.056 / AT.3.058",
                  requirement: "Defense contractors at CMMC Level 2+ must provide security awareness training that includes recognizing and reporting phishing and social engineering threats.",
                  sector: "Defense Contractors",
                  penalty: "Contract disqualification, False Claims Act liability",
                },
                {
                  name: "NY DFS Part 500",
                  fullName: "NY Dept. of Financial Services Cybersecurity Regulation",
                  citation: "23 NYCRR §500.14(b)",
                  requirement: "All covered entities must provide annual cybersecurity awareness training for all personnel, explicitly including phishing and social engineering recognition.",
                  sector: "NY Financial Companies",
                  penalty: "Up to $1M per violation",
                },
              ].map(f => (
                <div key={f.name} className="flex flex-col gap-2 p-4 rounded-xl bg-background/60 border border-red-500/25 hover:border-red-500/50 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-sm text-red-300">{f.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.fullName}</div>
                    </div>
                    <Badge className="text-xs bg-red-500/15 text-red-400 border-red-500/30 flex-shrink-0">REQUIRED</Badge>
                  </div>
                  <div className="text-xs font-mono text-red-400/70 bg-red-500/5 rounded px-2 py-1">{f.citation}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.requirement}</p>
                  <div className="flex items-center gap-1.5 mt-auto pt-1">
                    <Badge variant="outline" className="text-xs border-border/50">{f.sector}</Badge>
                    <span className="text-xs text-red-400/70 ml-auto">{f.penalty}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommended frameworks */}
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-px flex-1 bg-border/50" />
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest px-3">Strongly Recommended / Best Practice</span>
              <div className="h-px flex-1 bg-border/50" />
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { name: "NIST CSF / SP 800-53", desc: "AT-2 and AT-3 controls explicitly cite phishing simulation as a training mechanism", sector: "All Sectors" },
                { name: "SOC 2", desc: "Auditors routinely look for phishing simulation programs as evidence of CC1.4 security awareness controls", sector: "Technology / SaaS" },
                { name: "FTC Safeguards Rule (2023)", desc: "Requires a written information security program including employee training for financial services companies", sector: "Financial Services" },
              ].map(f => (
                <div key={f.name} className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 hover:border-amber-500/40 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{f.name}</div>
                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.desc}</div>
                    <Badge variant="outline" className="mt-2 text-xs border-amber-500/30 text-amber-400 bg-amber-500/5">{f.sector}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Industry-specific */}
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-px flex-1 bg-border/50" />
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-widest px-3">Industry-Specific Requirements</span>
              <div className="h-px flex-1 bg-border/50" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { name: "PCI DSS v4.0", citation: "Requirement 12.6.3", desc: "Explicitly mandates security awareness training that specifically addresses phishing. Organizations processing card payments must comply.", sector: "Payment Processing" },
                { name: "SEC Cybersecurity Rules (2023)", citation: "17 CFR Parts 229 & 249", desc: "Public companies must disclose material cybersecurity incidents and their risk management programs. Phishing training is a commonly cited control in SEC filings.", sector: "Public Companies" },
              ].map(f => (
                <div key={f.name} className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 hover:border-blue-500/40 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{f.name}</div>
                    <div className="text-xs font-mono text-blue-400/70 mt-0.5">{f.citation}</div>
                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.desc}</div>
                    <Badge variant="outline" className="mt-2 text-xs border-blue-500/30 text-blue-400 bg-blue-500/5">{f.sector}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="text-center p-8 rounded-2xl bg-primary/5 border border-primary/20">
            <ShieldCheck className="w-10 h-10 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">One platform. Ten frameworks. Zero guesswork.</h3>
            <p className="text-muted-foreground text-sm mb-6 max-w-lg mx-auto">
              PhishSim AI tracks your compliance posture, generates audit-ready reports, and issues downloadable compliance certificates referencing the exact regulatory citation — all from the same dashboard you use to run phishing campaigns.
            </p>
            <Button onClick={() => navigate(getLoginUrl())} size="lg">
              Get Compliance-Ready <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Simple, transparent pricing</h2>
            <p className="text-muted-foreground text-lg">Start free. Scale as you grow.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative p-8 rounded-2xl border ${
                  plan.highlighted
                    ? "border-primary/50 bg-primary/5 shadow-xl shadow-primary/10"
                    : "border-border/60 bg-card"
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground px-3 py-0.5 text-xs font-medium">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="font-bold text-lg mb-1">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-3">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground text-sm">{plan.period}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className="w-full"
                  variant={plan.highlighted ? "default" : "outline"}
                  onClick={() => window.location.href = getLoginUrl()}
                >
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-card/30 border-t border-border/50">
        <div className="container text-center">
          <div className="max-w-2xl mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-4xl font-bold mb-4">Ready to protect your organization?</h2>
            <p className="text-muted-foreground text-lg mb-8">
              Join thousands of organizations that use PhishSim AI to build a security-aware workforce.
            </p>
            <Button
              size="lg"
              className="text-base px-10 h-12 shadow-lg shadow-primary/25"
              onClick={() => window.location.href = getLoginUrl()}
            >
              Start Your Free Trial
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-border/50">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                <Shield className="w-3 h-3 text-primary-foreground" />
              </div>
              <span className="font-semibold text-sm">PhishSim AI</span>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4 text-xs text-muted-foreground">
              <a href="https://www.phishsimai.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                <Globe className="w-3 h-3" />
                www.phishsimai.com
              </a>
              <span className="hidden sm:inline text-border">|</span>
              <a href="tel:+14435941184" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                <Phone className="w-3 h-3" />
                443-594-1184
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} PhishSim AI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
