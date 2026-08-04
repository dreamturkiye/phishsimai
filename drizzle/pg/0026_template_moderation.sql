-- ─────────────────────────────────────────────────────────────────────────────
--  0026 — community template moderation gate (PS-MARKETPLACE-GATE-01)
--
--  ADDITIVE ONLY. One nullable column + a backfill of existing rows.
--
--  WHY THIS EXISTS
--    Setting templates.isShared = true published a template to the community pool INSTANTLY, with
--    zero review — any org could share anything and every other org saw it. That is a quality and
--    safety hole (a low-quality or hostile template reaches everyone). This adds a moderation state
--    so a shared template is community-visible ONLY after approval.
--
--    Built-in templates are ours and trusted; they are not surfaced through the community path and
--    are backfilled 'approved' so nothing about their visibility changes. Existing user-shared
--    templates are grandfathered 'approved' (they were already public under the old no-gate regime);
--    the gate applies to shares going FORWARD, which land 'pending' until reviewed.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS "moderationStatus" TEXT NOT NULL DEFAULT 'pending';

-- Grandfather existing rows so nothing already visible disappears:
UPDATE templates SET "moderationStatus" = 'approved'
  WHERE "isBuiltIn" = true OR "isShared" = true;

CREATE INDEX IF NOT EXISTS templates_moderation_idx
  ON templates ("isShared", "moderationStatus");

COMMENT ON COLUMN templates."moderationStatus" IS
  'PS-MARKETPLACE-GATE-01. pending, approved or rejected. A shared template reaches the community pool ONLY when approved. New shares land pending. Built-ins and pre-existing shares are grandfathered approved. Never surfaced to the community as approved without review.';
