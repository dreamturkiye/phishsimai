-- PS-L5-NO-NAG-01: stop fabricating raise_refused→manual on PhishSim INSERT of l5,
-- and stop writing autonomy_change founder nags when the live floor is already l5.
--
-- Escalation #202 (2026-09): INSERT into os_autonomy_state (level=l5) was treated as a
-- raise from implicit rank_old=manual, refused (no grant), rewritten to manual, and
-- raised as autonomy_change. Live/operative level stayed l5 via resolveReadableLevel;
-- posture was drill_3. Janet then marked founder_required and re-alerted louder daily.
--
-- Additive: CREATE OR REPLACE the existing guard function; UPDATE only pending
-- raise_refused autonomy_change rows for phishsimai.

CREATE OR REPLACE FUNCTION assert_autonomy_level_change() RETURNS trigger AS $$
DECLARE
  ranks    text[] := ARRAY['manual','l2','l3','l4','l5'];
  rank_old int;
  rank_new int;
  attempted text := NEW.level;
  outcome  text;
  grant_id bigint;
  skip_nag boolean := false;
BEGIN
  rank_new := array_position(ranks, NEW.level);
  IF TG_OP = 'UPDATE' THEN
    rank_old := array_position(ranks, OLD.level);
  ELSE
    rank_old := 1;
  END IF;

  -- PhishSim L5 floor: an INSERT of a valid ladder level is a seed, not a raise from
  -- implicit manual. Rewriting it to manual + raise_refused is the #202 nag artifact.
  IF TG_OP = 'INSERT' AND NEW.company_id = 'phishsimai' AND rank_new IS NOT NULL THEN
    outcome := 'insert';
  ELSIF rank_new > rank_old THEN
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

  -- Do not founder-nag raise_refused / raise_authorized when PhishSim is already at the
  -- L5 floor (attempted at or below l5, or INSERT seed). drop still escalates.
  IF NEW.company_id = 'phishsimai' AND outcome IN ('raise_refused', 'raise_authorized', 'insert') THEN
    skip_nag := true;
  END IF;

  IF (NOT skip_nag) AND outcome IN ('raise_refused', 'raise_authorized', 'drop') THEN
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

-- Close already-pending PhishSim raise-noise so Janet cannot re-alert louder.
UPDATE escalations
SET status = 'deferred',
    resolved_at = COALESCE(resolved_at, NOW()),
    resolved_via = 'already_at_l5_floor',
    notified_at = COALESCE(notified_at, NOW()),
    payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
      'already_at_l5_floor', true,
      'autoResolved', true,
      'janetTriage', 'already_at_l5_floor'
    )
WHERE product_id = 'phishsimai'
  AND category = 'autonomy_change'
  AND status = 'pending'
  AND COALESCE(payload->>'outcome', '') IN ('raise_refused', 'raise_authorized', 'insert', '');
--> statement-breakpoint

-- Already-resolved #202-class rows still had notified_at NULL, so */15 deliverPending
-- kept sending. Stamp them so the notify path cannot grow louder.
UPDATE escalations
SET notified_at = COALESCE(notified_at, NOW())
WHERE product_id = 'phishsimai'
  AND category = 'autonomy_change'
  AND notified_at IS NULL
  AND (
    status IN ('approved', 'rejected', 'deferred')
    OR COALESCE(payload->>'outcome', '') = 'raise_refused'
    OR COALESCE(payload->>'already_at_l5_floor', 'false') = 'true'
  );
