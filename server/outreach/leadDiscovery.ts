import { sql } from "drizzle-orm";
import { getDb } from "../db";

const APOLLO_API_KEY = process.env.APOLLO_API_KEY ?? "";
const APOLLO_TITLES = ["IT Director", "Head of IT", "Managing Director", "CISO", "Compliance Manager"];

interface ApolloTarget {
  person_locations: string[];
  q_keywords: string;
  num_requested: number;
  sector: string;
  country: string;
}

interface ApolloPerson {
  email?: string;
  email_status?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  organization?: { name?: string; website_url?: string };
  linkedin_url?: string;
}

const TARGETS: ApolloTarget[] = [
  { person_locations: ["United Kingdom"], q_keywords: "MSP", num_requested: 50, sector: "IT", country: "GB" },
  { person_locations: ["United States"], q_keywords: "MSP healthcare", num_requested: 30, sector: "healthcare", country: "US" },
  { person_locations: ["United States"], q_keywords: "MSP finance", num_requested: 20, sector: "finance", country: "US" },
  { person_locations: ["United States"], q_keywords: "MSP defense government", num_requested: 20, sector: "defense", country: "US" },
  { person_locations: ["Canada"], q_keywords: "MSP", num_requested: 20, sector: "IT", country: "CA" },
  { person_locations: ["Australia"], q_keywords: "MSP", num_requested: 20, sector: "IT", country: "AU" },
];

function extractDomain(url?: string): string {
  if (!url) return "";
  try { return new URL(url.startsWith("http") ? url : `https://${url}`).hostname; } catch { return url; }
}

export async function runLeadDiscovery(): Promise<{ added: number }> {
  const db = await getDb();
  if (!db) {
    console.error("[LeadDiscovery] No DB connection");
    return { added: 0 };
  }

  let totalAdded = 0;

  for (const target of TARGETS) {
    console.log(`[LeadDiscovery] Searching ${target.sector} in ${target.person_locations[0]}...`);
    try {
      const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": APOLLO_API_KEY },
        body: JSON.stringify({
          person_titles: APOLLO_TITLES,
          person_locations: target.person_locations,
          q_keywords: target.q_keywords,
          num_requested: target.num_requested,
        }),
      });

      if (!res.ok) {
        console.error(`[LeadDiscovery] Apollo error ${res.status} for ${target.sector}`);
        continue;
      }

      const data = (await res.json()) as { people?: ApolloPerson[] };
      const people = data.people ?? [];

      for (const person of people) {
        if (!person.email) continue;
        if (person.email_status !== "verified" && person.email_status !== "likely_to_engage") continue;

        // Check if email already exists
        const [existing] = await db.execute<{ id: number }[]>(sql`
          SELECT id FROM outreach_leads WHERE email = ${person.email} LIMIT 1
        `);
        if ((existing as unknown as unknown[]).length > 0) continue;

        const name = `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();
        const company = person.organization?.name ?? "";
        const domain = extractDomain(person.organization?.website_url);
        const linkedin = person.linkedin_url ?? "";
        const jobTitle = person.title ?? "";

        await db.execute(sql`
          INSERT INTO outreach_leads
            (email, name, company, sector, country, job_title, domain, linkedin_url, source, status, created_at)
          VALUES
            (${person.email}, ${name}, ${company}, ${target.sector}, ${target.country},
             ${jobTitle}, ${domain}, ${linkedin}, 'apollo', 'new', NOW())
        `);
        totalAdded++;
      }

      console.log(`[LeadDiscovery] Added ${totalAdded} total so far after ${target.sector}`);
    } catch (e) {
      console.error(`[LeadDiscovery] Error for ${target.sector}:`, e);
    }
  }

  return { added: totalAdded };
}
