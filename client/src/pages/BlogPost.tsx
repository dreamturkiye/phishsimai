import { useRoute } from "wouter";
import { Seo } from "@/components/Seo";
import { SeoTrialFooter, SeoTrialHeader } from "@/components/SeoTrialChrome";
import { BLOG_POSTS, getPost } from "@/content/blog";

// PS-SEO-03: renders a markdown blog post. Meta comes from <Seo> (client) and the prerender bakes
// the same values + BlogPosting/FAQPage JSON-LD into raw HTML (see scripts/prerender.mjs).
export default function BlogPost() {
  const [, params] = useRoute("/blog/:slug");
  const post = params?.slug ? getPost(params.slug) : undefined;

  if (!post) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Post not found</h1>
          <a href="/" className="text-primary underline">Back to PhishSim AI</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Seo title={post.title} description={post.description} path={`/blog/${post.slug}`} />
      <SeoTrialHeader campaign={post.slug} />
      <article className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">{post.title}</h1>
        <p className="text-sm text-muted-foreground mb-8">
          PhishSim AI · <time dateTime={post.datePublished}>{new Date(post.datePublished + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</time>
        </p>
        <div
          className="prose prose-invert prose-headings:font-semibold prose-a:text-primary max-w-none [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_p]:leading-relaxed [&_p]:my-4 [&_ul]:my-4 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:my-4 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:my-1 [&_strong]:text-foreground [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:my-6 [&_blockquote]:text-muted-foreground [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
        />
        <nav className="mt-10" aria-label="Related phishing training guides">
          <h2 className="text-xl font-semibold mb-3">Related phishing training guides</h2>
          <ul className="space-y-2 text-sm">
            <li>
              <a className="text-violet-300 hover:underline" href="/knowbe4-alternative">
                KnowBe4 alternative for MSPs — start a free trial
              </a>
            </li>
            <li>
              <a className="text-violet-300 hover:underline" href="/phishing-simulation-software">
                Phishing simulation software
              </a>
            </li>
            <li>
              <a className="text-violet-300 hover:underline" href="/phishing-training-for-msps">
                Phishing training for MSPs
              </a>
            </li>
            {BLOG_POSTS.filter((p) => p.slug !== post.slug).slice(0, 4).map((p) => (
              <li key={p.slug}>
                <a className="text-violet-300 hover:underline" href={`/blog/${p.slug}`}>{p.title}</a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="mt-6 text-sm">
          <a href="/trial?utm_source=seo&utm_medium=web&utm_campaign=blog_post" className="text-violet-400 hover:underline font-medium">Start free trial →</a>
        </p>
        <SeoTrialFooter campaign={post.slug} />
      </article>
    </div>
  );
}
