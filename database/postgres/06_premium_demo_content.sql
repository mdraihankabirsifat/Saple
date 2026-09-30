-- ===========================================================================
-- SAPLE: OPTIONAL PREMIUM DEMONSTRATION CONTENT
-- ===========================================================================
--
-- Run only after migration 009 (migrations/009_premium_subscriptions.sql),
-- and only on a database that already holds the optional bulk demonstration
-- data from 04_bulk_demo_data_postgres.sql. It is not a migration.
--
-- What it does
--   Marks about a third of the SYNTHETIC bulk vacancies as Premium-only, so
--   the Premium job gate can be demonstrated on a database that loaded the
--   bulk data before Premium existed. A fresh load of 04 already does this,
--   and the script then changes nothing.
--
-- How it finds those vacancies
--   Only jobs created by a bulk demonstration account: every such account has
--   the same unusable placeholder password hash, a value registration can
--   never produce. No real account can match it, so no real vacancy is ever
--   selected. The choice of which synthetic jobs become Premium is a fixed
--   hash of the job id, so re-running the script changes nothing further.
--
-- Side effect
--   The row-level updated_at trigger stamps the changed synthetic vacancies
--   with the current time.
--
-- To undo (synthetic vacancies only):
--   UPDATE job_postings jp SET access_level = 'FREE'
--   FROM users u
--   WHERE u.user_id = jp.created_by_user_id
--     AND u.password_hash = '$2b$10$SAPLE.BULK.DEMO.ACCOUNT.NO.LOGIN'
--     AND jp.access_level = 'PREMIUM';
--
-- One transaction: everything is applied, or nothing is.
-- ===========================================================================

BEGIN;

DO $$
DECLARE
  marker CONSTANT TEXT := '$2b$10$SAPLE.BULK.DEMO.ACCOUNT.NO.LOGIN';
  changed BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job_postings' AND column_name = 'access_level'
  ) THEN
    RAISE EXCEPTION 'job_postings.access_level does not exist. Run migration 009 first. Nothing was changed.';
  END IF;

  -- A fresh load of 04, or an earlier run of this script, already chose the
  -- Premium vacancies. Leave that choice alone.
  IF EXISTS (
    SELECT 1 FROM job_postings jp JOIN users u ON u.user_id = jp.created_by_user_id
    WHERE u.password_hash = marker AND jp.access_level = 'PREMIUM'
  ) THEN
    RAISE NOTICE 'Synthetic Premium vacancies already exist. Nothing was changed.';
    RETURN;
  END IF;

  UPDATE job_postings jp
  SET access_level = 'PREMIUM'
  FROM users u
  WHERE u.user_id = jp.created_by_user_id
    AND u.password_hash = marker
    AND jp.access_level = 'FREE'
    AND ('x' || SUBSTR(MD5('premium-demo:' || jp.job_id::TEXT), 1, 8))::BIT(32)::BIGINT / 4294967296.0 < 0.35;
  GET DIAGNOSTICS changed = ROW_COUNT;

  RAISE NOTICE '% synthetic vacancies marked Premium.', changed;
END $$;

COMMIT;

-- Read-only check: Premium share of synthetic and of real vacancies. The real
-- row must show zero Premium vacancies unless a representative chose it.
SELECT
  CASE WHEN u.password_hash = '$2b$10$SAPLE.BULK.DEMO.ACCOUNT.NO.LOGIN' THEN 'synthetic' ELSE 'real' END AS origin,
  COUNT(*) AS vacancies,
  COUNT(*) FILTER (WHERE jp.access_level = 'PREMIUM') AS premium_vacancies
FROM job_postings jp
JOIN users u ON u.user_id = jp.created_by_user_id
GROUP BY 1
ORDER BY 1;
