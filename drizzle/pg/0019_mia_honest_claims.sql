-- ─────────────────────────────────────────────────────────────────────────────
--  0019 — Mia: conversation context, and a REAL human-handoff request (PS-MIA-HONEST-01)
--
--  ADDITIVE ONLY. One column, one new table. Nothing dropped, nothing rewritten.
--
--  WHY THIS EXISTS
--    Mia told a logged-in, paying customer to "click the chat icon in the bottom right and select
--    Talk to Sales", then "someone will reach out shortly".
--      · The chat icon is real (MiaWidget.tsx:214).
--      · "Talk to Sales" does not exist anywhere in the logged-in app — the string appears only on
--        the public marketing page. She invented a menu item inside her own widget.
--      · NOTHING notifies a human when a user asks for one. No route, no queue, no Telegram.
--        "Someone will reach out shortly" was a sentence with no action behind it.
--
--    That is a claimed ACTION WITH NO EXECUTOR, pointed at a customer instead of at Janet — the
--    same defect class as a read surface with no live writer, in its most expensive direction.
--
--  THE TABLE IS THE EXECUTOR
--    A promise of contact is only honest if something records the request and something tells a
--    human. This table is the record; notified_at is the proof the human was told. Mia may only say
--    she has flagged a request AFTER a row exists and notified_at is set — see feedbackTool.ts.
--
--  notified_at IS NULLABLE ON PURPOSE
--    A row with notified_at NULL means "recorded but nobody was told" — a real state that must be
--    visible rather than assumed away. The Janet standup reads exactly those rows so a request
--    cannot sit unnoticed just because Telegram happened to fail.
-- ─────────────────────────────────────────────────────────────────────────────

-- Conversation context on feedback: what the user said around the item, so a bug report is
-- actionable instead of a fragment. Nullable — existing rows predate it and must not be invented.
ALTER TABLE product_feedback
  ADD COLUMN IF NOT EXISTS "conversationContext" TEXT;

COMMENT ON COLUMN product_feedback."conversationContext" IS
  'PS-MIA-HONEST-01. The surrounding exchange at the time of capture. NULL on rows written before this column existed — absence means not captured, never "no context".';

CREATE TABLE IF NOT EXISTS mia_handoff_requests (
  id            SERIAL PRIMARY KEY,
  "userId"      INTEGER NOT NULL,
  "orgId"       INTEGER NOT NULL,

  -- What they asked for. 'sales' | 'support' | 'callback' | 'other'.
  kind          TEXT NOT NULL DEFAULT 'other',

  -- Their words, verbatim. Never a paraphrase — the human reading this needs what was actually said.
  message       TEXT NOT NULL,
  "conversationContext" TEXT,
  page          VARCHAR(255),
  plan          VARCHAR(32),

  -- ── Contact details, collected ONLY at handoff. Signup stays low-friction by design; a person
  -- ── who has just asked for a call has already opted into giving what a call requires.
  "firstName"   TEXT,
  "lastName"    TEXT,
  phone         TEXT,
  -- 'call' | 'email' | 'either'. Their stated preference, not our assumption.
  "preferredContact" TEXT,

  -- What they typed, verbatim: "9am", "after 3", "mornings". Kept even when resolved, because if the
  -- parse was wrong this is the only ground truth left.
  "bestTimeRaw" TEXT,
  -- IANA zone from Intl.DateTimeFormat().resolvedOptions().timeZone, user-correctable on the form.
  timezone      TEXT,
  -- THE RESOLVED ABSOLUTE INSTANT. A bare "9am" is unusable: 9am where? Kaan reads Eastern, calls at
  -- 9am Eastern, reaches a Pacific customer at 6am — a perfect record producing a wrong action.
  -- NULL when the time or zone could not be resolved, which is surfaced rather than defaulted.
  "callWindowAt" TIMESTAMPTZ,
  -- Pre-rendered for the human: "Tue, Aug 4, 9:00 AM PDT (Tue, Aug 4, 12:00 PM EDT your time)".
  "callWindowDisplay" TEXT,

  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Set ONLY when a notification to a human actually succeeded. NULL = recorded, nobody told yet.
  -- Mia's claim is gated on this being non-null; the standup surfaces the NULLs.
  "notifiedAt"  TIMESTAMPTZ,

  -- Set by a human when the request has been answered. NULL = still open.
  "resolvedAt"  TIMESTAMPTZ
);

-- The standup's hot query: open requests, oldest first — the ones a customer is still waiting on.
CREATE INDEX IF NOT EXISTS mia_handoff_open_idx
  ON mia_handoff_requests ("createdAt" ASC)
  WHERE "resolvedAt" IS NULL;

-- The alarm query: recorded but never notified. A request nobody was told about is the failure this
-- table exists to make impossible to miss.
CREATE INDEX IF NOT EXISTS mia_handoff_unnotified_idx
  ON mia_handoff_requests ("createdAt" ASC)
  WHERE "notifiedAt" IS NULL;

COMMENT ON COLUMN mia_handoff_requests."callWindowAt" IS
  'PS-MIA-CALLWINDOW-01. The resolved absolute instant of the requested call window. NULL means the stated time or the timezone could not be resolved — ask the customer, never assume the founder timezone.';

COMMENT ON TABLE mia_handoff_requests IS
  'PS-MIA-HONEST-01. A customer asking for a human. notifiedAt proves a person was actually told — Mia may not promise contact until it is set. Rows with notifiedAt NULL are surfaced in the daily standup.';
