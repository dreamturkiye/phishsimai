-- ─────────────────────────────────────────────────────────────────────────────
--  0018 — suppression invariants as database triggers (PS-REX-RECONCILE-01)
--
--  ADDITIVE ONLY. Two triggers, no schema change, no data migration. The one-off correction of the
--  27 existing rows is done by the gated writer in server/os/agents/rexReconcile.ts, not here —
--  a migration that silently rewrites 27 rows of funnel state is exactly the un-audited write this
--  whole agent org exists to prevent.
--
--  THE TWO INVARIANTS
--    1. unsubscribed = true CANNOT coexist with an active pipeline_stage.
--    2. A suppression row REQUIRES the matching lead flagged unsubscribed.
--
--  WHY AUTO-CORRECT INSTEAD OF RAISE
--    The obvious implementation raises an exception on violation. That was rejected: several live
--    paths legitimately set `unsubscribed = true` and let the stage follow (unsubscribe.ts:78 sets
--    both, replyParser.ts:119 sets both, but a future caller doing one is a correctness bug we would
--    convert into a 500 on the unsubscribe page). Making the unsubscribe LINK fail is a worse
--    outcome than a stale stage — it is the one page where an error has a legal consequence.
--
--    So these triggers make the invariant IMPOSSIBLE TO VIOLATE rather than making the write fail:
--    the flag wins, and the stage is dragged to terminal. A caller that sets only `unsubscribed`
--    gets correct state instead of an error.
--
--  WHY THE DB AND NOT JUST REX
--    Rex detects this class daily and is the reason it was found. But detection is a scan-interval
--    behind reality, and a row can be created, read by a send path, and reported on between two of
--    his runs. The trigger closes the window; Rex's checks remain as the assertion that the trigger
--    is actually working. Belt and braces, deliberately.
--
--  internal_test IS PRESERVED
--    It is a quarantine label, not a pipeline stage. Dragging it to 'dead' would move the founder's
--    own test row out of the bucket every metric query excludes it by.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Invariant 1: unsubscribed ⇒ terminal stage ──────────────────────────────
CREATE OR REPLACE FUNCTION assert_unsub_implies_terminal() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.unsubscribed IS TRUE
     AND NEW.pipeline_stage IS DISTINCT FROM 'dead'
     AND NEW.pipeline_stage IS DISTINCT FROM 'internal_test' THEN
    NEW.pipeline_stage := 'dead';
    NEW.stage_updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_unsub_implies_terminal ON ps_outreach_leads;
CREATE TRIGGER trg_unsub_implies_terminal
  BEFORE INSERT OR UPDATE OF unsubscribed, pipeline_stage ON ps_outreach_leads
  FOR EACH ROW EXECUTE FUNCTION assert_unsub_implies_terminal();

-- ── Invariant 2: a suppression row ⇒ the lead is flagged unsubscribed ────────
-- AFTER INSERT, because it updates a DIFFERENT table than the one being written. The UPDATE fires
-- trigger 1 in turn, which drags the stage terminal — so one INSERT here fully reconciles the lead.
CREATE OR REPLACE FUNCTION assert_suppression_implies_unsub() RETURNS TRIGGER AS $$
BEGIN
  UPDATE ps_outreach_leads
     SET unsubscribed = TRUE
   WHERE lower(email) = lower(NEW.email)
     AND unsubscribed IS DISTINCT FROM TRUE;
  RETURN NULL; -- AFTER trigger: return value is ignored
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_suppression_implies_unsub ON ps_outreach_suppression;
CREATE TRIGGER trg_suppression_implies_unsub
  AFTER INSERT ON ps_outreach_suppression
  FOR EACH ROW EXECUTE FUNCTION assert_suppression_implies_unsub();

COMMENT ON FUNCTION assert_unsub_implies_terminal() IS
  'PS-REX-RECONCILE-01 invariant 1. Auto-corrects rather than raising — failing the unsubscribe page is worse than a stale stage.';
COMMENT ON FUNCTION assert_suppression_implies_unsub() IS
  'PS-REX-RECONCILE-01 invariant 2. Provider suppression truth propagates to the lead flag on insert.';
