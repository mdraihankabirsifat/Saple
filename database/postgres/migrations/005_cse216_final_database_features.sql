-- ===========================================================================
-- Saple migration 005 - CSE216 final database features
--
-- Adds the three database objects the final checklist requires, each used by
-- the running application:
--
--   1. saple_set_updated_at()                  trigger function
--      + trg_<table>_set_updated_at            BEFORE UPDATE triggers
--   2. saple_company_insight_summary(BIGINT)   statistical function
--   3. saple_apply_application_decision(...)   multi-table procedure
--
-- Additive and non-destructive: no table is created, altered or dropped, and
-- no row is inserted, updated or deleted. Re-running the file is safe.
-- Requires migrations 001-004 (or the final 01_final_schema_postgres.sql).
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Trigger: the database owns updated_at
--
-- Every table below already has updated_at, and the application sets it in
-- each UPDATE. Keeping the rule in the database means the column stays true
-- even for a write issued outside Express: a psql session, the Supabase SQL
-- editor, a future job, or a repository that forgets the column. The trigger
-- is BEFORE UPDATE, so it changes the row being written rather than issuing a
-- second write, and it cannot recurse.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION saple_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION saple_set_updated_at() IS
    'Sets updated_at on the row being updated. Used by the trg_*_set_updated_at triggers.';

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;
CREATE TRIGGER trg_users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION saple_set_updated_at();

DROP TRIGGER IF EXISTS trg_companies_set_updated_at ON companies;
CREATE TRIGGER trg_companies_set_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION saple_set_updated_at();

DROP TRIGGER IF EXISTS trg_submissions_set_updated_at ON submissions;
CREATE TRIGGER trg_submissions_set_updated_at
    BEFORE UPDATE ON submissions
    FOR EACH ROW EXECUTE FUNCTION saple_set_updated_at();

DROP TRIGGER IF EXISTS trg_company_representatives_set_updated_at ON company_representatives;
CREATE TRIGGER trg_company_representatives_set_updated_at
    BEFORE UPDATE ON company_representatives
    FOR EACH ROW EXECUTE FUNCTION saple_set_updated_at();

DROP TRIGGER IF EXISTS trg_job_postings_set_updated_at ON job_postings;
CREATE TRIGGER trg_job_postings_set_updated_at
    BEFORE UPDATE ON job_postings
    FOR EACH ROW EXECUTE FUNCTION saple_set_updated_at();

DROP TRIGGER IF EXISTS trg_job_applications_set_updated_at ON job_applications;
CREATE TRIGGER trg_job_applications_set_updated_at
    BEFORE UPDATE ON job_applications
    FOR EACH ROW EXECUTE FUNCTION saple_set_updated_at();

DROP TRIGGER IF EXISTS trg_announcements_set_updated_at ON announcements;
CREATE TRIGGER trg_announcements_set_updated_at
    BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE FUNCTION saple_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Function: one company's public statistics
