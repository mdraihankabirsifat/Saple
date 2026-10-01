-- ===========================================================================
-- SAPLE: OPTIONAL SYNTHETIC SALARY BALANCE (VERIFIED VS COMMUNITY)
-- ===========================================================================
--
-- This is NOT a migration, and the application never needs it. It is for a
-- database that already holds the optional bulk demonstration data from
-- 04_bulk_demo_data_postgres.sql, loaded before 04 learned to do this itself.
--
-- Why it exists
--   The Community salary range is every approved salary; the Verified range
--   is the approved salaries whose submission is VERIFIED. That is correct.
--   But in the older synthetic data most popular company-role pairs were
--   reported only by verified synthetic contributors, so the two ranges and
--   counts were often identical. Real data would not look like that.
--
-- What it does
--   For each synthetic company + role + currency + pay period group, it adds
--   approved UNVERIFIED community salary observations until verified rows
--   make up roughly 40-60% of a popular group, or adds one or two when a
--   small group is entirely verified. Groups that already differ are left
--   alone. Community-only values spread a little wider around the group's
--   verified centre (about +/-17%) than verified ones do.
--
-- Trust rules it keeps
--   - Nothing is marked VERIFIED. Every added row is UNVERIFIED, and its
--     author is a synthetic account with no VERIFIED employment record for
--     that company and role, so the Verified range is never inflated.
--   - It only ADDS rows, authored only by bulk demonstration accounts (the
--     unusable placeholder password hash below). It never updates or deletes
--     anything, and never touches a real account, real submission, company,
--     job, review, interview or verification record.
--   - IDs come from the database sequence. The choices are deterministic, and
--     re-running it adds nothing, because each group is already balanced and
--     each chosen author already has a salary at that company.
--
-- 05_remove_bulk_demo_data.sql removes these rows with the rest of the bulk
-- data, because they belong to the same synthetic accounts.
--
-- One transaction: everything is added, or nothing is.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.balance_marker() RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$ SELECT '$2b$10$SAPLE.BULK.DEMO.ACCOUNT.NO.LOGIN'::TEXT $$;

-- Deterministic number in [0, 1) from a text seed: the same on every run.
CREATE OR REPLACE FUNCTION pg_temp.balance_rand(seed TEXT) RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('x' || SUBSTR(MD5(seed), 1, 8))::BIT(32)::BIGINT / 4294967296.0
$$;

-- Salaries are rounded to a sensible step for each currency.
CREATE OR REPLACE FUNCTION pg_temp.balance_unit(currency TEXT) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE currency WHEN 'BDT' THEN 500 WHEN 'JPY' THEN 10000 WHEN 'KRW' THEN 100000
    WHEN 'INR' THEN 10000 WHEN 'DKK' THEN 5000 ELSE 1000 END::NUMERIC
$$;

-- Synthetic approved salaries grouped exactly as the salary pages group them.
CREATE TEMP TABLE balance_group ON COMMIT DROP AS
WITH grouped AS (
  SELECT s.company_id, ss.role_id, ss.currency, ss.pay_period,
    COUNT(*)::INT AS community_count,
    COUNT(*) FILTER (WHERE s.verification_status = 'VERIFIED')::INT AS verified_count,
    -- Observed salaries, verified ones preferred, used as anchors so new
    -- values follow the group's real spread across experience levels.
    COALESCE(
      ARRAY_AGG(ss.base_salary ORDER BY ss.base_salary) FILTER (WHERE s.verification_status = 'VERIFIED'),
      ARRAY_AGG(ss.base_salary ORDER BY ss.base_salary)) AS anchors,
    AVG(ss.years_of_experience) AS avg_years,
    MODE() WITHIN GROUP (ORDER BY ss.work_mode) AS work_mode
  FROM submissions s
  JOIN salary_submissions ss ON ss.submission_id = s.submission_id
  JOIN users u ON u.user_id = s.user_id
  WHERE u.password_hash = pg_temp.balance_marker()
    AND s.submission_type = 'SALARY' AND s.submission_status = 'APPROVED'
  GROUP BY s.company_id, ss.role_id, ss.currency, ss.pay_period
),
targets AS (
  SELECT g.*,
    g.company_id || ':' || g.role_id || ':' || g.currency || ':' || g.pay_period AS group_key,
    -- Each popular group aims for its own verified share between 40% and 60%.
    0.40 + 0.20 * pg_temp.balance_rand('balance-share:' || g.company_id || ':' || g.role_id || ':' || g.currency || ':' || g.pay_period) AS share
  FROM grouped g
)
SELECT t.*,
  GREATEST(0, CASE
    -- Already healthy: more community than verified, verified at most ~65%.
    WHEN t.community_count > t.verified_count AND t.verified_count <= 0.65 * t.community_count THEN 0
    -- Popular groups: at least 8 community observations, verified near the
    -- group's share, and never more than 12 rows added to one group.
    WHEN t.verified_count >= 4
      THEN LEAST(12, GREATEST(8, CEIL(t.verified_count / t.share)::INT) - t.community_count)
    -- Small all-verified groups: one or two community-only observations.
    WHEN t.verified_count >= 1 AND t.community_count = t.verified_count
      THEN 1 + FLOOR(pg_temp.balance_rand('balance-small:' || t.group_key) * 2)::INT
    ELSE 0 END) AS needed
