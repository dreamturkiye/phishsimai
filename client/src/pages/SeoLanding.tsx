import { useLocation } from "wouter";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { getLanding, trialHref, TRIAL_OFFER, CLUSTER_NAV } from "@/content/seoLandings";
import { ArrowRight, Check, Shield } from "lucide-react";

/**
 * PS-SEO-05: prerendered commercial landing. SSR-safe (no window). Trial CTAs are
 * crawlable <a href> — Google does not see onClick-only buttons.
 */
export default function SeoLanding() {
  const [location] = useLocation();
  const page = getLanding(location);

  if (!page || page.hub) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Page not found</h1>
          <a href="/" className="text-primary underline">Back to PhishSim AI</a>
        </div>
      </div>
    );
  }

  const trial = trialHref(page.campaign);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Seo title={page.title} description={page.description} path={page.path} />
      <header className="border-b border-border/50">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-semibold">
            <Shield className="w-5 h-5 text-primary" /> PhishSim AI
          </a>
          <div className="flex items-center gap-4 text-sm">
            <a href="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</a>
            <a href="/blog" className="text-muted-foreground hover:text-foreground">Blog</a>
            <a href={trial} className="text-violet-400 hover:text-violet-300 font-medium">Free trial</a>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-400 mb-3">{page.eyebrow}</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-4">{page.h1}</h1>
        <p className="text-muted-foreground leading-relaxed mb-8">{page.lede}</p>

        <Button asChild className="h-11 bg-violet-600 hover:bg-violet-500 mb-10">
          <a href={trial}>
            Start 30-day free trial <ArrowRight className="w-4 h-4 ml-2" />
          </a>
        </Button>
        <p className="mb-10 -mt-7 text-xs text-muted-foreground">{TRIAL_OFFER}</p>

        {page.table && (
          <div className="overflow-x-auto rounded-xl border border-border/60 mb-10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-secondary/20">
                  {page.table.headers.map((h) => (
                    <th key={h || "dim"} className="text-left p-3 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.table.rows.map((r) => (
                  <tr key={r.label} className="border-b border-border/40 last:border-0">
                    <td className="p-3 font-medium">{r.label}</td>
                    <td className="p-3">{r.us}</td>
                    <td className="p-3 text-muted-foreground">{r.them}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {page.sections.map((s) => (
          <section key={s.h2} className="mb-10">
            <h2 className="text-xl font-semibold mb-3">{s.h2}</h2>
            {s.paragraphs.map((p) => (
              <p key={p.slice(0, 48)} className="text-muted-foreground leading-relaxed mb-3">{p}</p>
            ))}
            {s.bullets && (
              <ul className="space-y-2 text-sm text-muted-foreground mt-3">
                {s.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Frequently asked questions</h2>
          <dl className="space-y-5">
            {page.faq.map((f) => (
              <div key={f.q}>
                <dt className="font-medium mb-1">{f.q}</dt>
                <dd className="text-sm text-muted-foreground leading-relaxed">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-xl border border-violet-500/30 bg-violet-950/20 p-6 mb-10">
          <h2 className="text-lg font-semibold mb-2">Try the product, not a demo theater</h2>
          <p className="text-sm text-muted-foreground mb-4">{TRIAL_OFFER}</p>
          <Button asChild className="h-11 bg-violet-600 hover:bg-violet-500">
            <a href={trial}>
              Start 30-day free trial <ArrowRight className="w-4 h-4 ml-2" />
            </a>
          </Button>
        </section>

        <nav aria-label="Related guides" className="text-sm">
          <p className="font-semibold mb-2">Related</p>
          <ul className="space-y-1.5 text-muted-foreground">
            {page.related.map((r) => (
              <li key={r.href}><a href={r.href} className="hover:text-foreground underline-offset-2 hover:underline">{r.label}</a></li>
            ))}
            {CLUSTER_NAV.filter((l) => l.href !== page.path && !page.related.some((r) => r.href === l.href)).slice(0, 2).map((l) => (
              <li key={l.href}><a href={l.href} className="hover:text-foreground underline-offset-2 hover:underline">{l.label}</a></li>
            ))}
          </ul>
        </nav>
      </main>
    </div>
  );
}
