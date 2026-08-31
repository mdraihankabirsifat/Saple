-- SAPLE SUPABASE POSTGRESQL READ-ONLY DEMONSTRATION QUERIES
-- Run after the PostgreSQL schema and demonstration data scripts.

-- 1. Expected project shape: 14 base tables and 4 views.
SELECT
  COUNT(*) FILTER (WHERE table_type = 'BASE TABLE') AS base_table_count,
  COUNT(*) FILTER (WHERE table_type = 'VIEW') AS view_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users', 'employees', 'password_reset_tokens', 'companies', 'job_roles',
    'benefits', 'company_benefits', 'employment_verifications', 'submissions',
    'salary_submissions', 'company_reviews', 'interview_experiences',
    'reports', 'moderation_actions', 'vw_public_companies',
    'vw_public_approved_reviews', 'vw_verified_salary_summary',
    'vw_community_salary_summary'
  );

-- 2. Saple base tables.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  AND table_name IN (
    'users', 'employees', 'password_reset_tokens', 'companies', 'job_roles',
    'benefits', 'company_benefits', 'employment_verifications', 'submissions',
    'salary_submissions', 'company_reviews', 'interview_experiences',
    'reports', 'moderation_actions'
  )
ORDER BY table_name;

-- 3. Columns, types, defaults, and nullability.
SELECT table_name, ordinal_position, column_name, data_type,
  is_nullable, column_default, is_identity
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'users', 'employees', 'password_reset_tokens', 'companies', 'job_roles',
    'benefits', 'company_benefits', 'employment_verifications', 'submissions',
    'salary_submissions', 'company_reviews', 'interview_experiences',
    'reports', 'moderation_actions'
  )
ORDER BY table_name, ordinal_position;

-- 4. Primary and unique keys.
SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_schema = tc.constraint_schema
  AND kcu.constraint_name = tc.constraint_name
WHERE tc.constraint_schema = 'public'
  AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- 5. Foreign-key relationships.
SELECT tc.table_name, tc.constraint_name, kcu.column_name,
  ccu.table_name AS referenced_table, ccu.column_name AS referenced_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_schema = tc.constraint_schema
  AND kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_schema = tc.constraint_schema
  AND ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;

-- 6. Named check constraints.
SELECT tc.table_name, tc.constraint_name, cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON cc.constraint_schema = tc.constraint_schema
  AND cc.constraint_name = tc.constraint_name
WHERE tc.constraint_schema = 'public' AND tc.constraint_type = 'CHECK'
ORDER BY tc.table_name, tc.constraint_name;

-- 7. Supporting indexes.
SELECT tablename AS table_name, indexname AS index_name, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'ix_%'
ORDER BY tablename, indexname;

-- 8. Runtime migration checks.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name = 'token_version'
  ) AS token_version_present,
  COUNT(*) FILTER (WHERE is_identity = 'YES') AS identity_column_count
FROM information_schema.columns
WHERE table_schema = 'public';

-- 9. Row count for every Saple base table.
SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL SELECT 'employees', COUNT(*) FROM employees
UNION ALL SELECT 'password_reset_tokens', COUNT(*) FROM password_reset_tokens
UNION ALL SELECT 'companies', COUNT(*) FROM companies
UNION ALL SELECT 'job_roles', COUNT(*) FROM job_roles
UNION ALL SELECT 'benefits', COUNT(*) FROM benefits
UNION ALL SELECT 'company_benefits', COUNT(*) FROM company_benefits
UNION ALL SELECT 'employment_verifications', COUNT(*) FROM employment_verifications
UNION ALL SELECT 'submissions', COUNT(*) FROM submissions
UNION ALL SELECT 'salary_submissions', COUNT(*) FROM salary_submissions
UNION ALL SELECT 'company_reviews', COUNT(*) FROM company_reviews
UNION ALL SELECT 'interview_experiences', COUNT(*) FROM interview_experiences
UNION ALL SELECT 'reports', COUNT(*) FROM reports
UNION ALL SELECT 'moderation_actions', COUNT(*) FROM moderation_actions
ORDER BY table_name;

-- 10. Verified salary summary.
SELECT company_name, role_name, currency, pay_period,
  minimum_salary, maximum_salary, average_salary, contribution_count
FROM vw_verified_salary_summary
ORDER BY company_name, role_name
LIMIT 10;

-- 11. Community salary summary.
SELECT company_name, role_name, currency, pay_period,
  minimum_salary, maximum_salary, average_salary, contribution_count
FROM vw_community_salary_summary
ORDER BY company_name, role_name
LIMIT 10;

-- 12. Approved public reviews; no user identity or evidence is selected.
SELECT company_name, role_name, review_title, overall_rating,
  employment_status, review_date, verification_status
FROM vw_public_approved_reviews
ORDER BY submitted_at DESC, submission_id DESC
LIMIT 10;

-- 13. Approved public interviews; anonymous ownership stays internal.
SELECT c.company_name, jr.role_name, ie.interview_date,
  ie.difficulty_level, ie.rounds_count, ie.interview_mode,
  ie.result_status, ie.duration_days, s.verification_status
FROM submissions s
JOIN interview_experiences ie ON ie.submission_id = s.submission_id
JOIN companies c ON c.company_id = s.company_id
JOIN job_roles jr ON jr.role_id = ie.role_id
WHERE s.submission_type = 'INTERVIEW'
  AND s.submission_status = 'APPROVED'
ORDER BY s.approved_at DESC, s.submission_id DESC
LIMIT 10;

-- 14. Verification workflow without private proof or company-email values.
SELECT ev.verification_id, u.full_name AS employee_name,
  c.company_name, jr.role_name, ev.verification_method,
  ev.verification_status, ev.requested_at, ev.reviewed_at, ev.expires_at
FROM employment_verifications ev
JOIN employees e ON e.employee_id = ev.employee_id
JOIN users u ON u.user_id = e.user_id
JOIN companies c ON c.company_id = ev.company_id
LEFT JOIN job_roles jr ON jr.role_id = ev.role_id
ORDER BY ev.requested_at DESC, ev.verification_id DESC
LIMIT 10;

-- 15. Moderation audit without internal notes or moderator email.
SELECT ma.action_id, ma.submission_id, ma.action_type,
  ma.previous_status, ma.new_status, ma.action_at,
  u.full_name AS moderator_name
FROM moderation_actions ma
JOIN users u ON u.user_id = ma.moderator_user_id
ORDER BY ma.action_at DESC, ma.action_id DESC
LIMIT 10;

-- 16. Final schema and publication health.
SELECT
  (SELECT COUNT(*) FROM submissions WHERE submission_status = 'PENDING')
    AS pending_submission_count,
  (SELECT COUNT(*) FROM submissions WHERE submission_status = 'APPROVED')
    AS approved_submission_count,
  (SELECT COUNT(*) FROM vw_verified_salary_summary)
    AS verified_salary_group_count,
  (SELECT COUNT(*) FROM vw_community_salary_summary)
    AS community_salary_group_count,
  (SELECT COUNT(*) FROM vw_public_approved_reviews)
    AS approved_public_review_count;