FROM targets t;

-- Authors: synthetic accounts with no VERIFIED employment record for this
-- company and role, and no salary at this company yet, in a stable order.
CREATE TEMP TABLE balance_plan ON COMMIT DROP AS
SELECT NEXTVAL(pg_get_serial_sequence('submissions', 'submission_id')) AS sid, p.*,
  -- A community-only value: one observed salary from the group, varied by up
  -- to about 17% either way, so it can sit a little beyond the verified range.
  GREATEST(pg_temp.balance_unit(p.currency),
    ROUND(p.anchors[1 + FLOOR(pg_temp.balance_rand('balance-anchor:' || p.row_key) * CARDINALITY(p.anchors))::INT]
      * (0.83 + 0.34 * pg_temp.balance_rand('balance-pay:' || p.row_key)) / pg_temp.balance_unit(p.currency))
      * pg_temp.balance_unit(p.currency)) AS base_salary,
  GREATEST(p.created_at + INTERVAL '1 day',
    CURRENT_TIMESTAMP - ((5 + FLOOR(pg_temp.balance_rand('balance-when:' || p.row_key) * 540)) || ' days')::INTERVAL)
    - ((FLOOR(pg_temp.balance_rand('balance-hour:' || p.row_key) * 600)) || ' minutes')::INTERVAL AS submitted_at
FROM (
  SELECT g.*, c.user_id, c.created_at, g.group_key || ':' || c.user_id AS row_key
  FROM balance_group g
  CROSS JOIN LATERAL (
    SELECT u.user_id, u.created_at,
      ROW_NUMBER() OVER (ORDER BY MD5(g.group_key || ':author:' || u.user_id)) AS rn
    FROM users u
    WHERE u.password_hash = pg_temp.balance_marker()
      AND u.account_status = 'ACTIVE'
      AND u.created_at < CURRENT_TIMESTAMP - INTERVAL '10 days'
      AND NOT EXISTS (
        SELECT 1 FROM employment_verifications ev
        JOIN employees e ON e.employee_id = ev.employee_id
        WHERE e.user_id = u.user_id AND ev.company_id = g.company_id AND ev.role_id = g.role_id
          AND ev.verification_status = 'VERIFIED')
      AND NOT EXISTS (
        SELECT 1 FROM submissions s2
        WHERE s2.user_id = u.user_id AND s2.company_id = g.company_id AND s2.submission_type = 'SALARY')
  ) c
  WHERE g.needed > 0 AND c.rn <= g.needed
) p;

INSERT INTO submissions (submission_id, user_id, company_id, submission_type, is_anonymous,
  submission_status, verification_status, submitted_at, approved_at, updated_at)
SELECT sid, user_id, company_id, 'SALARY', 1, 'APPROVED', 'UNVERIFIED', submitted_at, approved, approved
FROM (
  SELECT bp.*, LEAST(bp.submitted_at + ((6 + FLOOR(pg_temp.balance_rand('balance-approved:' || bp.row_key) * 120)) || ' hours')::INTERVAL,
    CURRENT_TIMESTAMP - INTERVAL '30 minutes') AS approved
  FROM balance_plan bp
) planned;

