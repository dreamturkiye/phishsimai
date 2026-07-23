-- PS-AUTONOMY-DROP-AUDIT-01: make the autonomy level tamper-evident in BOTH directions.
--
-- The guard from 0009/0010 is `BEFORE INSERT OR UPDATE`. That leaves two holes, and the
-- production trail shows at least one of them was taken:
--
--   audit_log (actor='autonomy_guard'), phishsimai, verbatim:
--     2026-07-19T03:59:15.716Z  raise_authorized  manual -> l2   (grant 1)
--     2026-07-21T03:53:25.206Z  raise_authorized  manual -> l2   (grant 2)
--
--   The second raise starts FROM 'manual'. So the level fell l2 -> manual in between, and
--   `SELECT count(*) FROM audit_log WHERE action IN ('drop','demote')` = 0 across all time.
--   A level moved with no record of it moving.
--
-- Hole 1 — DELETE is not covered at all. `DELETE FROM os_autonomy_state` fires nothing, and a
--   later re-INSERT is evaluated against rank_old := 1 ('manual'), so the delete+reinsert pair
--   launders a level change into what looks like a fresh seed.
-- Hole 2 — a drop is audited only on the happy path. The 0009 handler swallowed just
--   `undefined_table`, so any other failure of the audit INSERT lost the row silently, and a
--   drop (unlike a raise) raised no escalation, so nothing downstream noticed the absence.
--
-- This does NOT try to make demotion hard. Demotion is the SAFE direction — a breaker trip must
-- always be able to step the level down, and an audit failure must never roll that back. The goal
-- is only that a downward move can never happen SILENTLY, which is what makes the trail
-- trustworthy as evidence rather than merely usually-correct.
--
-- Deliberately NOT changed here: the `ranks` vocabulary stays manual|l2|l3|l4|l5. See the
-- L5.7/L5.8 spec analysis — those are portfolio maturity postures in KAAN_AI_OS_V7.3, not rungs
-- of this per-company enforcement gate, and the governing doc never maps them onto this column.

-- ── 1. Audit + escalate DELETEs ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION audit_autonomy_state_delete() RETURNS trigger AS $$
BEGIN
  BEGIN
    INSERT INTO audit_log (actor, action, target, detail)
    VALUES (
      'autonomy_guard',
      'row_deleted',
      OLD.company_id,
      jsonb_build_object(
        'from', OLD.level,
        'attempted', '(deleted)',
        'effective', '(row gone)',
        'grant_id', NULL,
        'trust', OLD.trust,
        'clean_day_streak', OLD.clean_day_streak,
        'session_user', session_user
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Deleting the state row is never routine: it is either a migration reset or an attempt to
  -- clear the level's history. Either way the founder should hear about it the same way a raise
  -- is heard about.
  BEGIN
    INSERT INTO escalations (product_id, category, payload)
    VALUES (
      OLD.company_id,
      'autonomy_change',
      jsonb_build_object(
        'outcome', 'row_deleted',
        'from', OLD.level,
        'attempted', '(deleted)',
        'effective', '(row gone)',
        'session_user', session_user
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_audit_autonomy_delete ON os_autonomy_state;
--> statement-breakpoint
CREATE TRIGGER trg_audit_autonomy_delete
  BEFORE DELETE ON os_autonomy_state
  FOR EACH ROW EXECUTE FUNCTION audit_autonomy_state_delete();

-- ── 2. Escalate DROPs, and stop losing the audit row on an unexpected error ──
-- Same body as 0010 except: the drop branch now escalates, and every audit/escalation write
-- catches WHEN OTHERS so a downstream problem can never convert a recorded event into an
-- unrecorded one by aborting the statement.
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_autonomy_level_change() RETURNS trigger AS $$
DECLARE
  ranks    text[] := ARRAY['manual','l2','l3','l4','l5'];
  rank_old int;
  rank_new int;
  attempted text := NEW.level;
  outcome  text;
  grant_id bigint;
BEGIN
  rank_new := array_position(ranks, NEW.level);
  IF TG_OP = 'UPDATE' THEN
    rank_old := array_position(ranks, OLD.level);
  ELSE
    rank_old := 1;
  END IF;

  IF rank_new > rank_old THEN
    SELECT id INTO grant_id
      FROM autonomy_grants
      WHERE company_id = NEW.company_id
        AND from_level = COALESCE(OLD.level, 'manual')
        AND to_level   = NEW.level
        AND direction  = 'promote'
        AND consumed_at IS NULL
        AND created_at > now() - interval '10 minutes'
      ORDER BY created_at DESC
      LIMIT 1;

    IF grant_id IS NOT NULL THEN
      UPDATE autonomy_grants SET consumed_at = now() WHERE id = grant_id;
      outcome := 'raise_authorized';
    ELSE
      outcome := 'raise_refused';
      NEW.level := COALESCE(OLD.level, 'manual');
      RAISE WARNING 'autonomy guard: raise % -> % REFUSED (no earning grant token); level held at %',
        COALESCE(OLD.level, '(insert)'), attempted, NEW.level;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND rank_new < rank_old THEN
    outcome := 'drop';
  ELSE
    outcome := CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'unchanged' END;
  END IF;

  BEGIN
    INSERT INTO audit_log (actor, action, target, detail)
    VALUES (
      'autonomy_guard',
      outcome,
      NEW.company_id,
      jsonb_build_object(
        'from', COALESCE(OLD.level, '(insert)'),
        'attempted', attempted,
        'effective', NEW.level,
        'grant_id', grant_id,
        'session_user', session_user
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 'drop' joins the escalated set. A demotion is a real safety event when the breaker fires it,
  -- and a tamper signal when nothing did — either way it must not be the one level change the
  -- founder never sees.
  IF outcome IN ('raise_refused', 'raise_authorized', 'drop') THEN
    BEGIN
      INSERT INTO escalations (product_id, category, payload)
      VALUES (NEW.company_id, 'autonomy_change',
        jsonb_build_object('outcome', outcome, 'from', COALESCE(OLD.level, '(insert)'),
          'attempted', attempted, 'effective', NEW.level, 'session_user', session_user));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_assert_autonomy_level ON os_autonomy_state;
--> statement-breakpoint
CREATE TRIGGER trg_assert_autonomy_level
  BEFORE INSERT OR UPDATE ON os_autonomy_state
  FOR EACH ROW EXECUTE FUNCTION assert_autonomy_level_change();
