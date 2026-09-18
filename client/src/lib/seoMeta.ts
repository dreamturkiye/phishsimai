// PS-SEO-02: single source of truth for per-route marketing meta. Used by BOTH the client <Seo>
// component (hydration) and the build-time prerender (raw HTML) so the two can never drift. The
// prerender bakes headTags() into the served <head>; helmet re-applies the same values client-side.
import { getPost } from "@/content/blog";

const SITE = "https://phishsimai.com";
const OG = `${SITE}/brand/phishsim-og-1200x630.png`;

export interface RouteMeta {
  title: string;
  description: string;
  path: string;
}

function blogSlug(pathname: string): string | null {
  if (!pathname.startsWith("/blog/")) return null;
  return pathname.slice("/blog/".length).replace(/\/$/, "") || null;
}

export function seoForPath(pathname: string): RouteMeta {
  const slug = blogSlug(pathname);
  if (slug) {
    const post = getPost(slug);
    if (post) return { title: post.title, description: post.description, path: `/blog/${slug}` };
  }
  if (pathname === "/blog" || pathname === "/blog/") {
    return {
      title: "Phishing Training Guides for MSPs — PhishSim AI Blog",
      description: "Phishing training and simulation guides for MSPs: KnowBe4 alternatives, HIPAA, cyber insurance, Microsoft 365 allowlisting. 30-day free trial.",
      path: "/blog",
    };
  }
  if (pathname.startsWith("/pricing")) {
    return {
      title: "PhishSim AI Pricing — MSP Phishing Simulation from $149/mo",
      description: "Transparent per-seat pricing for MSPs: Starter $149, Growth $299, Pro $749, Enterprise $1,499/mo. AI phishing simulations, training, and compliance reporting. 30-day free trial, no card required.",
      path: "/pricing",
    };
  }
  if (pathname.startsWith("/privacy")) {
    return {
      title: "Privacy Policy — PhishSim AI",
      description: "How PhishSim AI collects, uses, and protects data for phishing simulation and security-awareness training.",
      path: "/privacy",
    };
  }
  if (pathname.startsWith("/terms")) {
    return {
      title: "Terms of Service — PhishSim AI",
      description: "The terms governing use of PhishSim AI's phishing simulation and security-awareness platform.",
      path: "/terms",
    };
  }
  if (pathname === "/trial" || pathname === "/signup" || pathname === "/register") {
    return {
      title: "Start your 30-day free trial — PhishSim AI",
      description: "Full access for 30 days. No credit card. 60¢/user, $299/mo for 500 seats. Live in 10 minutes.",
      path: "/trial",
    };
  }
  if (pathname === "/knowbe4-alternative" || pathname === "/knowbe4" || pathname.startsWith("/knowbe4-alternative")) {
    return {
      title: "KnowBe4 Alternative for MSPs (2026) — Free Trial | PhishSim AI",
      description: "KnowBe4 alternative for MSPs and small teams: phishing training + simulations, 60¢/user, $299/mo for 500 seats, 30-day free trial, no credit card. Live in 10 minutes.",
      path: "/knowbe4-alternative",
    };
  }
  return {
    title: "Phishing Training & Simulation for MSPs — PhishSim AI",
    description: "Phishing training and AI simulations for MSPs. KnowBe4 alternative for small teams: 60¢/user, $299/500, 30-day free trial, no card. Live in 10 minutes.",
    path: "/",
  };
}

/** The full <head> SEO block for a route — injected verbatim by the prerender script. */
export function headTags(m: RouteMeta, ogImage: string = OG): string {
  const url = `${SITE}${m.path === "/" ? "" : m.path}`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${ogImage}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    `<meta name="twitter:image" content="${ogImage}" />`,
  ].join("\n    ");
}

// PS-SEO-03: JSON-LD for a route — baked into the prerendered <head> so it's in the raw HTML (not
// JS-only). Blog posts get BlogPosting; the cyber-insurance post also gets FAQPage from its Q&As.
export const KNOWBE4_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Is PhishSim AI a KnowBe4 alternative?",
    a: "For MSPs and small teams that need simulations, phishing training, and reportable logs without a procurement cycle, yes. KnowBe4 remains a defensible choice for large enterprise security orgs that need its depth and have the budget.",
  },
  {
    q: "How does PhishSim AI pricing compare to KnowBe4?",
    a: "PhishSim AI Growth is $299/mo for 500 users (60¢ each) with a 30-day free trial and no credit card. KnowBe4 is typically sold as enterprise SKUs with per-seat minimums and a demo-gated eval.",
  },
  {
    q: "How fast can we start phishing training?",
    a: "About 10 minutes, self-serve: sign up, import a list, launch the first simulation. No onboarding call or sales gate.",
  },
];

export function jsonLdFor(pathname: string): string {
  const script = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
  const publisher = { "@type": "Organization", name: "PhishSim AI", logo: { "@type": "ImageObject", url: `${SITE}/brand/phishsim-favicon-512.png` } };

  if (pathname === "/knowbe4-alternative" || pathname === "/knowbe4") {
    return [
      script({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "KnowBe4 Alternative for MSPs (2026) — Free Trial | PhishSim AI",
        description: "Honest KnowBe4 alternative for MSPs and small teams: 60¢/user, $299/mo for 500 seats, 30-day free trial, no credit card.",
        url: `${SITE}/knowbe4-alternative`,
        publisher,
      }),
      script({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: KNOWBE4_FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }),
    ].join("\n    ");
  }

  const slug = blogSlug(pathname);
  if (!slug) return "";
  const post = getPost(slug);
  if (!post) return "";
  const url = `${SITE}/blog/${slug}`;
  const tags = [
    script({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      url,
      mainEntityOfPage: url,
      datePublished: post.datePublished,
      dateModified: post.datePublished,
      image: OG,
      author: { "@type": "Organization", name: "PhishSim AI" },
      publisher,
    }),
  ];
  if (post.faq?.length) {
    tags.push(
      script({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: post.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      }),
    );
  }
  return tags.join("\n    ");
}
