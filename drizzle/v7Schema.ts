// Kaan AI OS v7 (L5.7) measurement/telemetry tables — Section K [S]/[HQ] DDL.
// PASSIVE SCHEMA ONLY: defined to match KAAN_AI_OS_V7_ARCHITECTURE.md Section K exactly.
// Nothing imports these at runtime yet — by design. Additive CREATE TABLE only.
import {
  pgTable,
  bigserial,
  bigint,
  integer,
  numeric,
  text,
  date,
  jsonb,
  boolean,
  timestamp,
  check,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// [S] daily close snapshot; the historical-metrics gap, closed
export const metricsDaily = pgTable("metrics_daily", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  productId: text("product_id").notNull(),
  snapshotDate: date("snapshot_date").notNull(),
  mrrCents: bigint("mrr_cents", { mode: "number" }),        // null = honestly unknown, never 0-as-unknown
  activeSubs: integer("active_subs"),
  newSubs: integer("new_subs"),
  churnedSubs: integer("churned_subs"),
  tasksCompleted: integer("tasks_completed").notNull().default(0),
  tasksFailed: integer("tasks_failed").notNull().default(0),
  agentScoreAvg: numeric("agent_score_avg", { precision: 3, scale: 1 }),   // null until agent_performance is real
  queueDepth: integer("queue_depth"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("metrics_daily_product_id_snapshot_date_key").on(t.productId, t.snapshotDate),
]);

// [S] Janet-graded task reviews; exists on ScrollFuel, port as-is
export const agentPerformance = pgTable("agent_performance", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  agentId: text("agent_id").notNull(),
  taskId: text("task_id").notNull(),
  avgScore: numeric("avg_score", { precision: 3, scale: 1 }).notNull(),
  reviewNotes: text("review_notes"),
  reviewedBy: text("reviewed_by").notNull().default("janet"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("agent_performance_avg_score_check", sql`${t.avgScore} BETWEEN 1 AND 10`),
]);

// [S] breaker state; Marcus reads/writes via subsidiary endpoint
export const circuitBreakerState = pgTable("circuit_breaker_state", {
  fingerprint: text("fingerprint").primaryKey(),           // sha256(product_id + task_id | normalized_error_sig)
  productId: text("product_id").notNull(),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  state: text("state").notNull().default("closed"),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  lastError: text("last_error"),                           // RAW stderr/body, never a generic string
  tripReason: text("trip_reason"),                         // 'consecutive_failures' | 'destructive_diff' | 'deploy_mismatch'
  escalationId: bigint("escalation_id", { mode: "number" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("circuit_breaker_state_state_check", sql`${t.state} IN ('closed','open','half_open')`),
]);

// [HQ] the only approval surface in the system
export const escalations = pgTable("escalations", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  productId: text("product_id").notNull(),
  category: text("category").notNull(),
  payload: jsonb("payload").notNull(),                     // what/why/diff/amount, enough to decide from a phone
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedVia: text("resolved_via"),
}, (t) => [
  check(
    "escalations_category_check",
    sql`${t.category} IN ('pricing_billing','capital_spend','legal_contract','new_subsidiary','protected_path','breaker_trip')`,
  ),
  check("escalations_status_check", sql`${t.status} IN ('pending','approved','rejected','deferred')`),
]);

// [HQ] deploy-target verification history
export const deployVerifications = pgTable("deploy_verifications", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  productId: text("product_id").notNull(),
  vercelProjectId: text("vercel_project_id").notNull(),    // from that repo's .vercel/project.json
  expectedDomain: text("expected_domain").notNull(),       // from productRegistry
  actualDomains: jsonb("actual_domains").notNull(),        // Vercel API response
  match: boolean("match").notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

// [S each + HQ for global scope] one shape, physical isolation by DB
export const osMemory = pgTable("os_memory", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  scope: text("scope").notNull(),
  scopeKey: text("scope_key").notNull(),                   // agent_id / campaign_id / contact_id / product_id
  key: text("key").notNull(),
  value: jsonb("value").notNull(),
  source: text("source").notNull(),
  binding: jsonb("binding"),                               // required when key LIKE 'behavior:%' (memoryContract)
  verifiedAt: timestamp("verified_at", { withTimezone: true }),   // set by the auto-queued verification task
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("os_memory_scope_check", sql`${t.scope} IN ('global','company','agent','campaign','contact','audit')`),
  unique("os_memory_scope_scope_key_key_key").on(t.scope, t.scopeKey, t.key),
]);

// [S] per-provider daily token ledger (Groq 100k TPD reality)
export const providerUsage = pgTable("provider_usage", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  provider: text("provider").notNull(),
  usageDate: date("usage_date").notNull(),
  tokensUsed: bigint("tokens_used", { mode: "number" }).notNull().default(0),
  exhaustedAt: timestamp("exhausted_at", { withTimezone: true }),
}, (t) => [
  unique("provider_usage_provider_usage_date_key").on(t.provider, t.usageDate),
]);

// [S + HQ] append-only; every autonomous action lands here
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target"),
  detail: jsonb("detail"),                                 // includes proof refs: commit SHA, deploy URL, message id
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
