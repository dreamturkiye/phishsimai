// PS-SEO-05: commercial-intent landings. Unique copy per URL (not doorway variants).
// Titles/descriptions feed seoForPath + prerender; bodies render via SeoLanding.
// Frozen offer only. No invented KnowBe4 list prices, customers, or ratings.

export interface SeoFaq {
  q: string;
  a: string;
}

export interface SeoSection {
  h2: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface SeoLanding {
  path: string;
  aliases?: string[];
  /** Rendered by KnowBe4Alternative.tsx, not SeoLanding. */
  hub?: boolean;
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  lede: string;
  campaign: string;
  sections: SeoSection[];
  table?: {
    headers: [string, string, string];
    rows: Array<{ label: string; us: string; them: string }>;
  };
  faq: SeoFaq[];
  related: Array<{ href: string; label: string }>;
}

export const TRIAL_OFFER = "60¢/user · $299/mo for 500 seats · 30-day trial · no credit card · live in 10 minutes.";

export function trialHref(campaign: string): string {
  return `/trial?utm_source=seo&utm_medium=web&utm_campaign=${encodeURIComponent(campaign)}`;
}

export const CLUSTER_NAV: Array<{ href: string; label: string }> = [
  { href: "/knowbe4-alternative", label: "KnowBe4 alternative" },
  { href: "/knowbe4-vs", label: "KnowBe4 vs PhishSim" },
  { href: "/knowbe4-pricing", label: "KnowBe4 pricing" },
  { href: "/knowbe4-for-msps", label: "KnowBe4 for MSPs" },
  { href: "/phishing-simulation-software", label: "Phishing simulation software" },
  { href: "/security-awareness-training", label: "Security awareness training" },
  { href: "/phishing-training-for-msps", label: "Phishing training for MSPs" },
];

export const HOME_FAQS: SeoFaq[] = [
  {
    q: "How quickly can we get started?",
    a: "Most organizations are running their first phishing campaign within 10 minutes of signing up. Create your org, import your employee list (CSV or manual), pick an AI-generated template, and launch.",
  },
  {
    q: "Do we need technical expertise to use PhishSim AI?",
    a: "No. The platform is designed for IT generalists and HR teams, not security engineers. The AI handles template creation, scheduling is automated, and reports are generated with one click.",
  },
  {
    q: "Will the phishing emails actually be delivered to inboxes?",
    a: "Yes. We provide SPF/DKIM/DMARC configuration guidance to whitelist our sending infrastructure. Most organizations achieve 95%+ inbox delivery rates.",
  },
  {
    q: "Can we use our own phishing templates?",
    a: "Absolutely. You can create custom templates, import from real phishing emails you have received, and share templates with other organizations in the community library.",
  },
  {
    q: "How do the compliance certificates work?",
    a: "After completing the required checklist items for a framework (e.g., HIPAA), you can generate a dated compliance certificate with your organization name, completion percentage, and the specific regulatory citation. These are accepted by most auditors as evidence of a phishing awareness program.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes — all plans include a 30-day free trial with no credit card required. You get full access to all features during the trial.",
  },
];

export const SEO_LANDINGS: SeoLanding[] = [
  {
    path: "/knowbe4-alternative",
    aliases: ["/knowbe4"],
    hub: true,
    title: "KnowBe4 Alternative for MSPs (2026) — Free Trial | PhishSim AI",
    description:
      "Honest KnowBe4 alternative for MSPs and small teams: 60¢/user, $299/mo for 500 seats, 30-day free trial, no credit card. Live in 10 minutes.",
    eyebrow: "KnowBe4 alternative",
    h1: "A KnowBe4 alternative for MSPs and small teams",
    lede: "KnowBe4 is a capable enterprise platform. PhishSim AI is the leaner path when you need simulations, training, and reportable logs without a procurement cycle.",
    campaign: "knowbe4_alternative",
    sections: [],
    faq: [
      {
        q: "Is PhishSim AI a KnowBe4 alternative?",
        a: "Yes, for MSPs, small teams, and mid-market books that need the simulate → train → report loop. We do not claim to out-feature KnowBe4's enterprise courseware or template library.",
      },
      {
        q: "Who should stay on KnowBe4?",
        a: "Large enterprises with a dedicated security team, budget for an annual enterprise SKU, and a need for KnowBe4's full content depth. That is a defensible choice.",
      },
      {
        q: "How do I start a trial?",
        a: "Open /trial, create an account, import a list, and send a simulation. 30 days, no credit card, full access.",
      },
    ],
    related: CLUSTER_NAV.filter((l) => l.href !== "/knowbe4-alternative"),
  },
  {
    path: "/knowbe4-vs",
    title: "KnowBe4 vs PhishSim AI — Honest Comparison (2026)",
    description:
      "KnowBe4 vs PhishSim AI: enterprise SAT vs MSP-first phishing simulation. Compare fit, time-to-first-campaign, tenancy, and public pricing. 30-day free trial, no card.",
    eyebrow: "KnowBe4 vs PhishSim AI",
    h1: "KnowBe4 vs PhishSim AI: which one fits the team you actually have?",
    lede: "KnowBe4 wins when you are buying enterprise depth. PhishSim AI wins when you need phishing simulation and security awareness training live this week — especially if you are an MSP or a mid-market IT team paying a seat tax you do not use.",
    campaign: "knowbe4_vs",
    table: {
      headers: ["", "PhishSim AI", "KnowBe4"],
      rows: [
        { label: "Designed for", us: "MSPs, IT teams, mid-market books", them: "Enterprise security organizations" },
        { label: "How you buy", us: "Self-serve, public price list", them: "Sales-led quote, annual enterprise SKUs" },
        { label: "Time to first simulation", us: "About 10 minutes", them: "Onboarding / implementation cycle" },
        { label: "Trial", us: "30 days, no credit card", them: "Usually a demo-gated evaluation" },
        { label: "Growth economics", us: "$299/mo covers 500 users (60¢)", them: "Per-seat minimums on enterprise SKUs" },
        { label: "Multi-client MSP", us: "Native multi-tenant", them: "Built around a single enterprise tenant" },
        { label: "Honest limitation", us: "Leaner courseware and template library", them: "Deeper enterprise content catalog" },
      ],
    },
    sections: [
      {
        h2: "What “KnowBe4 vs” actually decides",
        paragraphs: [
          "Most “KnowBe4 vs [tool]” pages pretend the buyer is choosing a feature checklist. The real fork is organizational: do you have a security team, a procurement cycle, and a need for an enormous content library — or do you need a simulation out the door, training for clickers, and a log you can hand to an auditor or a client?",
          "PhishSim AI is not trying to be a clone. If you need KnowBe4's depth and you have the budget, pick KnowBe4. If you are comparing because the quote, the seat minimum, or the onboarding feels like a jet for a cross-town trip, keep reading.",
        ],
      },
      {
        h2: "Where KnowBe4 is the right product",
        paragraphs: [
          "KnowBe4’s strength is the enterprise surface: a very large template library, extensive training courseware, and mature integrations for a dedicated security org. A Fortune-scale workforce with a SAT owner and an annual training calendar is the customer that product was built for.",
          "We will not invent a win-rate, a fabricated savings figure, or a fake KnowBe4 invoice. Those claims are how comparison pages lose trust. The honest statement is narrower: KnowBe4 is a capable platform that is often oversized for MSPs and lean IT teams.",
        ],
      },
      {
        h2: "Where PhishSim AI is the better fit",
        paragraphs: [
          "PhishSim AI is phishing simulation software plus security awareness training for people who run the program themselves. AI-generated lures, a training page on click, completion and report tracking, compliance certificates, and MSP multi-tenancy — without a sales gate.",
          "Public pricing starts at $149/mo (100 users). Growth is $299/mo for 500 users. Pro is $749/mo for 2,500. Enterprise is $1,499/mo for 10,000. That is the whole commercial argument against a quoted per-seat SAT tax: you can see the number before you talk to anyone.",
        ],
        bullets: [
          "First campaign is import list → pick a template → send.",
          "30-day trial, no credit card, full product — not a crippled sandbox.",
          "MSP tenancy and PSA ticket routing (ConnectWise Manage, Halo) for client books.",
          "Inbox-delivery guidance for Microsoft 365 Advanced Delivery / Google Workspace.",
        ],
      },
      {
        h2: "Larger MSPs and mid-market teams",
        paragraphs: [
          "“Small team only” is the wrong read. The mismatch is tenancy and seat tax, not headcount. An MSP with 40 clients of 40–80 people is a mid-market seat count living inside an enterprise SKU designed for one tenant. Adding a client should grow margin, not trigger another per-name renewal line.",
          "That is the KnowBe4 vs PhishSim decision for larger MSPs: one pane of glass, per-client reports, and a price that still makes sense at 500–2,500 users.",
        ],
      },
    ],
    faq: [
      {
        q: "Is PhishSim AI better than KnowBe4?",
        a: "It is a better fit for MSPs and teams that need the core loop without an enterprise contract. It is not a better enterprise content library. Choose on fit, not a fake “winner.”",
      },
      {
        q: "Can I evaluate both?",
        a: "Yes. Start a PhishSim trial in about 10 minutes (no card). Run KnowBe4’s eval if you need its depth. A week of real campaigns is more informative than a slide comparison.",
      },
      {
        q: "Do you publish KnowBe4’s current price?",
        a: "No. Their quotes vary by SKU, term, and seat minimum. We compare structure — public month-to-month vs sales-led enterprise SKUs — and publish only our own list.",
      },
      {
        q: "Will I lose training history if I switch?",
        a: "Export KnowBe4 reports you need for audits, then start PhishSim campaigns so the new log has timestamps from day one. Insurers care about an ongoing program, not a single vendor logo.",
      },
    ],
    related: [
      { href: "/knowbe4-alternative", label: "KnowBe4 alternative hub" },
      { href: "/knowbe4-pricing", label: "KnowBe4 pricing" },
      { href: "/knowbe4-for-msps", label: "KnowBe4 for MSPs" },
      { href: "/phishing-simulation-software", label: "Phishing simulation software" },
    ],
  },
  {
    path: "/knowbe4-pricing",
    title: "KnowBe4 Pricing vs PhishSim AI — Public Per-Seat Alternative",
    description:
      "KnowBe4 pricing is a quoted enterprise SKU. PhishSim AI is public: 60¢/user, $299/mo for 500 seats, 30-day free trial, no card. An honest look at cheaper-than-KnowBe4 economics for MSPs.",
    eyebrow: "KnowBe4 pricing",
    h1: "KnowBe4 pricing vs a public price: why “cheaper than KnowBe4” is a structure, not a made-up invoice",
    lede: "People search “KnowBe4 pricing” and “cheaper than KnowBe4” because the quote arrived with a seat minimum and an annual term. We will not invent KnowBe4’s number. We will show ours, and explain the seat tax that makes mid-market books feel expensive.",
    campaign: "knowbe4_pricing",
    table: {
      headers: ["", "PhishSim AI (public)", "KnowBe4 (typical deal shape)"],
      rows: [
        { label: "How price is set", us: "Published list on /pricing", them: "Quoted SKU — not a self-serve page" },
        { label: "Starter / Growth", us: "$149 / 100 users · $299 / 500 (60¢)", them: "Per-seat minimums; annual commitments common" },
        { label: "Pro / larger books", us: "$749 / 2,500 users · $1,499 / 10,000", them: "Enterprise SAT packaging" },
        { label: "Trial", us: "30 days, no credit card", them: "Demo-gated evaluation in most motions" },
        { label: "Adding a client (MSP)", us: "Seats inside the same plan", them: "Another seat block on a single-tenant SKU" },
      ],
    },
    sections: [
      {
        h2: "What we will not do on a pricing page",
        paragraphs: [
          "We will not publish a fake per-user KnowBe4 invoice scraped from a 2022 blog. Their packaging changes, partners discount, and seat minimums move. A fabricated comparison is how you lose the second Google click — and it is the same honesty rule we use on our own homepage (no invented customers, no invented savings).",
          "The searchable fact is the deal shape: KnowBe4 is sold as security awareness training for enterprises. Pricing is a conversation. PhishSim AI’s phishing simulation software is sold with a public list and a no-card trial.",
        ],
      },
      {
        h2: "The seat tax mid-market teams actually feel",
        paragraphs: [
          "Security awareness platforms that bill per named user punish growth. Hire twenty people, onboard a clinic, or add a 60-seat client and the SAT line jumps even though your workflow did not get twenty times harder.",
          "That is the “larger company / mid-market” pain behind cheaper-than-KnowBe4 searches. You are not shopping for a toy. You are trying to stop paying enterprise SAT economics on a workforce or a client book that does not come with an enterprise SAT team.",
          "PhishSim Growth is $299/mo for 500 users — 60¢ each. Pro is $749/mo for 2,500. The job (simulate, train clickers, export the log) does not require a per-name enterprise multiplier.",
        ],
      },
      {
        h2: "What $299/mo for 500 actually buys",
        paragraphs: [
          "AI-generated phishing simulations, training on click, report and completion tracking, and compliance certificates with framework citations. MSP plans add multi-client tenancy, branding, and PSA ticket routing for real suspicious mail (simulations never open tickets).",
          "If your KnowBe4 quote is mostly unused courseware plus a seat floor, you are paying for a catalog. Pay for the loop you run every month instead.",
        ],
      },
      {
        h2: "How to compare a quote without guessing their list",
        paragraphs: [
          "Ask the incumbent three questions: what is the seat minimum, what happens when we add 80 users next quarter, and can we run a campaign this week without a professional-services kickoff? Then open PhishSim’s trial and send one simulation. The delta is usually obvious in the first afternoon — not in a spreadsheet of invented unit prices.",
        ],
      },
    ],
    faq: [
      {
        q: "How much is KnowBe4?",
        a: "KnowBe4 does not publish a single public, current list price. Quotes depend on product mix, term, and seat minimums. Treat any specific dollar figure on a random comparison site as unverified.",
      },
      {
        q: "Is PhishSim AI cheaper than KnowBe4?",
        a: "For MSP and mid-market seat counts, a public $299/500 plan is structurally cheaper than an enterprise SAT quote with per-seat minimums. We will not claim a fake percentage-off against an unpublished invoice.",
      },
      {
        q: "What is PhishSim AI’s price?",
        a: "Starter $149/mo (100 users), Growth $299/mo (500 users, 60¢ each), Pro $749/mo (2,500), Enterprise $1,499/mo (10,000). 30-day free trial, no credit card.",
      },
      {
        q: "Is there a long-term contract?",
        a: "PhishSim list plans are month-to-month after the trial. We ask for a card when you keep it, not to start.",
      },
    ],
    related: [
      { href: "/knowbe4-vs", label: "KnowBe4 vs PhishSim AI" },
      { href: "/knowbe4-for-msps", label: "KnowBe4 for MSPs" },
      { href: "/phishing-training-for-msps", label: "Phishing training for MSPs" },
      { href: "/pricing", label: "PhishSim pricing" },
    ],
  },
  {
    path: "/knowbe4-for-msps",
    title: "KnowBe4 for MSPs — Why Multi-Tenant Teams Look Elsewhere",
    description:
      "KnowBe4 for MSPs is a single-tenant enterprise SAT in a multi-client world. PhishSim AI is built for MSP phishing training: per-client reports, PSA routing, 60¢/user, 30-day no-card trial.",
    eyebrow: "KnowBe4 for MSPs",
    h1: "KnowBe4 for MSPs: a strong enterprise product in the wrong tenancy model",
    lede: "MSPs search “KnowBe4 for MSPs” after trying to stretch a single-enterprise SAT across a book of clients. The friction is not that KnowBe4 is weak. It is that the customer it was designed for is one company, not forty.",
    campaign: "knowbe4_for_msps",
    table: {
      headers: ["MSP job", "PhishSim AI", "KnowBe4-shaped SAT"],
      rows: [
        { label: "New client this week", us: "New tenant, first sim the same day", them: "Onboarding weight of an enterprise console" },
        { label: "Per-client evidence", us: "Isolated reports / exportable logs", them: "One-tenant reporting you have to slice" },
        { label: "PSA", us: "ConnectWise Manage + Halo for real reports", them: "Enterprise ITSM, not MSP ticket flow" },
        { label: "Margin at 25–80 seats", us: "Seats sit inside $299 / 500", them: "Per-seat minimums eat the bundle price" },
        { label: "White label", us: "Logo, color, client-facing portal on Pro+", them: "Packaged for the buyer’s own brand" },
      ],
    },
    sections: [
      {
        h2: "What MSPs actually sell",
        paragraphs: [
          "Phishing training for MSPs is a service: monthly simulations, clicker coaching, and a packet the client can show an insurer or auditor. The software is leverage. If the tool assumes one HR directory and one security owner, you spend the engagement stitching tenants together.",
          "KnowBe4 for MSPs conversations usually stall on three operational facts: seat economics that assume one large org, a console that is heavier than a 45-minute QBR, and reporting that is not natively “one PDF per client.”",
        ],
      },
      {
        h2: "Larger MSP ICPs — this is not only a 15-seat story",
        paragraphs: [
          "A 200-person MSP with 1,500 seats under management is still an MSP. They feel the seat tax more, not less, because every new logo adds named users. Enterprise SAT pricing that looked “fine” on a pilot client becomes the line item that makes the vCISO bundle unprofitable.",
          "PhishSim Pro (2,500 users) and Enterprise (10,000) exist for that book. Multi-tenant from day one, not a single-tenant product with a partner overlay.",
        ],
      },
      {
        h2: "What to demand from a KnowBe4 alternative for MSPs",
        paragraphs: [
          "True isolation per client, a first campaign that does not need a professional-services kickoff, Microsoft 365 allowlisting that is documented (see our Advanced Delivery guide), and an evidence pack you can send without rebuilding a spreadsheet.",
          "If you also need PSA: PhishSim can open a ConnectWise Manage or Halo ticket when a user reports a real suspicious email. Simulation reports are scored only — they never create tickets — so training noise stays out of the queue.",
        ],
        bullets: [
          "Per-client organizations, not one flat user list.",
          "Public pricing that still leaves margin at 20 seats and at 800.",
          "Compliance certificates with the citation (HIPAA, GLBA, CMMC, NY DFS, and others).",
          "No card to trial. Live in about 10 minutes.",
        ],
      },
      {
        h2: "When KnowBe4 still wins for an MSP",
        paragraphs: [
          "If a single strategic client mandates KnowBe4 by name, or you are embedding inside a large-enterprise SAT standard, meet the mandate. Do not rip out a contractual requirement to save 60¢. Use PhishSim for the rest of the book that was never going to fund an enterprise SAT owner.",
        ],
      },
    ],
    faq: [
      {
        q: "Does KnowBe4 work for MSPs?",
        a: "It can, especially on a large single tenant. Across a book of small and mid-size clients the tenancy, seat minimums, and admin weight usually fight MSP margins.",
      },
      {
        q: "What is the best KnowBe4 alternative for MSPs?",
        a: "Look for native multi-tenancy, public per-seat math that works at 25 seats, and a client-ready evidence pack. PhishSim AI is built for that job.",
      },
      {
        q: "Can I run PhishSim for some clients and keep KnowBe4 for one?",
        a: "Yes. Many MSPs keep an incumbent where a contract requires it and run a leaner tool for everyone else.",
      },
      {
        q: "How fast can I onboard a client?",
        a: "Create the tenant, import the list, allowlist the sender, send. The product path is minutes, not a quarter.",
      },
    ],
    related: [
      { href: "/phishing-training-for-msps", label: "Phishing training for MSPs" },
      { href: "/knowbe4-pricing", label: "KnowBe4 pricing" },
      { href: "/knowbe4-vs", label: "KnowBe4 vs PhishSim" },
      { href: "/msp", label: "MSP partner portal" },
    ],
  },
  {
    path: "/phishing-simulation-software",
    title: "Phishing Simulation Software for MSPs & IT Teams — PhishSim AI",
    description:
      "Phishing simulation software that reaches the inbox, trains clickers, and exports audit logs. Built for MSPs and IT teams. 60¢/user, $299/mo for 500, 30-day free trial, no card.",
    eyebrow: "Phishing simulation software",
    h1: "Phishing simulation software you can launch this week — not after a sales cycle",
    lede: "The category is crowded with enterprise SAT suites. If you searched “phishing simulation software,” you probably want a program that actually sends, lands in the inbox, and produces a dated log — not a six-month implementation.",
    campaign: "phishing_simulation_software",
    sections: [
      {
        h2: "What phishing simulation software has to do in 2026",
        paragraphs: [
          "A useful tool does four things: send a realistic lure, reach the inbox (Advanced Delivery / allowlist, not junk), turn a click into training, and keep timestamped records of who was tested, who clicked, who reported, and who completed follow-up.",
          "Everything else — gamification, 4,000 courses, a marketplace — is optional. Cyber insurers and auditors now ask for the four-item loop. If the software cannot produce it without a services engagement, it is the wrong category purchase.",
        ],
        bullets: [
          "Realistic, role-aware lures (AI-generated or custom).",
          "Documented Microsoft 365 / Google Workspace deliverability.",
          "Click, open, report, and training-completion tracking.",
          "Exportable evidence for HIPAA, GLBA, CMMC, NY DFS, SOC 2 conversations.",
        ],
      },
      {
        h2: "MSP and mid-market buying criteria",
        paragraphs: [
          "Single-tenant enterprise phishing platforms assume one directory. MSPs need many. Mid-market IT teams need to add a department without renegotiating a seat block. That is the same seat-tax problem that shows up in KnowBe4 pricing searches, just without the brand name.",
          "Evaluate tenancy, public price at 100 / 500 / 2,500 users, and whether a generalist can send the first campaign in one sitting.",
        ],
      },
      {
        h2: "How PhishSim AI implements the category",
        paragraphs: [
          "PhishSim AI is phishing simulation software with security awareness training attached: AI templates (including English, Spanish, and Turkish), department targeting, training modules, compliance certificates, and an MSP portal with optional ConnectWise / Halo routing for real-mail reports.",
          "It is not the largest course catalog in the industry. It is the shortest path from “we need a program” to “the program ran, and here is the log.”",
        ],
      },
      {
        h2: "Related reading before you buy",
        paragraphs: [
          "If deliverability is the fear, read the Microsoft 365 allowlist guide. If an insurer is the reason you are shopping, read the 2026 cyber-insurance note. If you are replacing an enterprise SAT, start at the KnowBe4 alternative hub.",
        ],
      },
    ],
    faq: [
      {
        q: "What is phishing simulation software?",
        a: "Controlled, authorized fake-phishing campaigns that measure who clicks or reports, then assign training. It is a test of human risk, not a live attack.",
      },
      {
        q: "Is phishing simulation the same as security awareness training?",
        a: "Simulation is the test. Training is the fix. Serious programs do both and keep the records together.",
      },
      {
        q: "How often should we run simulations?",
        a: "Monthly is the practical standard for insurance and habit-building. Quarterly is a floor. One-off tests do not create a trend line.",
      },
      {
        q: "Will users be angry?",
        a: "They are less angry when the lure is realistic, the landing page teaches, and leadership treats a click as coaching — not a gotcha. That is a process choice the software should support.",
      },
    ],
    related: [
      { href: "/security-awareness-training", label: "Security awareness training" },
      { href: "/phishing-training-for-msps", label: "Phishing training for MSPs" },
      { href: "/knowbe4-alternative", label: "KnowBe4 alternative" },
      { href: "/blog/allowlist-phishing-simulation-microsoft-365", label: "M365 allowlist guide" },
    ],
  },
  {
    path: "/security-awareness-training",
    title: "Security Awareness Training for MSPs & Mid-Market — PhishSim AI",
    description:
      "Security awareness training paired with phishing simulations, compliance certificates, and exportable logs. For MSPs and mid-market teams. 30-day free trial, no credit card.",
    eyebrow: "Security awareness training",
    h1: "Security awareness training that gets run — because the simulation is in the same product",
    lede: "Security awareness training fails when it is a once-a-year video library. It works when a click opens a short lesson, completion is tracked, and you can prove the program to an auditor or a client’s underwriter.",
    campaign: "security_awareness_training",
    sections: [
      {
        h2: "Training without a test is a slide deck",
        paragraphs: [
          "The search term is “security awareness training.” The buyer’s actual job is reducing human-risk to email. That requires phishing simulation software plus training for the people who fail the test — in one record, not two vendors and a spreadsheet.",
          "Frameworks (HIPAA 45 CFR §164.308(a)(5), GLBA, NERC CIP-004, CMMC / NIST 800-171, NY DFS Part 500, PCI DSS 12.6.3) ask for awareness programs. They do not bless a specific vendor. They do expect evidence that the workforce was trained and that you measured the risk.",
        ],
      },
      {
        h2: "What mid-market and larger teams should refuse to pay for",
        paragraphs: [
          "A seat tax on named users for content nobody finishes. If 2,000 employees generate a SAT invoice that assumes an enterprise content ops team you do not have, you bought the wrong packaging. That is the same pain as “KnowBe4 pricing” — the brand is optional.",
          "Pay for assignments that complete in minutes, certificates with citations, and a trend line. PhishSim modules are short-form (most under five minutes) covering phishing, social engineering, password hygiene, and the frameworks MSPs get asked about.",
        ],
      },
      {
        h2: "How PhishSim AI structures the program",
        paragraphs: [
          "Launch a simulation. Clickers land on a training page. Repeat clickers can be assigned more modules. You export who did what, when. Compliance Center checklists map the work to HIPAA, GLBA, CMMC, NY DFS, SOC 2, and others.",
          "MSPs run that loop per client. Internal IT teams run it per department. Same product, different tenancy.",
        ],
      },
      {
        h2: "Start without a content committee",
        paragraphs: [
          "You do not need to storyboard a curriculum to have a defensible 2026 program. You need a cadence, a lure that reaches the inbox, and logs. The 30-day trial is the curriculum design session: send one campaign and read the report.",
        ],
      },
    ],
    faq: [
      {
        q: "Is security awareness training required?",
        a: "Many regulated sectors require an awareness program. Phishing simulation is the practical way to prove it. Exact legal language varies — we cite the clauses inside the product rather than pretending one statute names a vendor.",
      },
      {
        q: "How is this different from a video LMS?",
        a: "An LMS stores courses. A SAT program that includes phishing simulation measures whether people fall for email attacks and trains the ones who do.",
      },
      {
        q: "Do you have as many courses as KnowBe4?",
        a: "No. KnowBe4’s catalog is larger. We ship the modules that close the simulate → coach loop and the certificates auditors ask for. Choose catalog depth vs. time-to-run.",
      },
      {
        q: "Can MSPs white-label training?",
        a: "Pro and Enterprise include branding so the client sees your program, not a generic consumer SAT brand.",
      },
    ],
    related: [
      { href: "/phishing-simulation-software", label: "Phishing simulation software" },
      { href: "/phishing-training-for-msps", label: "Phishing training for MSPs" },
      { href: "/knowbe4-alternative", label: "KnowBe4 alternative" },
      { href: "/blog/cyber-insurance-phishing-simulation-requirement-2026", label: "Cyber insurance guide" },
    ],
  },
  {
    path: "/phishing-training-for-msps",
    title: "Phishing Training for MSPs — Multi-Tenant, Billable, No Seat Tax",
    description:
      "Phishing training for MSPs: multi-client simulations, per-client evidence packs, PSA ticketing, and public pricing (60¢/user, $299/500). Built for larger MSP books, not a single-tenant SAT tax.",
    eyebrow: "Phishing training for MSPs",
    h1: "Phishing training for MSPs: a billable service, not an enterprise seat tax",
    lede: "MSPs do not buy security awareness training for one HR directory. They buy a repeatable motion: stand up a client, run monthly phishing training, hand over evidence, invoice. The software either fits that motion or it fights it.",
    campaign: "phishing_training_for_msps",
    sections: [
      {
        h2: "The product a vCISO bundle can actually carry",
        paragraphs: [
          "If onboarding a 35-seat dental group takes a week of SAT administration, you will not productize the service. Phishing training for MSPs has to be boringly repeatable: new tenant, CSV, allowlist, send, QBR PDF.",
          "PhishSim AI is built as multi-tenant phishing simulation software. White-label on Pro+. Compliance certificates per client. Optional PSA tickets for real suspicious mail so the service desk sees the incidents that matter.",
        ],
      },
      {
        h2: "Larger and enterprise-adjacent MSP books",
        paragraphs: [
          "The ICP is not only “five-person shops.” Regional MSPs running 500–10,000 seats feel KnowBe4-for-MSPs and Proofpoint-style packaging as a margin problem: every logo adds named users on a single-tenant SAT tax.",
          "Use Growth at 500 users ($299/mo) while you prove the offer. Move to Pro (2,500) or Enterprise (10,000) when the book grows. The motion stays the same. You are not re-architecting tenancy because a client signed.",
        ],
      },
      {
        h2: "What to put in the SOW",
        paragraphs: [
          "Monthly or twice-monthly simulations, remedial training for repeat clickers, a quarterly trend (click rate down, report rate up), and an insurance-ready export. That is a service description a client understands. It does not require you to resell an enterprise course catalog.",
          "Point deliverability work at the allowlist guide so the first month’s metrics are real. Junk-folder “success” is how SAT programs lie to themselves.",
        ],
      },
      {
        h2: "Displacement without a holy war",
        paragraphs: [
          "If a flagship client standardized on KnowBe4, keep it there. Run PhishSim as the MSP standard for everyone else — the KnowBe4 alternative for the book, not a religious conversion of one account. Organic search should send that buyer to /knowbe4-for-msps and then here, then to /trial.",
        ],
      },
    ],
    faq: [
      {
        q: "Can I resell PhishSim AI as an MSP?",
        a: "Yes. Multi-client tenancy is native. Price the service as a bundle; our list is the cost of goods, published on /pricing.",
      },
      {
        q: "Does this replace KnowBe4 for every client?",
        a: "Only where you control the stack. Keep KnowBe4 when a contract names it. Standardize PhishSim on the clients you package.",
      },
      {
        q: "How do tickets work?",
        a: "ConnectWise Manage and Halo: a user-reported real suspicious email can open a ticket. Simulated phish reports do not, so training does not flood the board.",
      },
      {
        q: "How do I start?",
        a: "Start the 30-day trial (no card), create two tenants, send one campaign each. If that is not faster than your current SAT admin, do not buy.",
      },
    ],
    related: [
      { href: "/knowbe4-for-msps", label: "KnowBe4 for MSPs" },
      { href: "/knowbe4-pricing", label: "KnowBe4 pricing / seat tax" },
      { href: "/phishing-simulation-software", label: "Phishing simulation software" },
      { href: "/msp", label: "Partner portal" },
    ],
  },
];

export function getLanding(pathname: string): SeoLanding | undefined {
  const clean = (pathname.replace(/\/$/, "") || "/") as string;
  return SEO_LANDINGS.find((l) => l.path === clean || l.aliases?.includes(clean));
}

export const PRERENDER_LANDING_PATHS = SEO_LANDINGS.filter((l) => !l.hub).map((l) => l.path);
