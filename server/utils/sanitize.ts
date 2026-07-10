import sanitizeHtml from "sanitize-html";

// Email-safe HTML allowlist. Uses sanitize-html (pure JS, htmlparser2 — no jsdom,
// no ESM require at runtime, bundles cleanly into the Vercel serverless function).

const EMAIL_ALLOWED_TAGS = [
  "a","abbr","b","blockquote","br","center","cite","code","col","colgroup",
  "dd","div","dl","dt","em","figcaption","figure","font","footer","h1","h2",
  "h3","h4","h5","h6","header","hr","i","img","li","main","ol","p","pre",
  "q","s","section","small","span","strong","sub","sup","table","tbody",
  "td","tfoot","th","thead","time","tr","u","ul",
];

// Common, non-url() CSS properties only. Because no property here accepts a url(),
// `url(javascript:...)` and IE `expression()` cannot pass — they match no value regex.
const SAFE_STYLE_VALUE = [/^[#a-z0-9\s.,%()\-/'"]+$/i];
const EMAIL_ALLOWED_STYLES = {
  "*": {
    color: SAFE_STYLE_VALUE,
    "background-color": SAFE_STYLE_VALUE,
    "font-family": SAFE_STYLE_VALUE,
    "font-size": SAFE_STYLE_VALUE,
    "font-weight": SAFE_STYLE_VALUE,
    "font-style": SAFE_STYLE_VALUE,
    "text-align": [/^(left|right|center|justify)$/i],
    "text-decoration": SAFE_STYLE_VALUE,
    "line-height": SAFE_STYLE_VALUE,
    "vertical-align": SAFE_STYLE_VALUE,
    display: SAFE_STYLE_VALUE,
    width: SAFE_STYLE_VALUE,
    height: SAFE_STYLE_VALUE,
    "max-width": SAFE_STYLE_VALUE,
    "min-width": SAFE_STYLE_VALUE,
    padding: SAFE_STYLE_VALUE,
    "padding-top": SAFE_STYLE_VALUE,
    "padding-right": SAFE_STYLE_VALUE,
    "padding-bottom": SAFE_STYLE_VALUE,
    "padding-left": SAFE_STYLE_VALUE,
    margin: SAFE_STYLE_VALUE,
    "margin-top": SAFE_STYLE_VALUE,
    "margin-right": SAFE_STYLE_VALUE,
    "margin-bottom": SAFE_STYLE_VALUE,
    "margin-left": SAFE_STYLE_VALUE,
    border: SAFE_STYLE_VALUE,
    "border-top": SAFE_STYLE_VALUE,
    "border-bottom": SAFE_STYLE_VALUE,
    "border-color": SAFE_STYLE_VALUE,
    "border-radius": SAFE_STYLE_VALUE,
  },
};

export function sanitizeEmailHtml(html: string): string {
  if (!html || typeof html !== "string") return "";
  return sanitizeHtml(html, {
    allowedTags: EMAIL_ALLOWED_TAGS,
    allowedAttributes: {
      "*": [
        "class","id","style","title","align","valign","width","height",
        "border","cellpadding","cellspacing","colspan","rowspan","color","bgcolor",
      ],
      a: ["href","name","target","rel"],
      img: ["src","alt","width","height","border"],
    },
    // http/https/mailto only — strips javascript:, data:, vbscript: in href/src.
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { a: ["http", "https", "mailto"], img: ["http", "https"] },
    allowProtocolRelative: false,
    // Disallowed tags are dropped; script/style/iframe/object/embed dropped WITH content.
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "noscript", "iframe", "object", "embed"],
    allowedStyles: EMAIL_ALLOWED_STYLES,
  });
}

export function sanitizeContext(input: string): string {
  if (!input || typeof input !== "string") return "";
  return input
    .replace(/ignore\s+(all\s+|previous\s+|prior\s+)?instructions?/gi, "")
    .replace(/forget\s+(everything|all|previous)/gi, "")
    .replace(/(system|user|assistant):/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[{}[\]]/g, "")
    .replace(/[^\w\s.,!?'"()\-&@#%+/]/g, "")
    .trim()
    .slice(0, 200);
}
