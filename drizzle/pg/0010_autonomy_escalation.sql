-- PS-ESCALATION-COVERAGE-01: route autonomy-level changes to the founder early-warning path.
-- The l4 incident was a SILENT hand-write — nothing alerted until Kaan happened to check. The guard
-- trigger (0009) already SEES every os_autonomy_state write (the only thing that does, incl. direct
-- hand-writes). This extends it to also write an `escalations` row for a RAISE (refused hand-write OR
-- authorized promotion), so escalation-notify (*/15) delivers it to Telegram.
--
-- First: widen the escalations category CHECK to admit the new founder-alert categories used here and
-- by raiseEscalation() (autonomy_change / marcus_dispatch / agent_critical). Existing values kept.
ALTER TABLE escalations DROP CONSTRAINT IF EXISTS escalations_category_check;
--> statement-breakpoint
ALTER TABLE escalations ADD CONSTRAINT escalations_category_check CHECK (
  category = ANY (ARRAY[
    'pricing_billing','capital_spend','legal_contract','new_subsidiary','protected_path','breaker_trip',
    'autonomy_change','marcus_dispatch','agent_critical'
  ])
);
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
    VALUES ('autonomy_guard', outcome, NEW.company_id,
      jsonb_build_object('from', COALESCE(OLD.level, '(insert)'), 'attempted', attempted,
        'effective', NEW.level, 'grant_id', grant_id, 'session_user', session_user));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Escalate a RAISE to the founder alert path. Best-effort (WHEN OTHERS): an escalation-write
  -- failure must NEVER roll back the autonomy write itself.
  IF outcome IN ('raise_refused', 'raise_authorized') THEN
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
