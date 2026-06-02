import { getDb } from "./db";
import { templates, trainingModules } from "../drizzle/schema";
import templateData from "./seed_templates.json";
import moduleData from "./seed_modules.json";

export async function seedDatabase() {
  const db = await getDb();
  if (!db) return;

  // ─── Templates ───────────────────────────────────────────────────────────────
  const existing = await db.select().from(templates).limit(1);
  if (existing.length === 0) {
    console.log("[Seed] Seeding 100 phishing templates...");

    // Explicitly map each template to match the exact schema columns
    const mapped = (templateData as any[]).map((t) => ({
      orgId: null,
      createdByUserId: null,
      name: t.name as string,
      subject: t.subject as string,
      htmlBody: t.htmlBody as string,
      language: (t.language ?? "en") as "en" | "es" | "tr",
      attackType: (t.attackType ?? "credential_harvest") as
        | "credential_harvest"
        | "link_click"
        | "attachment"
        | "vishing"
        | "smishing"
        | "pretexting",
      industry: (t.industry ?? null) as string | null,
      difficulty: (t.difficulty ?? "medium") as "easy" | "medium" | "hard",
      mspTenantId: null,
      isBuiltIn: true,
      isShared: false,
      isMspTemplate: false,
      tags: (t.tags ?? []) as string[],
      usageCount: 0,
    }));

    // Insert in batches of 10 to avoid query size limits
    for (let i = 0; i < mapped.length; i += 10) {
      const batch = mapped.slice(i, i + 10);
      await db.insert(templates).values(batch);
      console.log(`[Seed] Inserted templates ${i + 1}–${Math.min(i + 10, mapped.length)}`);
    }
    console.log(`[Seed] ✓ Inserted ${mapped.length} templates.`);
  } else {
    console.log("[Seed] Templates already seeded, skipping.");
  }

  // ─── Training Modules ────────────────────────────────────────────────────────
  const existingModules = await db.select().from(trainingModules).limit(1);
  if (existingModules.length === 0) {
    console.log("[Seed] Seeding training modules...");
    for (let i = 0; i < moduleData.length; i += 10) {
      const batch = moduleData.slice(i, i + 10) as typeof trainingModules.$inferInsert[];
      await db.insert(trainingModules).values(batch);
    }
    console.log(`[Seed] ✓ Inserted ${moduleData.length} training modules.`);
  } else {
    console.log("[Seed] Training modules already seeded, skipping.");
  }
}
