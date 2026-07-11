ALTER TABLE "org_verified_domains" ADD COLUMN "verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_verified_domains" ADD COLUMN "verification_token" varchar(128);--> statement-breakpoint
ALTER TABLE "org_verified_domains" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_target_domain_enrolled() RETURNS trigger AS $$
DECLARE v_domain text;
BEGIN
  SELECT lower(split_part(t.email, '@', 2)) INTO v_domain FROM targets t WHERE t.id = NEW."targetId";
  IF v_domain IS NULL OR v_domain = '' THEN
    RAISE EXCEPTION 'compliance floor: target % has no resolvable email domain', NEW."targetId" USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM org_verified_domains d
    WHERE d."orgId" = NEW."orgId"
      AND d.verified = true
      AND (lower(d.domain) = v_domain OR v_domain LIKE '%.' || lower(d.domain))
  ) THEN
    RAISE EXCEPTION 'compliance floor: domain % is not a VERIFIED enrolled domain for org %', v_domain, NEW."orgId" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
