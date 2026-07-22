import { Helmet } from "react-helmet-async";

// PS-SEO-01 (P1): per-route meta. NOTE — react-helmet-async writes these tags CLIENT-SIDE after
// hydration. Crawlers that read the raw HTML before running JS (social unfurlers, and Google's
// first pass) will NOT see them until the marketing routes are PRERENDERED (P2). This component is
// the source of the tags; P2 is what puts them in the served HTML. Proven by curling the deployed
// routes — see the P1 report.
const SITE = "https://phishsimai.com";
const DEFAULT_OG = `${SITE}/brand/phishsim-og-1200x630.png`;

export function Seo({
  title,
  description,
  path,
  ogImage = DEFAULT_OG,
}: {
  title: string;
  description: string;
  path: string; // canonical path, e.g. "/" or "/pricing"
  ogImage?: string;
}) {
  const url = `${SITE}${path === "/" ? "" : path}`;
  return (
    <Helmet prioritizeSeoTags>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  );
}
