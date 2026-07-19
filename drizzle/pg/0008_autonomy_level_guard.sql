-- PS-AUTONOMY-GUARD-01: guard the enforcement level at the DB write boundary.
-- os_autonomy_state.level had NO code writer and NO pgaudit, yet was raised manual->l2->l4
-- by direct hand-writes (2026-07-18 incident: l4 set with trust=0/streak=0, no earning path
-- in existence). This trigger makes a silent RAISE impossible:
--   * an unauthorized RAISE (level rank increases) is NEUTRALIZED — the row is held at the old
--     level, so the level cannot rise even though the UPDATE "succeeds";
--   * every attempt (raise refused, authorized raise, drop) is written to audit_log — an in-DB
--     trail that survives WITHOUT pgaudit. (We deliberately do NOT RAISE EXCEPTION on a refusal:
--     an ERROR rolls back the trigger's own audit INSERT, erasing the very evidence we need.)
--   * a raise is only honoured when the session opts in with `SET app.autonomy_grant_ok = 'yes'`
--     in the same transaction — an ad-hoc console UPDATE has no such grant, so it is refused +
--     logged + warned. A future legitimate promotion path raises deliberately and visibly.
--   * DROPS (to any lower level, including 'manual') are always allowed — containment is never
--     blocked.
-- Additive: creates a function + BEFORE INSERT/UPDATE trigger. The app never writes this table,
-- so no application path is affected.
CREATE OR REPLACE FUNCTION assert_autonomy_level_change() RETURNS trigger AS $$
DECLARE
  ranks text[] := ARRAY['manual','l2','l3','l4','l5'];
  rank_old int;
  rank_new int;
  attempted text := NEW.level;
  authorized boolean := COALESCE(current_setting('app.autonomy_grant_ok', true), 'no') = 'yes';
  outcome text;
BEGIN
  rank_new := array_position(ranks, NEW.level);
  IF TG_OP = 'UPDATE' THEN
    rank_old := array_position(ranks, OLD.level);
  ELSE
    rank_old := 1; -- INSERT baseline is 'manual'
  END IF;

  IF rank_new > rank_old AND NOT authorized THEN
    -- Unauthorized raise: hold the old level so it cannot rise. Warn (non-fatal) + log below.
    outcome := 'raise_refused';
    NEW.level := COALESCE(OLD.level, 'manual');
    RAISE WARNING 'autonomy guard: raise % -> % REFUSED (no earning grant); level held at %',
      COALESCE(OLD.level, '(insert)'), attempted, NEW.level;
  ELSIF rank_new > rank_old AND authorized THEN
    outcome := 'raise_authorized';
  ELSIF TG_OP = 'UPDATE' AND rank_new < rank_old THEN
    outcome := 'drop';
  ELSE
    outcome := CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'unchanged' END;
  END IF;

  -- Durable audit of every attempt. Survives because we never RAISE EXCEPTION here.
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
        'authorized', authorized,
        'session_user', session_user
      )
    );
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_assert_autonomy_level ON os_autonomy_state;
--> statement-breakpoint
CREATE TRIGGER trg_assert_autonomy_level
  BEFORE INSERT OR UPDATE ON os_autonomy_state
  FOR EACH ROW EXECUTE FUNCTION assert_autonomy_level_change();
