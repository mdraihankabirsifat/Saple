-- READ-ONLY TEACHER DEMONSTRATION.
-- Safe to execute on the existing populated SAPLE schema.

PROMPT ================================================================
PROMPT 1. Project schema summary: 14 base tables and 4 views
PROMPT ================================================================

SELECT 'BASE TABLES' AS object_group,
       14 AS expected_count,
       COUNT(*) AS actual_count
FROM user_tables
WHERE table_name IN (
    'USERS', 'EMPLOYEES', 'PASSWORD_RESET_TOKENS', 'COMPANIES',
    'JOB_ROLES', 'BENEFITS', 'COMPANY_BENEFITS',
    'EMPLOYMENT_VERIFICATIONS', 'SUBMISSIONS', 'SALARY_SUBMISSIONS',
    'COMPANY_REVIEWS', 'INTERVIEW_EXPERIENCES', 'REPORTS',
    'MODERATION_ACTIONS'
)
UNION ALL
SELECT 'VIEWS',
       4,
       COUNT(*)
FROM user_views
WHERE view_name IN (
    'VW_PUBLIC_COMPANIES',
    'VW_PUBLIC_APPROVED_REVIEWS',
    'VW_VERIFIED_SALARY_SUMMARY',
    'VW_COMMUNITY_SALARY_SUMMARY'
);

PROMPT ================================================================
PROMPT 2. All Saple base-table names
PROMPT ================================================================

SELECT table_name
FROM user_tables
WHERE table_name IN (
    'USERS',
    'EMPLOYEES',
    'PASSWORD_RESET_TOKENS',
    'COMPANIES',
    'JOB_ROLES',
    'BENEFITS',
    'COMPANY_BENEFITS',
    'EMPLOYMENT_VERIFICATIONS',
    'SUBMISSIONS',
    'SALARY_SUBMISSIONS',
    'COMPANY_REVIEWS',
    'INTERVIEW_EXPERIENCES',
    'REPORTS',
    'MODERATION_ACTIONS'
)
ORDER BY table_name;

PROMPT ================================================================
PROMPT 3. Important columns, data types and nullability
PROMPT ================================================================

SELECT table_name,
       column_id,
       column_name,
       data_type,
       data_length,
       data_precision,
       data_scale,
       nullable,
       identity_column
FROM user_tab_columns
WHERE table_name IN (
    'USERS', 'EMPLOYEES', 'PASSWORD_RESET_TOKENS', 'COMPANIES',
    'JOB_ROLES', 'BENEFITS', 'COMPANY_BENEFITS',
    'EMPLOYMENT_VERIFICATIONS', 'SUBMISSIONS', 'SALARY_SUBMISSIONS',
    'COMPANY_REVIEWS', 'INTERVIEW_EXPERIENCES', 'REPORTS',
    'MODERATION_ACTIONS'
)
ORDER BY table_name, column_id;

PROMPT ================================================================
PROMPT 4. Primary keys and unique keys
PROMPT ================================================================

SELECT c.table_name,
       c.constraint_name,
       CASE c.constraint_type
           WHEN 'P' THEN 'PRIMARY KEY'
           WHEN 'U' THEN 'UNIQUE KEY'
       END AS key_type,
       LISTAGG(cc.column_name, ', ')
           WITHIN GROUP (ORDER BY cc.position) AS key_columns,
       c.status
FROM user_constraints c
JOIN user_cons_columns cc
  ON cc.constraint_name = c.constraint_name
WHERE c.constraint_type IN ('P', 'U')
  AND c.table_name IN (
      'USERS', 'EMPLOYEES', 'PASSWORD_RESET_TOKENS', 'COMPANIES',
      'JOB_ROLES', 'BENEFITS', 'COMPANY_BENEFITS',
      'EMPLOYMENT_VERIFICATIONS', 'SUBMISSIONS', 'SALARY_SUBMISSIONS',
      'COMPANY_REVIEWS', 'INTERVIEW_EXPERIENCES', 'REPORTS',
      'MODERATION_ACTIONS'
  )
