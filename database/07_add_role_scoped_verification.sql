-- Saple additive migration 07: role-scoped employment verification
--
-- Run once on an existing populated schema after migration 06.
-- ROLE_ID remains nullable only so legacy rows whose role cannot be inferred
-- safely are preserved. Application authorization never accepts a NULL role.

ALTER TABLE employment_verifications ADD (
    role_id NUMBER
);

-- A legacy verification is backfilled only when every contribution made by
-- that employee for that company points to one and only one distinct role.
-- Rows with no evidence or conflicting roles remain NULL for re-verification.
MERGE INTO employment_verifications target
USING (
    SELECT employee_id, company_id, MIN(role_id) AS role_id
    FROM (
        SELECT e.employee_id, s.company_id, ss.role_id
        FROM employees e
        JOIN submissions s ON s.user_id = e.user_id
        JOIN salary_submissions ss ON ss.submission_id = s.submission_id

        UNION ALL

        SELECT e.employee_id, s.company_id, cr.role_id
        FROM employees e
        JOIN submissions s ON s.user_id = e.user_id
        JOIN company_reviews cr ON cr.submission_id = s.submission_id
        WHERE cr.role_id IS NOT NULL

        UNION ALL

        SELECT e.employee_id, s.company_id, ie.role_id
        FROM employees e
        JOIN submissions s ON s.user_id = e.user_id
        JOIN interview_experiences ie ON ie.submission_id = s.submission_id
    ) contribution_roles
    GROUP BY employee_id, company_id
    HAVING COUNT(DISTINCT role_id) = 1
) inferred
ON (
    target.employee_id = inferred.employee_id
    AND target.company_id = inferred.company_id
)
WHEN MATCHED THEN UPDATE SET
    target.role_id = inferred.role_id
    WHERE target.role_id IS NULL;

ALTER TABLE employment_verifications ADD CONSTRAINT fk_emp_verify_role
    FOREIGN KEY (role_id) REFERENCES job_roles (role_id);

CREATE INDEX ix_emp_verify_scope_status
    ON employment_verifications (
        employee_id,
        company_id,
        role_id,
        verification_status
    );

COMMIT;

-- ================================================================
-- Verification queries
-- ================================================================

-- ROLE_ID column and nullability (nullable is intentional for legacy rows).
SELECT column_name, data_type, nullable
FROM user_tab_columns
WHERE table_name = 'EMPLOYMENT_VERIFICATIONS'
  AND column_name = 'ROLE_ID';

-- Foreign key and supporting lookup index.
SELECT constraint_name, constraint_type, status
FROM user_constraints
WHERE table_name = 'EMPLOYMENT_VERIFICATIONS'
  AND constraint_name = 'FK_EMP_VERIFY_ROLE';

SELECT index_name, status
FROM user_indexes
WHERE table_name = 'EMPLOYMENT_VERIFICATIONS'
  AND index_name = 'IX_EMP_VERIFY_SCOPE_STATUS';

-- Legacy records requiring a corrected/re-requested designation.
SELECT verification_id, employee_id, company_id, verification_status
FROM employment_verifications
WHERE role_id IS NULL
ORDER BY verification_id;

-- Must return zero rows.
SELECT ev.verification_id, ev.role_id
FROM employment_verifications ev
LEFT JOIN job_roles jr ON jr.role_id = ev.role_id
WHERE ev.role_id IS NOT NULL
  AND jr.role_id IS NULL;

-- Active scopes that can authorize new contributions.
SELECT ev.verification_id, ev.employee_id, ev.company_id, ev.role_id,
       ev.expires_at
FROM employment_verifications ev
WHERE ev.verification_status = 'VERIFIED'
  AND ev.role_id IS NOT NULL
  AND (ev.expires_at IS NULL OR ev.expires_at > SYSTIMESTAMP)
ORDER BY ev.employee_id, ev.company_id, ev.role_id;
