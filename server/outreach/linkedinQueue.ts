import { sql } from "drizzle-orm";
import { getDb } from "../db";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "5545242725";

interface Lead {
  id: number;
  name: string;
  company: string;
  sector: string;
  job_title: string;
  linkedin_url: string | null;
}

async function sendTelegram(text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
    return res.ok;
  } catch (e) {
    console.error("[LinkedInQueue] Telegram error:", e);
    return false;
  }
}

export async function runLinkedInQueue(): Promise<{ queued: number }> {
  const db = await getDb();
  if (!db) {
    console.error("[LinkedInQueue] No DB connection");
    return { queued: 0 };
  }

  // db.execute() resolves to a FullQueryResults OBJECT ({ rows, fields, rowCount, … }),
  // not an array. The previous `const [rows] = await db.execute(...)` destructured it
  // as an array, which throws "is not iterable" at runtime — this path could never
  // have worked. Read .rows instead.
  const result = await db.execute(sql`
    SELECT id, name, company, sector, job_title, linkedin_url
    FROM outreach_leads
    WHERE touch1_sent_at IS NOT NULL
      AND (linkedin_queued IS NULL OR linkedin_queued = FALSE)
    LIMIT 30
  `);

  const leads = result.rows as unknown as Lead[];
  let queued = 0;

  for (const lead of leads) {
    const sector = lead.sector || "IT";
    const msg = `Hi ${lead.name}, I noticed you work in ${sector} at ${lead.company}. I'd love to connect and share how PhishSim AI helps ${sector} organizations stay compliant and reduce phishing risk. — Sarah`;
    const telegramText = `🔗 LINKEDIN — ${lead.name} at ${lead.company}\nTitle: ${lead.job_title || "N/A"}\nMessage: ${msg}\nLinkedIn: ${lead.linkedin_url || "N/A"}`;

    const ok = await sendTelegram(telegramText);
    if (ok) {
      try {
        await db.execute(sql`
          UPDATE outreach_leads SET linkedin_queued = TRUE WHERE id = ${lead.id}
        `);
        queued++;
      } catch (e) {
        console.error(`[LinkedInQueue] DB update error for lead ${lead.id}:`, e);
      }
    } else {
      console.error(`[LinkedInQueue] Telegram failed for lead ${lead.id}, skipping`);
    }
  }

  console.log(`[LinkedInQueue] Queued ${queued} LinkedIn leads`);
  return { queued };
}
