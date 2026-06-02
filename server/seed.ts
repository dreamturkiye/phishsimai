import { getDb } from "./db";
import { templates, trainingModules } from "../drizzle/schema";
import templateData from "./seed_templates.json";
import moduleData from "./seed_modules.json";

export async function seedDatabase() {
  const db = await getDb();
  if (!db) return;

  // Check if already seeded
  const existing = await db.select().from(templates).limit(1);
  if (existing.length > 0) return;

  console.log("[Seed] Seeding 100 phishing templates...");

  // Insert templates in batches of 20
  for (let i = 0; i < templateData.length; i += 20) {
    const batch = templateData.slice(i, i + 20) as typeof templates.$inferInsert[];
    await db.insert(templates).values(batch);
  }
  console.log(`[Seed] Inserted ${templateData.length} templates.`);

  // Seed training modules
  const existingModules = await db.select().from(trainingModules).limit(1);
  if (existingModules.length > 0) return;
  console.log("[Seed] Seeding training modules...");

  for (let i = 0; i < moduleData.length; i += 10) {
    const batch = moduleData.slice(i, i + 10) as typeof trainingModules.$inferInsert[];
    await db.insert(trainingModules).values(batch);
  }
  console.log(`[Seed] Inserted ${moduleData.length} training modules.`);
}
