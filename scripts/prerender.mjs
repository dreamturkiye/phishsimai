// PS-SEO-02 (P2): post-build prerender. Reads the built SPA shell (dist/public/index.html), renders
// each marketing route to static HTML via the SSR bundle, injects the per-route <head> meta + body,
// and writes a static file per route. App routes are never touched — they keep serving the shell.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "dist", "public");
const ssrEntry = path.join(root, "dist", "prerender", "prerender.js");

const shellPath = path.join(publicDir, "index.html");
const shell = fs.readFileSync(shellPath, "utf8");

const { render, PRERENDER_ROUTES } = await import(pathToFileURL(ssrEntry).href);

// Strip every SEO tag from the shell so the injected per-route block is the single source (no dupes).
function stripStaticHead(html) {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta name="description"[^>]*>\s*/gi, "")
    .replace(/<link rel="canonical"[^>]*>\s*/gi, "")
    .replace(/<meta property="og:[^"]*"[^>]*>\s*/gi, "")
    .replace(/<meta name="twitter:[^"]*"[^>]*>\s*/gi, "");
}

let written = 0;
for (const route of PRERENDER_ROUTES) {
  const { html, head } = render(route);
  let out = stripStaticHead(shell);
  // Inject per-route head just before </head>
  out = out.replace("</head>", `    ${head}\n  </head>`);
  // Inject the prerendered body into the root div (hydration replaces it client-side)
  out = out.replace('<div id="root"></div>', `<div id="root">${html}</div>`);

  // Root goes to a SEPARATE home.html so index.html stays the pristine SPA shell that app routes
  // fall back to — no marketing-content flash on /dashboard etc. vercel.json rewrites / -> /home.html.
  const file = route === "/" ? path.join(publicDir, "home.html") : path.join(publicDir, route.replace(/^\//, ""), "index.html");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out, "utf8");
  written++;
  console.log(`[prerender] ${route.padEnd(10)} -> ${path.relative(root, file)}`);
}
console.log(`[prerender] done — ${written} marketing routes prerendered (app routes untouched)`);
