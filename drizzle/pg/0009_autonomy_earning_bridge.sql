-- PS-AUTONOMY-BRIDGE-01: connect the clean-day ladder to the enforcement gate through an
-- AUDITED, token-gated promotion path — the fix the l4 incident exposed (ladder computed levels
-- but never wrote os_autonomy_state, so the only way the level ever moved was a hand-write).
--
-- This upgrades the PS-AUTONOMY-GUARD-01 trigger (0008) from a session-flag grant to a durable
-- GRANT-TOKEN table. A RAISE is honoured ONLY when the autonomy_promotion_job has written a
-- matching, unconsumed, fresh autonomy_grants row; the trigger consumes it. A hand-write with no
-- token is held at the old level and logged. DROPS (demotions) are always allowed (safety), still
-- audited. Every attempt lands in audit_log — in-DB attribution without pgaudit.

CREATE TABLE IF NOT EXISTS autonomy_grants (
  id           BIGSERIAL PRIMARY KEY,
  company_id   TEXT NOT NULL,
  from_level   TEXT NOT NULL,
  to_level     TEXT NOT NULL,
  direction    TEXT NOT NULL,                       -- 'promote' | 'demote'
  reason       TEXT NOT NULL,
  clean_days   INTEGER NOT NULL DEFAULT 0,
  trust        NUMERIC NOT NULL DEFAULT 0,
  created_by   TEXT NOT NULL DEFAULT 'autonomy_promotion_job',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at  TIMESTAMPTZ                          -- set by the guard trigger when a raise consumes it
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_autonomy_grants_lookup
  ON autonomy_grants (company_id, to_level, consumed_at, created_at);
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
    rank_old := 1; -- INSERT baseline is 'manual'
  END IF;

  IF rank_new > rank_old THEN
    -- A RAISE: require a matching unconsumed, fresh promote grant token.
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
      NEW.level := COALESCE(OLD.level, 'manual'); -- hold: cannot rise without a token
      RAISE WARNING 'autonomy guard: raise % -> % REFUSED (no earning grant token); level held at %',
        COALESCE(OLD.level, '(insert)'), attempted, NEW.level;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND rank_new < rank_old THEN
    outcome := 'drop'; -- demotion: always allowed (safety), still audited
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
