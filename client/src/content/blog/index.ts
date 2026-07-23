import { marked } from "marked";

// PS-SEO-03 (P5 blog): posts live as markdown-with-frontmatter next to this file. Vite inlines them
// at build (client + SSR), so the prerender and the SPA render the same content — no CMS, no runtime
// fetch. Adding a post = drop a .md here; it prerenders + hits the sitemap automatically.
export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  bodyHtml: string;
  faq?: { q: string; a: string }[];
}

// FAQPage Q&As, drawn faithfully from the post's "What carriers expect" / "What to do" sections.
const FAQ: Record<string, { q: string; a: string }[]> = {
  "cyber-insurance-phishing-simulation-requirement-2026": [
    {
      q: "Does cyber insurance require phishing simulations in 2026?",
      a: "Increasingly, yes. Carriers now expect phishing simulations run on a schedule — quarterly at minimum, monthly for stronger terms — not a one-time exercise, alongside documented training completion and trend data.",
    },
    {
      q: "What do cyber insurance carriers expect for security awareness training?",
      a: "Documented training completion, typically at or above a 90% threshold across departments; ideally six or more months of simulation results showing click and report rates improving; timestamps and scope for every campaign; and tracked remedial training for repeat clickers.",
    },
    {
      q: "What happens if I can't document phishing training at renewal?",
      a: "Beyond a higher premium, a growing number of 2026 policies carry coverage exclusions — if a breach traces to a gap you attested to controlling but couldn't document, the claim can be denied.",
    },
    {
      q: "What should I do if my cyber insurance renewal is within six months?",
      a: "Start now, not 30 days out. Begin monthly simulations immediately to accumulate trend data, document each campaign as you go, track completion toward 90%, assign and log remedial training for repeat clickers, and assemble the evidence pack incrementally.",
    },
  ],
};

function parseFrontmatter(md: string): { fm: Record<string, string>; body: string } {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return { fm: {}, body: md };
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    fm[key] = val;
  }
  return { fm, body: m[2] };
}

const raw = import.meta.glob("./*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export const BLOG_POSTS: BlogPost[] = Object.values(raw)
  .map((md) => {
    const { fm, body } = parseFrontmatter(md);
    return {
      slug: fm.slug,
      title: fm.title,
      description: fm.description,
      datePublished: fm.datePublished,
      bodyHtml: marked.parse(body, { async: false }) as string,
      faq: FAQ[fm.slug],
    };
  })
  .filter((p) => p.slug)
  .sort((a, b) => (a.datePublished < b.datePublished ? 1 : -1));

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
