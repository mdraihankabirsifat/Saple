-- SAPLE SUPABASE POSTGRESQL READ-ONLY DEMONSTRATION QUERIES
-- Run after the PostgreSQL schema and demonstration data scripts.

-- 1. Expected project shape: 21 base tables and 5 views.
SELECT
  COUNT(*) FILTER (WHERE table_type = 'BASE TABLE') AS base_table_count,
  COUNT(*) FILTER (WHERE table_type = 'VIEW') AS view_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users', 'employees', 'password_reset_tokens', 'companies', 'job_roles',
    'benefits', 'company_benefits', 'employment_verifications', 'submissions',
    'salary_submissions', 'company_reviews', 'interview_experiences',
    'reports', 'moderation_actions', 'company_representatives',
    'representative_assignment_actions', 'job_postings', 'job_applications',
    'job_application_status_history', 'announcements', 'notifications',
    'vw_public_companies', 'vw_public_approved_reviews',
    'vw_verified_salary_summary', 'vw_community_salary_summary',
    'vw_public_open_jobs'
  );

-- 2. Saple base tables.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  AND table_name IN (
    'users', 'employees', 'password_reset_tokens', 'companies', 'job_roles',
    'benefits', 'company_benefits', 'employment_verifications', 'submissions',
    'salary_submissions', 'company_reviews', 'interview_experiences',
    'reports', 'moderation_actions', 'company_representatives',
    'representative_assignment_actions', 'job_postings', 'job_applications',
    'job_application_status_history', 'announcements', 'notifications'
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
    'reports', 'moderation_actions', 'company_representatives',
    'representative_assignment_actions', 'job_postings', 'job_applications',
    'job_application_status_history', 'announcements', 'notifications'
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

-- ================================================================
-- 17. FINAL SCHEMA ADDITIONS: REPRESENTATIVES, JOBS, NOTIFICATIONS
-- ================================================================

-- 17. CHECK constraints that protect the new workflow states.
SELECT rel.relname AS table_name, con.conname AS constraint_name,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = 'public'
  AND con.contype = 'c'
  AND rel.relname IN (
    'company_representatives', 'representative_assignment_actions',
    'job_postings', 'job_applications', 'job_application_status_history',
    'announcements', 'notifications'
  )
ORDER BY rel.relname, con.conname;

-- 18. Indexes supporting the new scoped queues, including partial indexes.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'company_representatives', 'representative_assignment_actions',
    'job_postings', 'job_applications', 'job_application_status_history',
    'announcements', 'notifications'
  )
ORDER BY tablename, indexname;

-- 19. Representative scopes. One open scope per account and company.
SELECT cr.assignment_id, cr.assignment_status, c.company_name,
  u.full_name AS representative_name, cr.approved_at, cr.revoked_at
FROM company_representatives cr
JOIN companies c ON c.company_id = cr.company_id
JOIN users u ON u.user_id = cr.user_id
ORDER BY cr.assignment_status, cr.assignment_id;

-- 20. Public job visibility. Only PUBLISHED, non-expired rows may appear.
SELECT
  (SELECT COUNT(*) FROM job_postings) AS total_job_count,
  (SELECT COUNT(*) FROM job_postings WHERE job_status = 'DRAFT') AS draft_job_count,
  (SELECT COUNT(*) FROM job_postings WHERE job_status = 'PUBLISHED') AS published_job_count,
  (SELECT COUNT(*) FROM job_postings WHERE job_status IN ('CLOSED', 'ARCHIVED')) AS closed_job_count,
  (SELECT COUNT(*) FROM vw_public_open_jobs) AS public_open_job_count;

-- 21. Applications survive closure, stay unique per applicant, and keep history.
SELECT ja.application_id, ja.application_status, jp.title, jp.job_status,
  (SELECT COUNT(*) FROM job_application_status_history h
     WHERE h.application_id = ja.application_id) AS history_row_count
FROM job_applications ja
JOIN job_postings jp ON jp.job_id = ja.job_id
ORDER BY ja.application_id;

-- 22. Duplicate applications are impossible: this must always return no rows.
SELECT job_id, applicant_user_id, COUNT(*) AS duplicate_count
FROM job_applications
GROUP BY job_id, applicant_user_id
HAVING COUNT(*) > 1;

-- 23. Announcement scheduling. Only the currently active window is public.
SELECT announcement_id, severity, is_active, starts_at, ends_at,
  (is_active
    AND starts_at <= CURRENT_TIMESTAMP
    AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)) AS is_public_now
FROM announcements
ORDER BY announcement_id;

-- 24. Notification ownership and unread counts, without message content.
SELECT n.user_id, u.full_name AS owner_name,
  COUNT(*) AS notification_count,
  COUNT(*) FILTER (WHERE n.read_at IS NULL) AS unread_count
FROM notifications n
JOIN users u ON u.user_id = n.user_id
GROUP BY n.user_id, u.full_name
ORDER BY n.user_id;

-- 25. Multiple administrators and representatives are both supported.
SELECT account_role, COUNT(*) AS account_count
FROM users
GROUP BY account_role
ORDER BY account_role;

-- 26. Every ACTIVE representative scope belongs to an active account holding
--     the representative role. This must always return no rows.
SELECT cr.assignment_id, cr.user_id, u.account_role, u.account_status
FROM company_representatives cr
JOIN users u ON u.user_id = cr.user_id
WHERE cr.assignment_status = 'ACTIVE'
  AND (u.account_role <> 'COMPANY_REPRESENTATIVE' OR u.account_status <> 'ACTIVE');

-- 27. CSE216 database objects: one trigger function, seven row-level
--     timestamp triggers, one statistical function and one workflow procedure.
SELECT p.proname AS object_name,
  CASE p.prokind WHEN 'f' THEN 'function' WHEN 'p' THEN 'procedure' ELSE p.prokind::TEXT END AS object_kind
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'saple@_%' ESCAPE '@'
ORDER BY p.proname;

SELECT c.relname AS table_name, t.tgname AS trigger_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname = 'public'
ORDER BY c.relname, t.tgname;

-- 28. The statistical function on the lowest company id present.
SELECT * FROM saple_company_insight_summary((SELECT MIN(company_id) FROM companies));
