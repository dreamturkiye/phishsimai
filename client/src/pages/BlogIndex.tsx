import { Seo } from "@/components/Seo";
import { SeoTrialHeader } from "@/components/SeoTrialChrome";
import { seoForPath } from "@/lib/seoMeta";
import { BLOG_POSTS } from "@/content/blog";

// PS-SEO-04: blog index hub. Prerendered (registered in prerender.tsx ROUTES and auto-added to the
// sitemap), it gives crawlers and readers a single entry point and strengthens internal linking to
// every post.
export default function BlogIndex() {
  const seo = seoForPath("/blog");
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Seo
        title={seo.title}
        description={seo.description}
        path={seo.path}
      />
      <SeoTrialHeader campaign="blog_index" />
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">Phishing training & simulation guides</h1>
        <p className="text-muted-foreground mb-6">
          Phishing training, KnowBe4 alternatives, and compliance — practical guides for MSPs and IT teams.
        </p>
        <p className="text-sm text-muted-foreground mb-10">
          <a href="/trial?utm_source=seo&utm_medium=web&utm_campaign=blog_index" className="text-violet-400 hover:underline">Start a 30-day free trial</a>
          {" · "}
          <a href="/knowbe4-alternative" className="hover:underline">KnowBe4 alternative</a>
          {" · "}
          <a href="/phishing-simulation-software" className="hover:underline">Phishing simulation software</a>
          {" · "}
          <a href="/phishing-training-for-msps" className="hover:underline">Phishing training for MSPs</a>
        </p>
        <div className="space-y-6">
          {BLOG_POSTS.map((p) => (
            <a
              key={p.slug}
              href={`/blog/${p.slug}`}
              className="block rounded-xl border border-border/50 p-6 hover:border-primary/50 transition-colors"
            >
              <p className="text-xs text-muted-foreground mb-2">
                {new Date(p.datePublished + "T00:00:00Z").toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </p>
              <h2 className="text-xl font-semibold mb-2">{p.title}</h2>
              <p className="text-muted-foreground">{p.description}</p>
              <span className="inline-block mt-3 text-sm text-primary">Read -&gt;</span>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
