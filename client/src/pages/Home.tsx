import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import {
  Shield, Mail, BarChart3, BookOpen, Users, Trophy,
  ChevronRight, Check, Zap, Globe, Lock, ArrowRight, Phone,
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
