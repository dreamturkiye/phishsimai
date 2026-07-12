import { sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  getUsaHipaaEmail,
  getUsaGlbaEmail,
  getUsaCmmcEmail,
  getUkEmail,
  getCanadaEmail,
  getAustraliaEmail,
  getUsaDefaultEmail,
} from "./emailTemplates";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "5545242725";
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM_EMAIL = process.env.RESEND_OUTREACH_FROM ?? "sarah@phishsimai.com";
const MAX_PER_RUN = 15;

interface OutreachLead {
  id: number;
  name: string;
  company: string;
  country: string;
  sector: string;
  email: string;
  touch1_sent_at: Date | null;
  touch2_sent_at: Date | null;
  touch3_sent_at: Date | null;
  touch4_sent_at: Date | null;
}

function getTouchNumber(lead: OutreachLead): 1 | 2 | 3 | 4 | null {
  const now = Date.now();
  const days5 = 5 * 24 * 60 * 60 * 1000;
  const days8 = 8 * 24 * 60 * 60 * 1000;
  if (!lead.touch1_sent_at) return 1;
  if (lead.touch1_sent_at.getTime() < now - days5 && !lead.touch2_sent_at) return 2;
  if (lead.touch2_sent_at && lead.touch2_sent_at.getTime() < now - days5 && !lead.touch3_sent_at) return 3;
  if (lead.touch3_sent_at && lead.touch3_sent_at.getTime() < now - days8 && !lead.touch4_sent_at) return 4;
  return null;
}

function getTemplate(country: string, sector: string) {
  const s = sector.toLowerCase();
  const c = country.toUpperCase();
  if (c === "US" && s.includes("health")) return getUsaHipaaEmail;
  if (c === "US" && s.includes("financ")) return getUsaGlbaEmail;
  if (c === "US" && (s.includes("defense") || s.includes("government"))) return getUsaCmmcEmail;
  if (c === "GB") return getUkEmail;
  if (c === "CA") return getCanadaEmail;
  if (c === "AU") return getAustraliaEmail;
  return getUsaDefaultEmail;
}

async function sendTelegram(text: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
  } catch (e) {
    console.error("[OutreachSequence] Telegram error:", e);
  }
}

async function sendEmail(lead: OutreachLead, subject: string, html: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `Sarah Mitchell <${FROM_EMAIL}>`,
      to: [lead.email],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
}

export async function runOutreachSequence(): Promise<{ sent: number; errors: number }> {
  const db = await getDb();
  if (!db) {
    console.error("[OutreachSequence] No DB connection");
    return { sent: 0, errors: 1 };
  }

  // db.execute() resolves to a FullQueryResults OBJECT, not an array — destructuring
  // it as `const [rows] = ...` throws "is not iterable" at runtime. Read .rows.
  const result = await db.execute(sql`
    SELECT id, name, company, country, sector, email,
           touch1_sent_at, touch2_sent_at, touch3_sent_at, touch4_sent_at
    FROM outreach_leads
    WHERE replied = 0 AND unsubscribed = 0 AND bounced = 0
    LIMIT ${MAX_PER_RUN}
  `);

  const leads = result.rows as unknown as OutreachLead[];
  let sent = 0;
  let errors = 0;

  for (const lead of leads) {
    const touch = getTouchNumber(lead);
    if (!touch) continue;

    const templateFn = getTemplate(lead.country, lead.sector);
    const { subject, html } = templateFn(touch, lead);

    try {
      await sendEmail(lead, subject, html);
      const col = `touch${touch}_sent_at` as const;
      await db.execute(sql`
        UPDATE outreach_leads SET ${sql.raw(col)} = NOW() WHERE id = ${lead.id}
      `);
      sent++;
      console.log(`[OutreachSequence] Sent touch ${touch} to ${lead.email}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[OutreachSequence] Error sending to ${lead.email}:`, msg);
      await sendTelegram(`⚠️ PhishSim Outreach ERROR: ${msg}`);
      errors++;
      // Stop run on Resend error
      break;
    }

    // 60s delay between sends
    await new Promise((r) => setTimeout(r, 60_000));
  }

  await sendTelegram(`📧 PhishSim Outreach run complete: ${sent} sent, ${errors} errors`);
  return { sent, errors };
}
