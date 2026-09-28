-- ===========================================================================
-- SAPLE: REMOVE THE OPTIONAL BULK DEMONSTRATION DATA
-- ===========================================================================
--
-- Undoes 04_bulk_demo_data_postgres.sql, and nothing else.
--
-- How it finds that data
--   Every account 04 created has the same unusable placeholder password hash,
--   a value registration can never produce. Everything removed here belongs
--   to one of those accounts: their submissions, verifications, representative
--   assignments, the jobs they published, applications to those jobs, their
--   profiles and their account rows.
--
-- What it never removes
--   Real accounts or anything a real account created. If a real person has
--   interacted with the synthetic data (applied to a synthetic job, reported
--   a synthetic review, messaged a synthetic user, or an administrator
--   moderated a synthetic submission), the script stops with an explanation
--   and deletes nothing, because removing the synthetic rows would take that
--   real activity with them.
--
-- What it leaves in place
--   Reference data: the companies, job roles, benefits, company benefits and
--   skills that 04 added. They are ordinary public facts, and real records may
--   already point at them, so removing them automatically is not safe.
--
-- One transaction: everything is removed, or nothing is.
-- ===========================================================================

BEGIN;

DO $$
DECLARE
  marker CONSTANT TEXT := '$2b$10$SAPLE.BULK.DEMO.ACCOUNT.NO.LOGIN';
  blockers TEXT := '';
  found BIGINT;
