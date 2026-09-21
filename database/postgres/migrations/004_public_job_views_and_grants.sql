-- SAPLE MIGRATION 004 - PUBLIC JOB VIEW AND SUPABASE GRANT REFRESH
-- Additive and non-destructive. Run after 003.
--
-- The four original public views are preserved unchanged. This migration adds
-- one public view that exposes only PUBLISHED, non-expired job postings, and
-- re-applies the "Express is the only database client" revocation so the new
-- tables are not reachable through Supabase browser roles.

BEGIN;

-- Published, still-open jobs only. Draft, closed and archived rows never appear,
-- and no applicant, application or private representative data is exposed.
CREATE OR REPLACE VIEW vw_public_open_jobs AS
SELECT jp.job_id,
       jp.company_id,
       c.company_name,
       c.industry,
       jp.role_id,
       jr.role_name,
       jr.role_category,
       jp.title,
       jp.description,
       jp.requirements,
       jp.location,
       jp.employment_type,
       jp.work_mode,
       jp.salary_min,
       jp.salary_max,
       jp.salary_currency,
       jp.salary_period,
       jp.application_deadline,
       jp.published_at
FROM job_postings jp
JOIN companies c ON c.company_id = jp.company_id
LEFT JOIN job_roles jr ON jr.role_id = jp.role_id
WHERE jp.job_status = 'PUBLISHED'
  AND jp.application_deadline >= CURRENT_DATE;

-- Express is the only application database client. Supabase browser roles
-- receive no direct table/view access when those roles exist.
DO $saple_security$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            REVOKE ALL ON TABLES FROM anon;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            REVOKE ALL ON SEQUENCES FROM anon;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            REVOKE ALL ON TABLES FROM authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            REVOKE ALL ON SEQUENCES FROM authenticated;
    END IF;
END
$saple_security$;

COMMIT;
