// PS-SEO-02: single source of truth for per-route marketing meta. Used by BOTH the client <Seo>
// component (hydration) and the build-time prerender (raw HTML) so the two can never drift. The
// prerender bakes headTags() into the served <head>; helmet re-applies the same values client-side.
const SITE = "https://phishsimai.com";
const OG = `${SITE}/brand/phishsim-og-1200x630.png`;

export interface RouteMeta {
  title: string;
  description: string;
  path: string;
}

export function seoForPath(pathname: string): RouteMeta {
  if (pathname.startsWith("/pricing")) {
    return {
      title: "PhishSim AI Pricing — MSP Phishing Simulation from $149/mo",
      description: "Transparent per-seat pricing for MSPs: Starter $149, Growth $299, Pro $749, Enterprise $1,499/mo. AI phishing simulations, training, and compliance reporting. 14-day free trial, no card required.",
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
  return {
    title: "PhishSim AI — AI Phishing Simulation & Security Awareness for MSPs",
    description: "Run AI-generated phishing simulations, training, and compliance reporting for your clients in minutes. Built for MSPs and IT teams — no security engineer required. 14-day free trial.",
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