BEGIN
  CREATE TEMP TABLE bulk_user ON COMMIT DROP AS
  SELECT user_id FROM users WHERE password_hash = marker;

  IF NOT EXISTS (SELECT 1 FROM bulk_user) THEN
    RAISE NOTICE 'No bulk demonstration accounts were found. Nothing to remove.';
    RETURN;
  END IF;

  CREATE TEMP TABLE bulk_job ON COMMIT DROP AS
  SELECT job_id FROM job_postings WHERE created_by_user_id IN (SELECT user_id FROM bulk_user);

  CREATE TEMP TABLE bulk_submission ON COMMIT DROP AS
  SELECT submission_id FROM submissions WHERE user_id IN (SELECT user_id FROM bulk_user);

  CREATE TEMP TABLE bulk_assignment ON COMMIT DROP AS
  SELECT assignment_id FROM company_representatives WHERE user_id IN (SELECT user_id FROM bulk_user);

  -- ---- Anything real that is tied to the synthetic data stops the script ----

  SELECT COUNT(*) INTO found FROM job_applications
  WHERE job_id IN (SELECT job_id FROM bulk_job)
    AND applicant_user_id NOT IN (SELECT user_id FROM bulk_user);
  IF found > 0 THEN blockers := blockers || format(' %s real application(s) to synthetic jobs;', found); END IF;

  SELECT COUNT(*) INTO found FROM job_applications
  WHERE applicant_user_id IN (SELECT user_id FROM bulk_user)
    AND job_id NOT IN (SELECT job_id FROM bulk_job);
  IF found > 0 THEN blockers := blockers || format(' %s synthetic application(s) to real jobs;', found); END IF;

  SELECT COUNT(*) INTO found FROM job_application_status_history h
  JOIN job_applications a ON a.application_id = h.application_id
  WHERE a.job_id IN (SELECT job_id FROM bulk_job)
    AND h.actor_user_id NOT IN (SELECT user_id FROM bulk_user);
  IF found > 0 THEN blockers := blockers || format(' %s application decision(s) by real accounts;', found); END IF;

  SELECT COUNT(*) INTO found FROM reports
  WHERE submission_id IN (SELECT submission_id FROM bulk_submission)
     OR reporter_user_id IN (SELECT user_id FROM bulk_user)
     OR resolved_by IN (SELECT user_id FROM bulk_user);
  IF found > 0 THEN blockers := blockers || format(' %s report(s) involving synthetic data;', found); END IF;

  SELECT COUNT(*) INTO found FROM moderation_actions
  WHERE submission_id IN (SELECT submission_id FROM bulk_submission)
     OR moderator_user_id IN (SELECT user_id FROM bulk_user);
  IF found > 0 THEN blockers := blockers || format(' %s moderation action(s) on synthetic submissions;', found); END IF;

  SELECT COUNT(*) INTO found FROM direct_messages
  WHERE (sender_user_id IN (SELECT user_id FROM bulk_user) AND recipient_user_id NOT IN (SELECT user_id FROM bulk_user))
     OR (recipient_user_id IN (SELECT user_id FROM bulk_user) AND sender_user_id NOT IN (SELECT user_id FROM bulk_user));
  IF found > 0 THEN blockers := blockers || format(' %s message(s) between synthetic and real accounts;', found); END IF;

  -- Representative history written by 04 carries its own note; any other
  -- entry is a real decision about a synthetic assignment.
  SELECT COUNT(*) INTO found FROM representative_assignment_actions
  WHERE assignment_id IN (SELECT assignment_id FROM bulk_assignment)
    AND action_note IS DISTINCT FROM 'Synthetic academic demo data (bulk script).';
  IF found > 0 THEN blockers := blockers || format(' %s real decision(s) on synthetic representative assignments;', found); END IF;

  -- Real rows that name a synthetic account as the person who acted.
  SELECT COUNT(*) INTO found FROM employment_verifications v
  JOIN employees e ON e.employee_id = v.employee_id
  WHERE v.reviewed_by IN (SELECT user_id FROM bulk_user)
    AND e.user_id NOT IN (SELECT user_id FROM bulk_user);
  IF found > 0 THEN blockers := blockers || format(' %s real verification(s) decided by a synthetic account;', found); END IF;

  SELECT COUNT(*) INTO found FROM company_representatives
  WHERE (approved_by IN (SELECT user_id FROM bulk_user) OR revoked_by IN (SELECT user_id FROM bulk_user))
    AND user_id NOT IN (SELECT user_id FROM bulk_user);
  IF found > 0 THEN blockers := blockers || format(' %s real assignment(s) approved or revoked by a synthetic account;', found); END IF;

  SELECT COUNT(*) INTO found FROM job_applications
  WHERE reviewed_by IN (SELECT user_id FROM bulk_user)
    AND job_id NOT IN (SELECT job_id FROM bulk_job);
  IF found > 0 THEN blockers := blockers || format(' %s real application(s) reviewed by a synthetic account;', found); END IF;

  SELECT COUNT(*) INTO found FROM announcements WHERE created_by IN (SELECT user_id FROM bulk_user);
  IF found > 0 THEN blockers := blockers || format(' %s announcement(s) by synthetic accounts;', found); END IF;

  IF blockers <> '' THEN
    RAISE EXCEPTION 'Nothing was removed. Real activity is tied to the bulk demo data:%', blockers
      USING HINT = 'Review these rows first. Removing the synthetic data would also remove them.';
  END IF;

  -- ---- Remove, children before parents ----

  DELETE FROM job_application_status_history
  WHERE application_id IN (SELECT application_id FROM job_applications WHERE job_id IN (SELECT job_id FROM bulk_job));
  DELETE FROM job_applications WHERE job_id IN (SELECT job_id FROM bulk_job);
  DELETE FROM job_postings WHERE job_id IN (SELECT job_id FROM bulk_job);

  DELETE FROM representative_assignment_actions WHERE assignment_id IN (SELECT assignment_id FROM bulk_assignment);
  DELETE FROM company_representatives WHERE assignment_id IN (SELECT assignment_id FROM bulk_assignment);

  -- Salary, review and interview details go with their submission (cascade).
  DELETE FROM submissions WHERE submission_id IN (SELECT submission_id FROM bulk_submission);

  -- Verifications first: synthetic representatives are recorded as their
  -- reviewers, so they must go before those accounts.
  DELETE FROM employment_verifications
  WHERE employee_id IN (SELECT employee_id FROM employees WHERE user_id IN (SELECT user_id FROM bulk_user));

  -- Employees, notifications, profiles and skill links go with the account
  -- (cascade). The shared skill catalogue stays.
  DELETE FROM users WHERE user_id IN (SELECT user_id FROM bulk_user);

  RAISE NOTICE 'Bulk demonstration data removed.';
END $$;

COMMIT;
