// Fail the build if a prerendered marketing route has no vercel.json rewrite
// before the SPA catch-all. Missing that rewrite serves /app.html — HTTP 200
// with the homepage shell title (soft-404). That is what #340 looked like on
// /knowbe4-vs and the other cluster URLs until the rewrite list caught up.
export function stripStaticHead(html) {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta name="description"[^>]*>\s*/gi, "")
    .replace(/<link rel="canonical"[^>]*>\s*/gi, "")
    .replace(/<meta property="og:[^"]*"[^>]*>\s*/gi, "")
    .replace(/<meta name="twitter:[^"]*"[^>]*>\s*/gi, "");
}

export function assertPrerenderRewrites(vercel, routes) {
  const rewrites = vercel.rewrites || [];
  const catchAllIdx = rewrites.findIndex((r) => r.destination === "/app.html");
  if (catchAllIdx < 0) {
    throw new Error("SPA catch-all rewrite to /app.html is missing");
  }
  const missing = [];
  for (const route of routes) {
    if (route === "/") continue;
    const covered = rewrites.some((r, i) => {
      if (i >= catchAllIdx) return false;
      if (r.source === route) return true;
      if (route.startsWith("/blog/") && route !== "/blog" && r.source === "/blog/:slug") return true;
      return false;
    });
    if (!covered) missing.push(route);
  }
  if (missing.length) {
    throw new Error(
      `[prerender] no vercel.json rewrite before the SPA catch-all for ${missing.join(", ")} — crawlers get /app.html (homepage title)`,
    );
  }
}
