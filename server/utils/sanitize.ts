import DOMPurify from "isomorphic-dompurify";

const EMAIL_ALLOWED_TAGS = [
  "a","abbr","b","blockquote","br","center","cite","code","col","colgroup",
  "dd","div","dl","dt","em","figcaption","figure","font","footer","h1","h2",
  "h3","h4","h5","h6","header","hr","i","img","li","main","ol","p","pre",
  "q","s","section","small","span","strong","sub","sup","table","tbody",
  "td","tfoot","th","thead","time","tr","u","ul",
];

const EMAIL_ALLOWED_ATTR = [
  "href","src","alt","title","class","id","style","width","height","border",
  "cellpadding","cellspacing","align","valign","colspan","rowspan","color",
  "bgcolor","target","rel",
];

export function sanitizeEmailHtml(html: string): string {
  if (!html || typeof html !== "string") return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: EMAIL_ALLOWED_TAGS,
    ALLOWED_ATTR: EMAIL_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script","iframe","object","embed","form","input","button","textarea","select"],
    FORBID_ATTR: ["onerror","onload","onclick","onmouseover","onmouseout","onkeyup","onkeydown","onfocus","onblur","onchange","onsubmit"],
    FORCE_BODY: true,
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
