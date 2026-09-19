// PS-SEO-02: single source of truth for per-route marketing meta. Used by BOTH the client <Seo>
// component (hydration) and the build-time prerender (raw HTML) so the two can never drift. The
// prerender bakes headTags() into the served <head>; helmet re-applies the same values client-side.
import { getPost } from "@/content/blog";
import { getLanding, HOME_FAQS, type SeoFaq } from "@/content/seoLandings";

const SITE = "https://phishsimai.com";
const OG = `${SITE}/brand/phishsim-og-1200x630.png`;
const LOGO = `${SITE}/brand/phishsim-favicon-512.png`;

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
  const landing = getLanding(pathname);
  if (landing) {
    return { title: landing.title, description: landing.description, path: landing.path };
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
    `<meta name="robots" content="index,follow" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${ogImage}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="PhishSim AI" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    `<meta name="twitter:image" content="${ogImage}" />`,
  ].join("\n    ");
}

const script = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "PhishSim AI",
    url: SITE,
    logo: { "@type": "ImageObject", url: LOGO },
    email: "info@phishsimai.com",
    telephone: "+1-443-594-1184",
  };
}

function softwareLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "PhishSim AI",
    applicationCategory: "SecurityApplication",
    operatingSystem: "Web",
    url: SITE,
    description:
      "AI phishing simulation and security awareness training for MSPs and IT teams. Public pricing from $149/mo.",
    offers: {
      "@type": "Offer",
      price: "149.00",
      priceCurrency: "USD",
      url: `${SITE}/pricing`,
    },
    publisher: { "@type": "Organization", name: "PhishSim AI", url: SITE },
  };
}

function faqLd(faq: SeoFaq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

function breadcrumbLd(path: string, name: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE },
      { "@type": "ListItem", position: 2, name, item: `${SITE}${path}` },
    ],
  };
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

// PS-SEO-03 / PS-SEO-05: JSON-LD baked into prerendered <head>.
// Marketing routes get Organization + SoftwareApplication (no review/star schema — we have no reviews).
// Landings + home FAQ get FAQPage. Blog posts keep BlogPosting.
export function jsonLdFor(pathname: string): string {
  const tags: string[] = [script(organizationLd()), script(softwareLd())];

  const slug = blogSlug(pathname);
  if (slug) {
    const post = getPost(slug);
    if (post) {
      const url = `${SITE}/blog/${slug}`;
      const publisher = { "@type": "Organization", name: "PhishSim AI", logo: { "@type": "ImageObject", url: LOGO } };
      tags.push(
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
      );
      if (post.faq?.length) tags.push(script(faqLd(post.faq)));
      tags.push(script(breadcrumbLd(`/blog/${slug}`, post.title)));
      return tags.join("\n    ");
    }
  }

  if (pathname === "/" || pathname.startsWith("/pricing")) {
    tags.push(script(faqLd(HOME_FAQS)));
  }

  if (pathname === "/knowbe4-alternative" || pathname === "/knowbe4") {
    tags.push(script(faqLd(KNOWBE4_FAQ)));
    tags.push(script(breadcrumbLd("/knowbe4-alternative", "KnowBe4 Alternative for MSPs (2026) — Free Trial | PhishSim AI")));
  } else {
    const landing = getLanding(pathname);
    if (landing) {
      if (landing.faq?.length) tags.push(script(faqLd(landing.faq)));
      tags.push(script(breadcrumbLd(landing.path, landing.h1)));
    } else if (pathname === "/trial" || pathname === "/signup" || pathname === "/register") {
      tags.push(script(breadcrumbLd("/trial", "Start your 30-day free trial")));
    } else if (pathname === "/blog" || pathname === "/blog/") {
      tags.push(script(breadcrumbLd("/blog", "Phishing Training Guides")));
    }
  }

  return tags.join("\n    ");
}
