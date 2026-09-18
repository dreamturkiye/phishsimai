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
      title: "PhishSim AI Blog - Phishing Simulation & MSP Security Guides",
      description: "Guides on phishing simulation, security awareness training, cyber insurance requirements, and MSP security, from the PhishSim AI team.",
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
  const landing = getLanding(pathname);
  if (landing) {
    return { title: landing.title, description: landing.description, path: landing.path };
  }
  return {
    title: "PhishSim AI — AI Phishing Simulation & Security Awareness for MSPs",
    description: "Run AI-generated phishing simulations, training, and compliance reporting for your clients in minutes. Built for MSPs and IT teams — no security engineer required. 30-day free trial.",
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

  const landing = getLanding(pathname);
  if (landing) {
    if (landing.faq?.length) tags.push(script(faqLd(landing.faq)));
    tags.push(script(breadcrumbLd(landing.path, landing.h1)));
  } else if (pathname === "/trial" || pathname === "/signup" || pathname === "/register") {
    tags.push(script(breadcrumbLd("/trial", "Start your 30-day free trial")));
  } else if (pathname === "/blog" || pathname === "/blog/") {
    tags.push(script(breadcrumbLd("/blog", "Blog")));
  }

  return tags.join("\n    ");
}
