// PS-SEO-03: generate sitemap.xml from the exact prerendered route set (marketing pages + every
// blog post), so the sitemap can never drift from what's actually crawlable again. Runs right after
// scripts/prerender.mjs in the build and overwrites the copied static sitemap in dist/public.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "dist", "public");
const ssrEntry = path.join(root, "dist", "prerender", "prerender.js");

const { PRERENDER_ROUTES } = await import(pathToFileURL(ssrEntry).href);

const SITE = "https://phishsimai.com";
const today = new Date().toISOString().slice(0, 10);
const priority = (r) => (r === "/" ? "1.0" : r.startsWith("/blog/") ? "0.8" : "0.6");
const changefreq = (r) => (r === "/" ? "weekly" : "monthly");

const body = PRERENDER_ROUTES
  .map((r) =>
    `  <url>\n    <loc>${SITE}${r === "/" ? "" : r}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${changefreq(r)}</changefreq>\n    <priority>${priority(r)}</priority>\n  </url>`
  )
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
fs.writeFileSync(path.join(publicDir, "sitemap.xml"), xml, "utf8");
console.log(`[sitemap] wrote ${PRERENDER_ROUTES.length} urls -> dist/public/sitemap.xml`);