GROUP BY c.table_name, c.constraint_name, c.constraint_type, c.status
ORDER BY c.table_name, key_type, c.constraint_name;

PROMPT ================================================================
PROMPT 5. Foreign-key relationships
PROMPT ================================================================

SELECT child.table_name AS child_table,
       child_col.column_name AS child_column,
       child.constraint_name,
       parent.table_name AS parent_table,
       parent_col.column_name AS parent_column,
       child.delete_rule,
       child.status
FROM user_constraints child
JOIN user_cons_columns child_col
  ON child_col.constraint_name = child.constraint_name
JOIN user_constraints parent
  ON parent.constraint_name = child.r_constraint_name
JOIN user_cons_columns parent_col
  ON parent_col.constraint_name = parent.constraint_name
 AND parent_col.position = child_col.position
WHERE child.constraint_type = 'R'
  AND child.table_name IN (
      'USERS', 'EMPLOYEES', 'PASSWORD_RESET_TOKENS', 'COMPANIES',
      'JOB_ROLES', 'BENEFITS', 'COMPANY_BENEFITS',
      'EMPLOYMENT_VERIFICATIONS', 'SUBMISSIONS', 'SALARY_SUBMISSIONS',
      'COMPANY_REVIEWS', 'INTERVIEW_EXPERIENCES', 'REPORTS',
      'MODERATION_ACTIONS'
  )
ORDER BY child.table_name, child.constraint_name, child_col.position;

PROMPT ================================================================
PROMPT 6. Important named check constraints
PROMPT ================================================================

SELECT table_name,
       constraint_name,
       search_condition,
       status
FROM user_constraints
WHERE constraint_type = 'C'
  AND constraint_name LIKE 'CK\_%' ESCAPE '\'
  AND table_name IN (
      'USERS', 'EMPLOYEES', 'PASSWORD_RESET_TOKENS', 'COMPANIES',
      'JOB_ROLES', 'BENEFITS', 'COMPANY_BENEFITS',
      'EMPLOYMENT_VERIFICATIONS', 'SUBMISSIONS', 'SALARY_SUBMISSIONS',
      'COMPANY_REVIEWS', 'INTERVIEW_EXPERIENCES', 'REPORTS',
      'MODERATION_ACTIONS'
  )
ORDER BY table_name, constraint_name;

PROMPT ================================================================
PROMPT 7. Indexes and their columns
PROMPT ================================================================

SELECT i.table_name,
       i.index_name,
       i.uniqueness,
       LISTAGG(ic.column_name, ', ')
           WITHIN GROUP (ORDER BY ic.column_position) AS index_columns,
       i.status
FROM user_indexes i
JOIN user_ind_columns ic
  ON ic.index_name = i.index_name
WHERE i.table_name IN (
    'USERS', 'EMPLOYEES', 'PASSWORD_RESET_TOKENS', 'COMPANIES',
    'JOB_ROLES', 'BENEFITS', 'COMPANY_BENEFITS',
    'EMPLOYMENT_VERIFICATIONS', 'SUBMISSIONS', 'SALARY_SUBMISSIONS',
    'COMPANY_REVIEWS', 'INTERVIEW_EXPERIENCES', 'REPORTS',
    'MODERATION_ACTIONS'
)
GROUP BY i.table_name, i.index_name, i.uniqueness, i.status
ORDER BY i.table_name, i.index_name;

PROMPT ================================================================
PROMPT 8. Migration verification
PROMPT ================================================================

SELECT 'TABLE' AS object_type,
       'PASSWORD_RESET_TOKENS' AS object_name,
       CASE WHEN COUNT(*) = 1 THEN 'PRESENT' ELSE 'MISSING' END AS result
FROM user_tables
WHERE table_name = 'PASSWORD_RESET_TOKENS'
UNION ALL
SELECT 'COLUMN',
       'EMPLOYMENT_VERIFICATIONS.ROLE_ID',
       CASE WHEN COUNT(*) = 1 THEN 'PRESENT' ELSE 'MISSING' END
