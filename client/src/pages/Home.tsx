import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Seo } from "@/components/Seo";
import { seoForPath } from "@/lib/seoMeta";
import { Button } from "@/components/ui/button";
import { getLoginUrl, getSignupUrl } from "@/const";
import { ArrowRight, Check, ChevronRight, Menu, X } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
//  Agency visual redesign — MSP/MSSP only. Sparse, visual, product-site restraint.
//  Structure: Nav → Hero (Learning Moment visual) → Three outcomes → 2 visual bands →
//  Integrations strip → Pricing → Final CTA → Footer. Near-black page; all product visuals
//  are transparent SVGs that float (no studio mats) and mask-fade into the page.
//  Deliberately NO feature-card grid, NO compliance essay, NO FAQ wall.
//
//  HONESTY (preserved): no fabricated testimonials / customer counts; no "cancel anytime"
//  (no live Stripe billing portal); no custom-domain white-label (deferred); CW/Halo are
//  "available … when connected and mapped", never live-verified; ~100 curated templates,
//  never "unlimited AI".
// ─────────────────────────────────────────────────────────────────────────────

const OUTCOMES = [
  { title: "Live in minutes", line: "Stand up a client without an implementation project." },
  { title: "Quiet service desk", line: "Simulations never open PSA tickets; real reports can." },
  { title: "Ready for QBRs & insurers", line: "Human Risk Score and evidence pack under your brand." },
];

// Learning Moments is the hero visual, so the bands below are the other two product chapters.
const BANDS = [
  {
    img: "/brand/panel-msp-clients.svg",
    alt: "A multi-tenant console managing many client organizations",
    title: "Every client, one practice",
    copy: "A multi-tenant console, an allowlist wizard, and ~100 realistic templates. Run the same playbook across your entire book of business.",
  },
  {
    img: "/brand/panel-evidence.svg",
    alt: "A cyber-insurance evidence report with a compliance seal",
    title: "Proof carriers and clients want",
    copy: "One-click, insurance-style evidence and compliance certificates — white-labeled and ready to put in front of a client or broker.",
  },
];

const PLANS = [
  // PS-PRICE-05: prices are Stripe's ($149/$299/$749/$1499). Seats are the founder matrix.
  { name: "Starter", price: "$149", per: "$1.49/user", who: "Your first managed client.", features: ["1 client organization", "100 users", "100 simulations / mo", "Training + compliance reporting", "Email support"], cta: "Start Free Trial", highlight: false },
  { name: "Growth", price: "$299", per: "$0.60/user", who: "Five clients, one dashboard.", features: ["5 client organizations", "500 users", "500 simulations / mo", "Risk scoring & analytics", "Insurance evidence pack"], cta: "Start Free Trial", highlight: true, badge: "Most popular" },
  { name: "Pro", price: "$749", per: "$0.30/user", who: "Run 20 clients without adding headcount.", features: ["20 client organizations", "2,500 users", "Unlimited simulations", "ConnectWise & Halo PSA ticketing", "White-label branding + API"], cta: "Start Free Trial", highlight: false },
  { name: "Enterprise", price: "$1,499", per: "$0.15/user", who: "Ten thousand seats, your brand.", features: ["Unlimited client organizations", "10,000 users", "Custom training + frameworks", "White-label reporting", "Dedicated account manager"], cta: "Contact Sales", highlight: false },
];

const COMPARE = [
  { feature: "Client organizations", starter: "1", growth: "5", pro: "20", enterprise: "Unlimited" },
  { feature: "Users included", starter: "100", growth: "500", pro: "2,500", enterprise: "10,000" },
  { feature: "Simulations", starter: "100/mo", growth: "500/mo", pro: "Unlimited", enterprise: "Unlimited" },
  { feature: "Learning Moments + auto-remediation", starter: true, growth: true, pro: true, enterprise: true },
  { feature: "ConnectWise & Halo PSA ticketing", starter: false, growth: false, pro: true, enterprise: true },
  { feature: "Human Risk Score (QBR)", starter: false, growth: "Basic", pro: "Advanced", enterprise: "Enterprise" },
  { feature: "Insurance evidence pack", starter: false, growth: true, pro: true, enterprise: "White label" },
  { feature: "White-label branding", starter: false, growth: false, pro: true, enterprise: true },
];