--
-- Returns the figures the company page reports, computed from approved
-- submissions only. Each aggregate is its own scalar subquery, so joining
-- several one-to-many tables cannot multiply the counts. STABLE: it reads the
-- database and returns the same answer inside one statement.
--
-- Evaluation:  SELECT * FROM saple_company_insight_summary(<company_id>);
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS saple_company_insight_summary(BIGINT);
CREATE FUNCTION saple_company_insight_summary(p_company_id BIGINT)
RETURNS TABLE (
    company_id            BIGINT,
    review_count          INTEGER,
    average_rating        NUMERIC(3, 2),
    approved_salary_count INTEGER,
    minimum_salary        NUMERIC(12, 2),
    maximum_salary        NUMERIC(12, 2),
    average_salary        NUMERIC(12, 2),
    interview_count       INTEGER,
    open_job_count        INTEGER
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        c.company_id,
        (SELECT COUNT(*)::INTEGER
           FROM submissions s
           JOIN company_reviews cr ON cr.submission_id = s.submission_id
          WHERE s.company_id = c.company_id
            AND s.submission_status = 'APPROVED')                       AS review_count,
        (SELECT ROUND(AVG(cr.overall_rating), 2)::NUMERIC(3, 2)
           FROM submissions s
           JOIN company_reviews cr ON cr.submission_id = s.submission_id
          WHERE s.company_id = c.company_id
            AND s.submission_status = 'APPROVED')                       AS average_rating,
        (SELECT COUNT(*)::INTEGER
           FROM submissions s
           JOIN salary_submissions ss ON ss.submission_id = s.submission_id
          WHERE s.company_id = c.company_id
            AND s.submission_status = 'APPROVED')                       AS approved_salary_count,
        (SELECT MIN(ss.base_salary)::NUMERIC(12, 2)
           FROM submissions s
           JOIN salary_submissions ss ON ss.submission_id = s.submission_id
          WHERE s.company_id = c.company_id
            AND s.submission_status = 'APPROVED')                       AS minimum_salary,
        (SELECT MAX(ss.base_salary)::NUMERIC(12, 2)
           FROM submissions s
           JOIN salary_submissions ss ON ss.submission_id = s.submission_id
          WHERE s.company_id = c.company_id
            AND s.submission_status = 'APPROVED')                       AS maximum_salary,
        (SELECT ROUND(AVG(ss.base_salary), 2)::NUMERIC(12, 2)
           FROM submissions s
           JOIN salary_submissions ss ON ss.submission_id = s.submission_id
          WHERE s.company_id = c.company_id
            AND s.submission_status = 'APPROVED')                       AS average_salary,
        (SELECT COUNT(*)::INTEGER
           FROM submissions s
           JOIN interview_experiences ie ON ie.submission_id = s.submission_id
          WHERE s.company_id = c.company_id
            AND s.submission_status = 'APPROVED')                       AS interview_count,
        (SELECT COUNT(*)::INTEGER
           FROM job_postings jp
          WHERE jp.company_id = c.company_id
            AND jp.job_status = 'PUBLISHED'
            AND jp.application_deadline >= CURRENT_DATE)                AS open_job_count
    FROM companies c
    WHERE c.company_id = p_company_id;
$$;

COMMENT ON FUNCTION saple_company_insight_summary(BIGINT) IS
    'Approved-only public statistics for one company: reviews, rating, salary spread, interviews and open jobs.';

-- ---------------------------------------------------------------------------
-- 3. Procedure: one application decision, two tables
--
-- A decision must change job_applications and record job_application_status_history
-- together, or not at all. The procedure locks the application row, checks the
-- transition against the list of statuses the caller's role is allowed to move
-- from, writes both tables, and returns what the caller needs for the
-- notification it sends in the same transaction.
--
-- It deliberately contains no COMMIT: the backend opens the transaction, calls
-- this procedure and inserts the applicant's notification, so all three writes
-- commit or roll back as one.
--
-- Errors use custom SQLSTATEs the repository maps to its existing API errors:
--   SA001 - application not found
--   SA002 - transition not allowed from the current status
--
-- Evaluation (disposable data only):
--   CALL saple_apply_application_decision(<application_id>, <actor_user_id>,
--        'UNDER_REVIEW', 'demo note', ARRAY['SUBMITTED']::VARCHAR[], TRUE,
--        NULL, NULL, NULL, NULL);
-- ---------------------------------------------------------------------------

DROP PROCEDURE IF EXISTS saple_apply_application_decision(
    BIGINT, BIGINT, VARCHAR, TEXT, VARCHAR[], BOOLEAN, VARCHAR, BIGINT, BIGINT, VARCHAR
);
CREATE PROCEDURE saple_apply_application_decision(
    IN    p_application_id       BIGINT,
    IN    p_actor_user_id        BIGINT,
    IN    p_new_status           VARCHAR,
    IN    p_note                 TEXT,
    IN    p_allowed_previous     VARCHAR[],
    IN    p_is_reviewer_decision BOOLEAN,
    INOUT io_previous_status     VARCHAR,
    INOUT io_history_id          BIGINT,
    INOUT io_applicant_user_id   BIGINT,
    INOUT io_job_title           VARCHAR
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_application RECORD;
BEGIN
    -- FOR UPDATE: two reviewers deciding at once queue here instead of
    -- overwriting one another's decision.
    SELECT ja.application_id,
           ja.applicant_user_id,
           ja.application_status,
           jp.title
      INTO v_application
      FROM job_applications ja
      JOIN job_postings jp ON jp.job_id = ja.job_id
     WHERE ja.application_id = p_application_id
     FOR UPDATE OF ja;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Application not found'
            USING ERRCODE = 'SA001';
    END IF;

    IF NOT (v_application.application_status = ANY (p_allowed_previous)) THEN
        RAISE EXCEPTION 'Application cannot make that transition'
            USING ERRCODE = 'SA002';
    END IF;

    UPDATE job_applications
       SET application_status = p_new_status,
           reviewed_by = CASE WHEN p_is_reviewer_decision THEN p_actor_user_id ELSE NULL END,
           reviewed_at = CASE WHEN p_is_reviewer_decision THEN CURRENT_TIMESTAMP ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
     WHERE application_id = p_application_id;

    INSERT INTO job_application_status_history (
        application_id, actor_user_id, previous_status, new_status, action_note
    ) VALUES (
        p_application_id, p_actor_user_id, v_application.application_status, p_new_status, p_note
    )
    RETURNING history_id INTO io_history_id;

    io_previous_status   := v_application.application_status;
    io_applicant_user_id := v_application.applicant_user_id;
    io_job_title         := v_application.title;
END;
$$;

COMMENT ON PROCEDURE saple_apply_application_decision(
    BIGINT, BIGINT, VARCHAR, TEXT, VARCHAR[], BOOLEAN, VARCHAR, BIGINT, BIGINT, VARCHAR
) IS
    'Applies one job-application decision: locks the row, validates the transition, updates job_applications and writes job_application_status_history.';

COMMIT;
