import { useRoute } from "wouter";
import { Seo } from "@/components/Seo";
import { getPost } from "@/content/blog";
import { Shield } from "lucide-react";

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
      <header className="border-b border-border/50">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-semibold"><Shield className="w-5 h-5 text-primary" /> PhishSim AI</a>
          <a href="/pricing" className="text-sm text-muted-foreground hover:text-foreground">Pricing</a>
        </div>
      </header>
      <article className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">{post.title}</h1>
        <p className="text-sm text-muted-foreground mb-8">
          PhishSim AI · <time dateTime={post.datePublished}>{new Date(post.datePublished + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</time>
        </p>
        <div
          className="prose prose-invert prose-headings:font-semibold prose-a:text-primary max-w-none [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_p]:leading-relaxed [&_p]:my-4 [&_ul]:my-4 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:my-4 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:my-1 [&_strong]:text-foreground [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:my-6 [&_blockquote]:text-muted-foreground [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
        />
      </article>
    </div>
  );
}