FROM user_tab_columns
WHERE table_name = 'EMPLOYMENT_VERIFICATIONS'
  AND column_name = 'ROLE_ID'
UNION ALL
SELECT 'FOREIGN KEY',
       'FK_EMP_VERIFY_ROLE',
       CASE WHEN COUNT(*) = 1 THEN 'PRESENT' ELSE 'MISSING' END
FROM user_constraints
WHERE table_name = 'EMPLOYMENT_VERIFICATIONS'
  AND constraint_name = 'FK_EMP_VERIFY_ROLE'
  AND constraint_type = 'R'
UNION ALL
SELECT 'INDEX',
       'IX_EMP_VERIFY_SCOPE_STATUS',
       CASE WHEN COUNT(*) = 1 THEN 'PRESENT' ELSE 'MISSING' END
FROM user_indexes
WHERE table_name = 'EMPLOYMENT_VERIFICATIONS'
  AND index_name = 'IX_EMP_VERIFY_SCOPE_STATUS';

PROMPT ================================================================
PROMPT 9. Row count of every Saple base table
PROMPT ================================================================

SELECT 'USERS' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL SELECT 'EMPLOYEES', COUNT(*) FROM employees
UNION ALL SELECT 'PASSWORD_RESET_TOKENS', COUNT(*) FROM password_reset_tokens
UNION ALL SELECT 'COMPANIES', COUNT(*) FROM companies
UNION ALL SELECT 'JOB_ROLES', COUNT(*) FROM job_roles
UNION ALL SELECT 'BENEFITS', COUNT(*) FROM benefits
UNION ALL SELECT 'COMPANY_BENEFITS', COUNT(*) FROM company_benefits
UNION ALL SELECT 'EMPLOYMENT_VERIFICATIONS', COUNT(*) FROM employment_verifications
UNION ALL SELECT 'SUBMISSIONS', COUNT(*) FROM submissions
UNION ALL SELECT 'SALARY_SUBMISSIONS', COUNT(*) FROM salary_submissions
UNION ALL SELECT 'COMPANY_REVIEWS', COUNT(*) FROM company_reviews
UNION ALL SELECT 'INTERVIEW_EXPERIENCES', COUNT(*) FROM interview_experiences
UNION ALL SELECT 'REPORTS', COUNT(*) FROM reports
UNION ALL SELECT 'MODERATION_ACTIONS', COUNT(*) FROM moderation_actions
ORDER BY table_name;

PROMPT ================================================================
PROMPT 10. Up to 10 verified salary-summary rows
PROMPT ================================================================

SELECT company_id,
       company_name,
       role_id,
       role_name,
       currency,
       pay_period,
       minimum_salary,
       maximum_salary,
       average_salary,
       contribution_count
FROM vw_verified_salary_summary
ORDER BY company_name, role_name, currency, pay_period
FETCH FIRST 10 ROWS ONLY;

PROMPT ================================================================
PROMPT 11. Up to 10 community salary-summary rows
PROMPT ================================================================

SELECT company_id,
       company_name,
       role_id,
       role_name,
       currency,
       pay_period,
       minimum_salary,
       maximum_salary,
       average_salary,
       contribution_count
FROM vw_community_salary_summary
ORDER BY company_name, role_name, currency, pay_period
FETCH FIRST 10 ROWS ONLY;

PROMPT ================================================================
PROMPT 12. Up to 10 approved company reviews
PROMPT ================================================================

SELECT submission_id,
       company_id,
       company_name,
       role_id,
       role_name,
       review_title,
       overall_rating,
       work_life_balance_rating,
       career_growth_rating,
       management_rating,
       culture_rating,
       pros,
       cons,
       advice_to_management,
       employment_status,
       review_date,
       verification_status,
       submitted_at
FROM vw_public_approved_reviews
ORDER BY submitted_at DESC, submission_id DESC
FETCH FIRST 10 ROWS ONLY;

PROMPT ================================================================
PROMPT 13. Up to 10 approved interview experiences
PROMPT ================================================================

