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
        <p className="text-muted-foreground mb-10">
          Phishing training, KnowBe4 alternatives, and compliance — practical guides for MSPs and IT teams.
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