INSERT INTO salary_submissions (submission_id, role_id, base_salary, additional_compensation, currency,
  pay_period, years_of_experience, employment_type, work_mode, salary_year)
SELECT sid, role_id, base_salary,
  CASE WHEN pg_temp.balance_rand('balance-bonus:' || row_key) < 0.6 THEN NULL
       ELSE NULLIF(ROUND(base_salary * 0.08 / pg_temp.balance_unit(currency)) * pg_temp.balance_unit(currency), 0) END,
  currency, pay_period,
  LEAST(60, GREATEST(0, ROUND((COALESCE(avg_years, 3) + (pg_temp.balance_rand('balance-years:' || row_key) - 0.5) * 3)::NUMERIC, 1))),
  'FULL_TIME', COALESCE(work_mode, 'ONSITE'),
  EXTRACT(YEAR FROM submitted_at)::INT
FROM balance_plan;

COMMIT;

-- ===========================================================================
-- Read-only validation. Nothing below changes data.
-- ===========================================================================

-- Dense groups first: community and verified side by side.
SELECT c.company_name AS company, jr.role_name AS role, ss.currency, ss.pay_period,
  COUNT(*) AS community_count,
  COUNT(*) FILTER (WHERE s.verification_status = 'VERIFIED') AS verified_count,
  MIN(ss.base_salary) AS community_min,
  MIN(ss.base_salary) FILTER (WHERE s.verification_status = 'VERIFIED') AS verified_min,
  MAX(ss.base_salary) AS community_max,
  MAX(ss.base_salary) FILTER (WHERE s.verification_status = 'VERIFIED') AS verified_max,
  ROUND(AVG(ss.base_salary), 2) AS community_avg,
  ROUND(AVG(ss.base_salary) FILTER (WHERE s.verification_status = 'VERIFIED'), 2) AS verified_avg
FROM submissions s
JOIN salary_submissions ss ON ss.submission_id = s.submission_id
JOIN companies c ON c.company_id = s.company_id
JOIN job_roles jr ON jr.role_id = ss.role_id
WHERE s.submission_type = 'SALARY' AND s.submission_status = 'APPROVED'
GROUP BY c.company_name, jr.role_name, ss.currency, ss.pay_period
ORDER BY COUNT(*) DESC, c.company_name, jr.role_name
LIMIT 40;

-- Summary: most dense groups should differ; some small groups may match.
WITH groups AS (
  SELECT s.company_id, ss.role_id, ss.currency, ss.pay_period,
    COUNT(*) AS community_count,
    COUNT(*) FILTER (WHERE s.verification_status = 'VERIFIED') AS verified_count,
    MIN(ss.base_salary) AS community_min, MAX(ss.base_salary) AS community_max,
    MIN(ss.base_salary) FILTER (WHERE s.verification_status = 'VERIFIED') AS verified_min,
    MAX(ss.base_salary) FILTER (WHERE s.verification_status = 'VERIFIED') AS verified_max
  FROM submissions s
  JOIN salary_submissions ss ON ss.submission_id = s.submission_id
  WHERE s.submission_type = 'SALARY' AND s.submission_status = 'APPROVED'
  GROUP BY s.company_id, ss.role_id, ss.currency, ss.pay_period
)
SELECT
  COUNT(*) AS groups,
  COUNT(*) FILTER (WHERE community_count > verified_count) AS community_greater_than_verified,
  COUNT(*) FILTER (WHERE community_count = verified_count) AS community_equal_to_verified,
  COUNT(*) FILTER (WHERE verified_count > 0 AND (community_min <> verified_min OR community_max <> verified_max)) AS ranges_differ,
  COUNT(*) FILTER (WHERE community_count >= 8) AS dense_groups,
  COUNT(*) FILTER (WHERE community_count >= 8 AND verified_count > 0
    AND (community_min <> verified_min OR community_max <> verified_max)) AS dense_groups_with_different_ranges
FROM groups;