SELECT s.submission_id,
       c.company_name,
       jr.role_name,
       ie.interview_date,
       ie.difficulty_level,
       ie.rounds_count,
       ie.interview_mode,
       ie.result_status,
       ie.duration_days,
       ie.process_description,
       ie.questions_summary,
       s.verification_status,
       s.submitted_at
FROM submissions s
JOIN interview_experiences ie
  ON ie.submission_id = s.submission_id
JOIN companies c
  ON c.company_id = s.company_id
JOIN job_roles jr
  ON jr.role_id = ie.role_id
WHERE s.submission_type = 'INTERVIEW'
  AND s.submission_status = 'APPROVED'
ORDER BY s.submitted_at DESC, s.submission_id DESC
FETCH FIRST 10 ROWS ONLY;

PROMPT ================================================================
PROMPT 14. Up to 10 employment-verification records without private evidence
PROMPT ================================================================

SELECT ev.verification_id,
       c.company_name,
       jr.role_name,
       ev.verification_method,
       ev.verification_status,
       ev.requested_at,
       ev.reviewed_at,
       ev.expires_at
FROM employment_verifications ev
JOIN companies c
  ON c.company_id = ev.company_id
LEFT JOIN job_roles jr
  ON jr.role_id = ev.role_id
ORDER BY ev.requested_at DESC, ev.verification_id DESC
FETCH FIRST 10 ROWS ONLY;

PROMPT ================================================================
PROMPT 15. Up to 10 moderation-action records without internal notes
PROMPT ================================================================

SELECT action_id,
       submission_id,
       action_type,
       previous_status,
       new_status,
       action_at
FROM moderation_actions
ORDER BY action_at DESC, action_id DESC
FETCH FIRST 10 ROWS ONLY;

PROMPT ================================================================
PROMPT 16. Final schema health summary
PROMPT ================================================================

SELECT 'BASE TABLE COUNT' AS health_check,
       14 AS expected_count,
       COUNT(*) AS actual_count,
       CASE WHEN COUNT(*) = 14 THEN 'PASS' ELSE 'CHECK' END AS result
FROM user_tables
WHERE table_name IN (
    'USERS', 'EMPLOYEES', 'PASSWORD_RESET_TOKENS', 'COMPANIES',
    'JOB_ROLES', 'BENEFITS', 'COMPANY_BENEFITS',
    'EMPLOYMENT_VERIFICATIONS', 'SUBMISSIONS', 'SALARY_SUBMISSIONS',
    'COMPANY_REVIEWS', 'INTERVIEW_EXPERIENCES', 'REPORTS',
    'MODERATION_ACTIONS'
)
UNION ALL
SELECT 'VIEW COUNT',
       4,
       COUNT(*),
       CASE WHEN COUNT(*) = 4 THEN 'PASS' ELSE 'CHECK' END
FROM user_views
WHERE view_name IN (
    'VW_PUBLIC_COMPANIES',
    'VW_PUBLIC_APPROVED_REVIEWS',
    'VW_VERIFIED_SALARY_SUMMARY',
    'VW_COMMUNITY_SALARY_SUMMARY'
)
UNION ALL
SELECT 'INVALID REQUIRED OBJECTS',
       0,
       COUNT(*),
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'CHECK' END
FROM user_objects
WHERE object_name IN (
    'USERS', 'EMPLOYEES', 'PASSWORD_RESET_TOKENS', 'COMPANIES',
    'JOB_ROLES', 'BENEFITS', 'COMPANY_BENEFITS',
    'EMPLOYMENT_VERIFICATIONS', 'SUBMISSIONS', 'SALARY_SUBMISSIONS',
    'COMPANY_REVIEWS', 'INTERVIEW_EXPERIENCES', 'REPORTS',
    'MODERATION_ACTIONS', 'VW_PUBLIC_COMPANIES',
    'VW_PUBLIC_APPROVED_REVIEWS', 'VW_VERIFIED_SALARY_SUMMARY',
    'VW_COMMUNITY_SALARY_SUMMARY'
)
  AND status = 'INVALID';
