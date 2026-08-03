-- ─────────────────────────────────────────────────────────────────────────────
--  0020 — Mia handoff carries a CONTACT ADDRESS (PS-MIA-REACHABLE-01)
--
--  ADDITIVE ONLY. One nullable column on one table.
--
--  WHY THIS EXISTS
--    0019 made the handoff real: a row is written and a human is actually told, and notifiedAt
--    proves it. That path fires correctly in production — verified 2026-08-03.
--
--    The PAYLOAD was the defect. The Telegram arrived on Kaan's phone carrying org name, plan,
--    page and the customer's words, and NOT ONE WAY TO REACH THEM. Mia said "Kaan will email you
--    shortly". Kaan had no address to email.
--
--    That is a promise which is DELIVERED and still cannot be kept — a notification whose whole
--    purpose is to cause a contact, that omits the contact. Worse than a failed send, because a
--    failed send is visible as unnotified and this one reads as handled.
--
--  WHERE THE VALUE COMES FROM
--    The account email, from the users row of the logged-in session. We have had it since signup.
--    A logged-in customer must NEVER be asked for an address we already stored.
--
--  NULLABLE ON PURPOSE
--    users.email is itself nullable. NULL here means "we could not resolve an address", which is a
--    real and reportable state — the Telegram says so in words, and Mia is forbidden from promising
--    an email in that case. It must never be filled with a placeholder.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE mia_handoff_requests
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN mia_handoff_requests.email IS
  'PS-MIA-REACHABLE-01. The address a human can actually reply to, resolved from the logged-in account at capture time and preferred from the contact form when one is supplied. NULL means no address could be resolved, never a placeholder. Mia may not promise an email on a NULL row.';

-- The alarm query: an open request nobody can answer. A row with no address is not actionable no
-- matter how promptly it was delivered, so it gets its own index alongside the unnotified one.
CREATE INDEX IF NOT EXISTS mia_handoff_unreachable_idx
  ON mia_handoff_requests ("createdAt" ASC)
  WHERE email IS NULL AND "resolvedAt" IS NULL;