export default function Home() {
  const [menu, setMenu] = useState(false);
  const [location] = useLocation();
  const seo = seoForPath(location); // PS-SEO-02: shared with the prerender so raw HTML == hydrated
  const signup = () => (window.location.href = getSignupUrl());

  // Subtle scroll reveal — client-only, flash-free (above-the-fold elements are never hidden),
  // and fully degraded for no-JS / reduced-motion. See index.css.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("reveal-in"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight - 40) return; // in view → leave visible
      el.classList.add("reveal-init");
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  const NAV = [
    { label: "Product", href: "#product" },
    { label: "Pricing", href: "#pricing" },
    { label: "Partner Portal", href: "/msp" },
  ];

  return (
    <div className="min-h-screen text-foreground antialiased" style={{ backgroundColor: "#050505" }}>
      <Seo title={seo.title} description={seo.description} path={seo.path} />

      {/* 0 — Nav */}
      <header className="border-b border-white/5 bg-[#050505]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <img src="/brand/phishsim-nav.png" alt="PhishSim AI" className="h-8 w-auto" />
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            {NAV.map(({ label, href }) => (
              <a key={label} href={href} className="hover:text-foreground transition-colors">{label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => (window.location.href = getLoginUrl())}>Sign in</Button>
              <Button size="sm" onClick={signup}>Start free trial <ChevronRight className="w-3.5 h-3.5 ml-1" /></Button>
            </div>
            <Button variant="ghost" size="sm" className="md:hidden p-2" onClick={() => setMenu(!menu)}>
              {menu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
        {menu && (
          <div className="md:hidden border-t border-white/5 bg-[#050505]/95 backdrop-blur-sm px-4 py-4 flex flex-col gap-1">
            {NAV.map(({ label, href }) => (
              <a key={label} href={href} onClick={() => setMenu(false)} className="text-sm text-muted-foreground hover:text-foreground py-3 border-b border-white/5 last:border-0">{label}</a>
            ))}
            <div className="flex flex-col gap-2 pt-3">
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => (window.location.href = getLoginUrl())}>Sign in</Button>
              <Button size="sm" className="w-full" onClick={signup}>Start free trial</Button>
            </div>
          </div>
        )}
      </header>

      {/* 1 — Hero */}
      <section id="product" className="relative overflow-hidden border-b border-white/5">
        {/* Atmosphere: a single restrained violet glow, no gradient soup */}
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60rem 40rem at 78% -10%, rgba(124,92,255,0.16), transparent 60%)" }} />
        <div className="container relative py-20 md:py-28 lg:py-32">
          <div className="grid lg:grid-cols-[45%_55%] gap-14 lg:gap-16 items-center">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300/90 mb-5">For MSPs &amp; MSSPs</div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.06] mb-6">
                Phishing simulations for every client — from one console.
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-xl">
                Multi-tenant campaigns, Learning Moments, and desk-friendly reporting into ConnectWise &amp; Halo. Flat pricing built for margin.
              </p>
              <div>
                <Button size="lg" className="text-base px-7 h-12" onClick={signup}>Start free 30-day trial <ArrowRight className="w-4 h-4 ml-2" /></Button>
              </div>
              <p className="text-xs text-muted-foreground mt-5">No credit card · About 10 minutes to first campaign</p>
            </div>
            <div className="relative">
              <img
                src="/brand/hero-learning-moment.svg"
                alt="Phishing simulation email with an instant Learning Moment tip card"
                className="w-full"
                width={1200} height={760} loading="eager" decoding="async"
                style={{ WebkitMaskImage: "linear-gradient(to bottom, #000 74%, transparent 100%)", maskImage: "linear-gradient(to bottom, #000 74%, transparent 100%)" }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2 — Three outcomes */}
      <section className="border-b border-white/5">
        <div className="container py-16 md:py-20">
          <div className="grid md:grid-cols-3 gap-10 md:gap-14">
            {OUTCOMES.map((o) => (
              <div key={o.title} data-reveal className="border-t border-white/10 pt-5">
                <h3 className="text-lg font-semibold mb-1.5">{o.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{o.line}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 — Visual product chapters */}
      <section className="container py-8 md:py-12">
        {BANDS.map((b, i) => (
          <div key={b.title} data-reveal className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center py-16 md:py-24">
            <div className={"relative " + (i % 2 ? "lg:order-2" : "")}>
              <img src={b.img} alt={b.alt} loading="lazy" decoding="async" width={1200} height={760}
                className="w-full aspect-[16/10] object-contain"
                style={{ WebkitMaskImage: "linear-gradient(to bottom, #000 76%, transparent 100%)", maskImage: "linear-gradient(to bottom, #000 76%, transparent 100%)" }} />
            </div>
            <div className={"max-w-md " + (i % 2 ? "lg:order-1" : "")}>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">{b.title}</h2>
              <p className="text-muted-foreground text-lg leading-relaxed">{b.copy}</p>
            </div>
          </div>
        ))}
      </section>

      {/* 4 — Integrations strip */}
      <section className="border-y border-white/5">
        <div className="container py-10 md:py-12">
          <div data-reveal className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
            <div className="text-sm font-semibold whitespace-nowrap">ConnectWise Manage · Halo PSA</div>
            <div className="hidden md:block h-4 w-px bg-white/10" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Real phishing reports can open tickets when connected and mapped. Simulation reports are scored only.
            </p>
          </div>
        </div>
      </section>

      {/* 5 — Pricing */}
      <section id="pricing" className="border-b border-white/5">
        <div className="container py-20 md:py-28">
          <div className="max-w-xl mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">Flat pricing, built for margin.</h2>
            <p className="text-muted-foreground text-lg">Priced per MSP — never per seat — so your margin grows with your client list. Every plan includes a 30-day free trial, no credit card.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLANS.map((p) => (
              <div key={p.name} className={"rounded-2xl border p-6 flex flex-col relative " + (p.highlight ? "border-violet-500/40 bg-violet-500/[0.05]" : "border-white/10 bg-white/[0.02]")}>
                {p.badge && <div className="absolute -top-3 left-6 text-[11px] font-semibold uppercase tracking-wide bg-violet-600 text-white rounded-full px-3 py-1">{p.badge}</div>}
                <div className="font-semibold text-lg">{p.name}</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{p.price}</span><span className="text-muted-foreground text-sm">/mo</span>
                </div>
                <div className="text-xs text-violet-400 font-medium mt-1">{p.per}</div>
                <p className="text-sm text-muted-foreground mt-3 mb-5">{p.who}</p>
                <ul className="space-y-2.5 mb-6 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />{f}
                    </li>
                  ))}
                </ul>
                <Button variant={p.highlight ? "default" : "outline"} className="w-full" onClick={() => p.cta === "Contact Sales" ? (window.location.href = "mailto:sales@phishsimai.com?subject=Enterprise%20Inquiry") : signup()}>{p.cta}</Button>
              </div>
            ))}
          </div>

          <details className="mt-8 group max-w-6xl">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 select-none">
              <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" /> Compare all plans
            </summary>
            <div className="overflow-x-auto rounded-2xl border border-white/10 mt-4">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-white/10 bg-secondary/30">
                    <th className="text-left p-4 font-semibold">Feature</th>
                    <th className="p-4 font-semibold">Starter</th>
                    <th className="p-4 font-semibold text-violet-400">Growth</th>
                    <th className="p-4 font-semibold">Pro</th>
                    <th className="p-4 font-semibold">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((row, i) => (
                    <tr key={row.feature} className={"border-b border-white/5 last:border-0 " + (i % 2 ? "bg-secondary/10" : "")}>
                      <td className="p-4 text-muted-foreground">{row.feature}</td>
                      {([row.starter, row.growth, row.pro, row.enterprise] as (string | boolean)[]).map((cell, j) => (
                        <td key={j} className={"p-4 text-center " + (j === 1 ? "bg-violet-500/5" : "")}>
                          {cell === false ? <span className="text-muted-foreground/40">—</span> : cell === true ? <Check className="w-4 h-4 text-violet-400 mx-auto" /> : <span className="font-medium">{cell}</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </section>

      {/* 6 — Final CTA */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(50rem 30rem at 50% 120%, rgba(124,92,255,0.14), transparent 60%)" }} />
        <div className="container relative py-24 md:py-32 text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight max-w-2xl mx-auto mb-8">Run phishing awareness across your clients this week.</h2>
          <Button size="lg" className="text-base px-8 h-12" onClick={signup}>Start free 30-day trial <ArrowRight className="w-4 h-4 ml-2" /></Button>
          <p className="text-xs text-muted-foreground mt-4">No credit card required</p>
        </div>
      </section>

      {/* 7 — Footer */}
      <footer className="border-t border-white/5">
        <div className="container py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <img src="/brand/phishsim-nav.png" alt="PhishSim AI" className="h-6 w-auto" />
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <a href="#product" className="hover:text-foreground transition-colors">Product</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="/msp" className="hover:text-foreground transition-colors">Partner Portal</a>
            <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-foreground transition-colors">Terms</a>
            <a href="mailto:support@phishsimai.com" className="hover:text-foreground transition-colors">Support</a>
          </div>
          <span className="text-xs text-muted-foreground">© {new Date().getFullYear()} PhishSim AI</span>
        </div>
      </footer>
    </div>
  );
}
