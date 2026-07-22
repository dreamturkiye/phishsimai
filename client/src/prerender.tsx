// PS-SEO-02 (P2): build-time prerender entry. renderToString each marketing route to static HTML
// with react-helmet-async's meta extracted, so the SERVED HTML carries per-page title/description/
// canonical/og WITHOUT executing JS (the P1 proof showed client-only meta is invisible to crawlers).
// Marketing pages only — SSR-safe (window.* is confined to onClick handlers). App/auth routes are
// untouched and stay pure SPA.
import { renderToString } from "react-dom/server";
import { HelmetProvider } from "react-helmet-async";
import { Router } from "wouter";
import Home from "./pages/Home";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import { seoForPath, headTags } from "./lib/seoMeta";

// / and /pricing share the Home component (route-aware meta lives inside it).
const ROUTES: Record<string, React.ComponentType> = {
  "/": Home,
  "/pricing": Home,
  "/privacy": PrivacyPolicy,
  "/terms": TermsOfService,
};

export const PRERENDER_ROUTES = Object.keys(ROUTES);

export function render(route: string): { html: string; head: string } {
  const Comp = ROUTES[route];
  if (!Comp) throw new Error(`No prerender component registered for ${route}`);
  const html = renderToString(
    <HelmetProvider context={{}}>
      <Router ssrPath={route}>
        <Comp />
      </Router>
    </HelmetProvider>,
  );
  // Head comes from the shared, deterministic meta map — not helmet's SSR extraction (which is
  // brittle). Same source the client <Seo> uses, so raw HTML and hydrated DOM agree.
  const head = headTags(seoForPath(route));
  return { html, head };
}
