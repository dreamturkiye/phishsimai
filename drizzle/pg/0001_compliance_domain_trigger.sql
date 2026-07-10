-- Compliance floor at the DB write boundary (Genesis §2.4 — guard at the write, both doors).
-- A campaign_results INSERT is refused unless the target's email domain is enrolled
-- (exact or subdomain) in org_verified_domains for that row's org. Postgres supports
-- triggers (TiDB did not), so the DB itself enforces the floor even if application code
-- is ever bypassed. Additive: creates a function + BEFORE INSERT trigger, nothing dropped.
-- NOT YET APPLIED — held at the DB-apply gate.
CREATE OR REPLACE FUNCTION assert_target_domain_enrolled() RETURNS trigger AS $$
DECLARE
  v_domain text;
BEGIN
  SELECT lower(split_part(t.email, '@', 2)) INTO v_domain
  FROM targets t
  WHERE t.id = NEW."targetId";

  IF v_domain IS NULL OR v_domain = '' THEN
    RAISE EXCEPTION 'compliance floor: target % has no resolvable email domain', NEW."targetId"
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM org_verified_domains d
    WHERE d."orgId" = NEW."orgId"
      AND (lower(d.domain) = v_domain OR v_domain LIKE '%.' || lower(d.domain))
  ) THEN
    RAISE EXCEPTION 'compliance floor: domain % is not enrolled for org %', v_domain, NEW."orgId"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_assert_target_domain_enrolled ON campaign_results;
--> statement-breakpoint
CREATE TRIGGER trg_assert_target_domain_enrolled
  BEFORE INSERT ON campaign_results
  FOR EACH ROW EXECUTE FUNCTION assert_target_domain_enrolled();
