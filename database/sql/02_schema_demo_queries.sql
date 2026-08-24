PROMPT ================================================================
PROMPT 1. The 14 Saple base tables
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
PROMPT 2. Columns, data types and nullability
PROMPT ================================================================

SELECT table_name,
       column_id,
       column_name,
       data_type,
       data_length,
       data_precision,
       data_scale,
       nullable,
       data_default
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
PROMPT 3. Primary keys and unique keys
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
PROMPT 4. Foreign-key relationships
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
PROMPT 5. Important named check constraints
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
PROMPT 6. Indexes and their columns
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
PROMPT 7. The 4 Saple views
PROMPT ================================================================

SELECT view_name,
       text_length,
       read_only
FROM user_views
WHERE view_name IN (
    'VW_PUBLIC_COMPANIES',
    'VW_PUBLIC_APPROVED_REVIEWS',
    'VW_VERIFIED_SALARY_SUMMARY',
    'VW_COMMUNITY_SALARY_SUMMARY'
)
ORDER BY view_name;

PROMPT ================================================================
PROMPT 8. Password-reset table presence
PROMPT ================================================================

SELECT 'PASSWORD_RESET_TOKENS' AS object_name,
       CASE WHEN COUNT(*) = 1 THEN 'PRESENT' ELSE 'MISSING' END AS result
FROM user_tables
WHERE table_name = 'PASSWORD_RESET_TOKENS';

PROMPT ================================================================
PROMPT 9. Role-scoped verification column presence and nullability
PROMPT ================================================================

SELECT table_name,
       column_name,
       data_type,
       nullable
FROM user_tab_columns
WHERE table_name = 'EMPLOYMENT_VERIFICATIONS'
  AND column_name = 'ROLE_ID';

PROMPT ================================================================
PROMPT 10. Role foreign key and supporting scope index
PROMPT ================================================================

SELECT 'FOREIGN KEY' AS object_type,
       'FK_EMP_VERIFY_ROLE' AS object_name,
       CASE WHEN COUNT(*) = 1 THEN 'PRESENT' ELSE 'MISSING' END AS result
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
PROMPT 11. Optional row counts for all 14 base tables
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
PROMPT 12A. Up to 10 verified salary-summary rows
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
PROMPT 12B. Up to 10 community salary-summary rows
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
