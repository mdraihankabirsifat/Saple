-- Saple additive seed 08: deterministic synthetic academic demonstration data
--
-- Run after 07_add_role_scoped_verification.sql. This script targets only the
-- four original sample companies and the fifty companies introduced by 05.
-- All generated accounts use the saple.demo.*@example.invalid convention.
-- Salary figures are fictional BDT/month examples, are not official company
-- salaries, and must never be used as trustworthy ML training data.

DECLARE
    v_demo_admin_id users.user_id%TYPE;
    v_user_id users.user_id%TYPE;
    v_employee_id employees.employee_id%TYPE;
    v_submission_id submissions.submission_id%TYPE;
    v_existing NUMBER;
    v_base_salary NUMBER(12,2);
    v_email users.email%TYPE;
    v_company_email employment_verifications.company_email%TYPE;
    v_title company_reviews.review_title%TYPE;
BEGIN
    MERGE INTO users target
    USING (
        SELECT 'Synthetic Demo Moderator' AS full_name,
               'saple.demo.moderator@example.invalid' AS email
        FROM dual
    ) source
    ON (LOWER(target.email) = LOWER(source.email))
    WHEN NOT MATCHED THEN INSERT (
        full_name, email, password_hash, user_type, account_role, account_status
    ) VALUES (
        source.full_name,
        source.email,
        '$2b$12$EHokZ8vUNnpNotyJ0fds0e.AjAlIRmg76aJXrPLs34Xo7K3ECITnm',
        'NORMAL',
        'ADMIN',
        'ACTIVE'
    );

    SELECT user_id INTO v_demo_admin_id
    FROM users
    WHERE LOWER(email) = 'saple.demo.moderator@example.invalid';

    FOR scope_row IN (
        WITH seeded_names (company_name) AS (
            SELECT 'Aster Byte Limited' FROM dual
            UNION ALL SELECT 'Meghna Analytics' FROM dual
            UNION ALL SELECT 'Northstar Fintech' FROM dual
            UNION ALL SELECT 'Green Delta Robotics' FROM dual
            UNION ALL SELECT 'Grameenphone' FROM dual
            UNION ALL SELECT 'Robi Axiata' FROM dual
            UNION ALL SELECT 'Banglalink' FROM dual
            UNION ALL SELECT 'BRAC Bank' FROM dual
            UNION ALL SELECT 'City Bank' FROM dual
            UNION ALL SELECT 'Eastern Bank' FROM dual
            UNION ALL SELECT 'Dutch-Bangla Bank' FROM dual
            UNION ALL SELECT 'IDLC Finance' FROM dual
            UNION ALL SELECT 'bKash' FROM dual
            UNION ALL SELECT 'Nagad' FROM dual
            UNION ALL SELECT 'Square Pharmaceuticals' FROM dual
            UNION ALL SELECT 'Renata' FROM dual
            UNION ALL SELECT 'Incepta Pharmaceuticals' FROM dual
            UNION ALL SELECT 'Beximco Pharmaceuticals' FROM dual
            UNION ALL SELECT 'ACI' FROM dual
            UNION ALL SELECT 'PRAN-RFL Group' FROM dual
            UNION ALL SELECT 'Walton Hi-Tech Industries' FROM dual
            UNION ALL SELECT 'Bashundhara Group' FROM dual
            UNION ALL SELECT 'Akij Group' FROM dual
            UNION ALL SELECT 'Meghna Group of Industries' FROM dual
            UNION ALL SELECT 'Beximco Group' FROM dual
            UNION ALL SELECT 'DBL Group' FROM dual
            UNION ALL SELECT 'Viyellatex Group' FROM dual
            UNION ALL SELECT 'Brain Station 23' FROM dual
            UNION ALL SELECT 'BJIT' FROM dual
            UNION ALL SELECT 'Enosis Solutions' FROM dual
            UNION ALL SELECT 'Therap (Bangladesh)' FROM dual
            UNION ALL SELECT 'SSL Wireless' FROM dual
            UNION ALL SELECT 'Pathao' FROM dual
            UNION ALL SELECT 'Chaldal' FROM dual
            UNION ALL SELECT 'ShopUp' FROM dual
            UNION ALL SELECT 'Daraz Bangladesh' FROM dual
            UNION ALL SELECT 'foodpanda Bangladesh' FROM dual
            UNION ALL SELECT 'BRAC' FROM dual
            UNION ALL SELECT 'Summit Group' FROM dual
            UNION ALL SELECT 'Google' FROM dual
            UNION ALL SELECT 'Microsoft' FROM dual
            UNION ALL SELECT 'Amazon' FROM dual
            UNION ALL SELECT 'IBM' FROM dual
            UNION ALL SELECT 'Oracle' FROM dual
            UNION ALL SELECT 'Samsung Electronics' FROM dual
            UNION ALL SELECT 'Unilever' FROM dual
            UNION ALL SELECT 'Nestle' FROM dual
            UNION ALL SELECT 'Siemens' FROM dual
            UNION ALL SELECT 'Deloitte' FROM dual
            UNION ALL SELECT 'PwC' FROM dual
            UNION ALL SELECT 'Maersk' FROM dual
            UNION ALL SELECT 'Toyota' FROM dual
            UNION ALL SELECT 'Pfizer' FROM dual
            UNION ALL SELECT 'HSBC' FROM dual
        ),
        company_roles AS (
            SELECT c.company_id, c.company_name, c.industry,
                CASE
                    WHEN UPPER(c.industry) LIKE '%PHARM%' THEN 'Pharmacist'
                    WHEN UPPER(c.industry) LIKE '%APPAREL%' OR UPPER(c.industry) LIKE '%TEXTILE%' THEN 'Textile Engineer'
                    WHEN UPPER(c.industry) LIKE '%BANK%' OR UPPER(c.industry) = 'FINANCIAL SERVICES' THEN 'Banking Officer'
                    WHEN UPPER(c.industry) LIKE '%DATA%' THEN 'Data Engineer'
                    WHEN UPPER(c.industry) LIKE '%ELECTRON%' OR UPPER(c.industry) LIKE '%INDUSTRIAL%'
                      OR UPPER(c.industry) LIKE '%ROBOT%' OR UPPER(c.industry) LIKE '%AUTOMOTIVE%'
                      OR UPPER(c.industry) LIKE '%POWER%' THEN 'Production Engineer'
                    WHEN UPPER(c.industry) LIKE '%CONSUMER GOODS%' OR UPPER(c.industry) LIKE '%FOOD%'
                      OR UPPER(c.industry) = 'DIVERSIFIED' THEN 'Operations Manager'
                    WHEN UPPER(c.industry) LIKE '%NONPROFIT%' THEN 'Project Manager'
                    WHEN UPPER(c.industry) LIKE '%PROFESSIONAL%' OR UPPER(c.industry) LIKE '%CONSULT%' THEN 'Business Analyst'
                    WHEN UPPER(c.industry) LIKE '%LOGISTICS%' OR UPPER(c.industry) LIKE '%SHIPPING%' THEN 'Logistics Coordinator'
                    ELSE 'Backend Engineer'
                END AS primary_role,
                CASE
                    WHEN UPPER(c.industry) LIKE '%PHARM%' THEN 'Medical Promotion Officer'
                    WHEN UPPER(c.industry) LIKE '%APPAREL%' OR UPPER(c.industry) LIKE '%TEXTILE%' THEN 'Apparel Merchandiser'
                    WHEN UPPER(c.industry) LIKE '%BANK%' OR UPPER(c.industry) = 'FINANCIAL SERVICES' THEN 'Risk Analyst'
                    WHEN UPPER(c.industry) LIKE '%DATA%' THEN 'Business Intelligence Analyst'
                    WHEN UPPER(c.industry) LIKE '%ELECTRON%' OR UPPER(c.industry) LIKE '%INDUSTRIAL%'
                      OR UPPER(c.industry) LIKE '%ROBOT%' OR UPPER(c.industry) LIKE '%AUTOMOTIVE%'
                      OR UPPER(c.industry) LIKE '%POWER%' THEN 'Electrical Engineer'
                    WHEN UPPER(c.industry) LIKE '%CONSUMER GOODS%' OR UPPER(c.industry) LIKE '%FOOD%'
                      OR UPPER(c.industry) = 'DIVERSIFIED' THEN 'Supply Chain Analyst'
                    WHEN UPPER(c.industry) LIKE '%NONPROFIT%' THEN 'Research Associate'
                    WHEN UPPER(c.industry) LIKE '%PROFESSIONAL%' OR UPPER(c.industry) LIKE '%CONSULT%' THEN 'Internal Auditor'
                    WHEN UPPER(c.industry) LIKE '%LOGISTICS%' OR UPPER(c.industry) LIKE '%SHIPPING%' THEN 'Supply Chain Analyst'
                    ELSE 'Data Engineer'
                END AS secondary_role
            FROM companies c
            JOIN seeded_names n ON UPPER(n.company_name) = UPPER(c.company_name)
        ),
        scope_names AS (
            SELECT company_id, company_name, industry, primary_role AS role_name, 1 AS scope_order
            FROM company_roles
            UNION ALL
            SELECT company_id, company_name, industry, secondary_role AS role_name, 2 AS scope_order
            FROM company_roles
        )
        SELECT s.company_id, s.company_name, s.industry, s.scope_order,
               jr.role_id, jr.role_name, jr.role_category
        FROM scope_names s
        JOIN job_roles jr ON UPPER(jr.role_name) = UPPER(s.role_name)
        ORDER BY s.company_id, s.scope_order
    ) LOOP
        v_email := 'saple.demo.c' || scope_row.company_id || '.r' || scope_row.role_id || '@example.invalid';
        v_company_email := 'saple.demo.c' || scope_row.company_id || '.r' || scope_row.role_id || '@verification.invalid';

        INSERT INTO users (
            full_name, email, password_hash, user_type, account_role, account_status
        )
        SELECT 'Synthetic Demo Employee C' || scope_row.company_id || ' R' || scope_row.role_id,
               v_email,
               '$2b$12$EHokZ8vUNnpNotyJ0fds0e.AjAlIRmg76aJXrPLs34Xo7K3ECITnm',
               'EMPLOYEE', 'USER', 'ACTIVE'
        FROM dual
        WHERE NOT EXISTS (
            SELECT 1 FROM users WHERE LOWER(email) = LOWER(v_email)
        );

        SELECT user_id INTO v_user_id
        FROM users
        WHERE LOWER(email) = LOWER(v_email);

        INSERT INTO employees (user_id, employment_status)
        SELECT v_user_id, 'CURRENT'
        FROM dual
        WHERE NOT EXISTS (
            SELECT 1 FROM employees WHERE user_id = v_user_id
        );

        SELECT employee_id INTO v_employee_id
        FROM employees
        WHERE user_id = v_user_id;

        INSERT INTO employment_verifications (
            employee_id, company_id, role_id, verification_method, company_email,
            proof_type, proof_reference, verification_status, requested_at,
            reviewed_at, expires_at, rejection_reason, reviewed_by
        )
        SELECT v_employee_id, scope_row.company_id, scope_row.role_id,
               'COMPANY_EMAIL_OTP', v_company_email, NULL, NULL, 'VERIFIED',
               TIMESTAMP '2026-05-01 09:00:00', TIMESTAMP '2026-05-01 10:00:00',
               TIMESTAMP '2035-05-01 10:00:00', NULL, v_demo_admin_id
        FROM dual
        WHERE NOT EXISTS (
            SELECT 1
            FROM employment_verifications ev
            WHERE ev.employee_id = v_employee_id
              AND ev.company_id = scope_row.company_id
              AND ev.role_id = scope_row.role_id
              AND ev.company_email = v_company_email
        );

        IF UPPER(scope_row.role_category) LIKE '%TECH%'
           OR UPPER(scope_row.role_category) LIKE '%DATA%'
           OR UPPER(scope_row.role_category) LIKE '%ENGINEER%' THEN
            v_base_salary := 65000;
        ELSIF UPPER(scope_row.role_category) LIKE '%FINANCE%'
           OR UPPER(scope_row.role_category) LIKE '%BANK%' THEN
            v_base_salary := 58000;
        ELSIF UPPER(scope_row.role_category) LIKE '%PHARM%' THEN
            v_base_salary := 50000;
        ELSIF UPPER(scope_row.role_category) LIKE '%SUPPLY%'
           OR UPPER(scope_row.role_category) LIKE '%MANUFACTUR%' THEN
            v_base_salary := 48000;
        ELSE
            v_base_salary := 52000;
        END IF;

        FOR salary_number IN 1..5 LOOP
            v_base_salary := v_base_salary + 3500;
            SELECT COUNT(*) INTO v_existing
            FROM submissions s
            JOIN salary_submissions ss ON ss.submission_id = s.submission_id
            WHERE s.user_id = v_user_id
              AND s.company_id = scope_row.company_id
              AND s.submission_type = 'SALARY'
              AND ss.role_id = scope_row.role_id
              AND ss.salary_year = 2026
              AND ss.years_of_experience = salary_number
              AND ss.base_salary = v_base_salary;

            IF v_existing = 0 THEN
                INSERT INTO submissions (
                    user_id, company_id, submission_type, is_anonymous,
                    submission_status, verification_status, submitted_at,
                    approved_at, updated_at
                ) VALUES (
                    v_user_id, scope_row.company_id, 'SALARY', 1,
                    'APPROVED', 'VERIFIED',
                    TIMESTAMP '2026-06-01 09:00:00' + NUMTODSINTERVAL(MOD(scope_row.company_id, 20) + salary_number, 'DAY'),
                    TIMESTAMP '2026-06-02 09:00:00' + NUMTODSINTERVAL(MOD(scope_row.company_id, 20) + salary_number, 'DAY'),
                    TIMESTAMP '2026-06-02 09:00:00' + NUMTODSINTERVAL(MOD(scope_row.company_id, 20) + salary_number, 'DAY')
                ) RETURNING submission_id INTO v_submission_id;

                INSERT INTO salary_submissions (
                    submission_id, role_id, base_salary, additional_compensation,
                    currency, pay_period, years_of_experience, employment_type,
                    work_mode, salary_year
                ) VALUES (
                    v_submission_id, scope_row.role_id, v_base_salary,
                    3000 + (salary_number * 1000), 'BDT', 'MONTHLY', salary_number,
                    'FULL_TIME',
                    CASE MOD(salary_number, 3)
                        WHEN 0 THEN 'REMOTE'
                        WHEN 1 THEN 'ONSITE'
                        ELSE 'HYBRID'
                    END,
                    2026
                );
            END IF;
        END LOOP;

        IF scope_row.scope_order = 1 THEN
            FOR review_number IN 1..3 LOOP
                v_title := 'Synthetic academic demo review ' || review_number;
                SELECT COUNT(*) INTO v_existing
                FROM submissions s
                JOIN company_reviews cr ON cr.submission_id = s.submission_id
                WHERE s.user_id = v_user_id
                  AND s.company_id = scope_row.company_id
                  AND s.submission_type = 'REVIEW'
                  AND cr.role_id = scope_row.role_id
                  AND cr.review_title = v_title;

                IF v_existing = 0 THEN
                    INSERT INTO submissions (
                        user_id, company_id, submission_type, is_anonymous,
                        submission_status, verification_status, submitted_at,
                        approved_at, updated_at
                    ) VALUES (
                        v_user_id, scope_row.company_id, 'REVIEW', 1,
                        'APPROVED', 'VERIFIED',
                        TIMESTAMP '2026-07-01 09:00:00' + NUMTODSINTERVAL(review_number, 'DAY'),
                        TIMESTAMP '2026-07-02 09:00:00' + NUMTODSINTERVAL(review_number, 'DAY'),
                        TIMESTAMP '2026-07-02 09:00:00' + NUMTODSINTERVAL(review_number, 'DAY')
                    ) RETURNING submission_id INTO v_submission_id;

                    INSERT INTO company_reviews (
                        submission_id, role_id, review_title, overall_rating,
                        work_life_balance_rating, career_growth_rating,
                        management_rating, culture_rating, pros, cons,
                        advice_to_management, employment_status, review_date
                    ) VALUES (
                        v_submission_id, scope_row.role_id, v_title,
                        3.5 + (MOD(scope_row.company_id + review_number, 4) * 0.5),
                        3.5 + (MOD(review_number, 3) * 0.5),
                        3.5 + (MOD(review_number + 1, 3) * 0.5),
                        3.5 + (MOD(scope_row.company_id + review_number, 3) * 0.5),
                        3.5 + (MOD(scope_row.company_id + review_number + 1, 3) * 0.5),
                        'Synthetic academic demonstration: structured learning opportunities and collaborative colleagues.',
                        'Synthetic academic demonstration: workload and process consistency can vary.',
                        'Synthetic academic demonstration: continue investing in clear feedback and planning.',
                        'CURRENT', DATE '2026-05-01' + review_number
                    );
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
/

-- ================================================================
-- Verification queries
-- ================================================================

-- Total synthetic salary submissions (expected: 540 when all 54 companies
-- and both mapped roles exist).
SELECT COUNT(*) AS demo_salary_submissions
FROM submissions s
JOIN salary_submissions ss ON ss.submission_id = s.submission_id
JOIN users u ON u.user_id = s.user_id
WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
  AND s.submission_type = 'SALARY';

-- Approved counts by company and role.
SELECT c.company_name, jr.role_name, COUNT(*) AS approved_salary_count
FROM submissions s
JOIN salary_submissions ss ON ss.submission_id = s.submission_id
JOIN users u ON u.user_id = s.user_id
JOIN companies c ON c.company_id = s.company_id
JOIN job_roles jr ON jr.role_id = ss.role_id
WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
  AND s.submission_status = 'APPROVED'
GROUP BY c.company_name, jr.role_name
ORDER BY c.company_name, jr.role_name;

-- Must return zero rows: any demo company-role group below five salaries.
SELECT s.company_id, ss.role_id, COUNT(*) AS approved_salary_count
FROM submissions s
JOIN salary_submissions ss ON ss.submission_id = s.submission_id
JOIN users u ON u.user_id = s.user_id
WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
  AND s.submission_status = 'APPROVED'
GROUP BY s.company_id, ss.role_id
HAVING COUNT(*) < 5;

-- Verified versus community-eligible demo counts. Community includes every
-- approved row; verified is the trusted subset used by the verified view.
SELECT COUNT(*) AS community_eligible_count,
       SUM(CASE WHEN s.verification_status = 'VERIFIED' THEN 1 ELSE 0 END) AS verified_count
FROM submissions s
JOIN salary_submissions ss ON ss.submission_id = s.submission_id
JOIN users u ON u.user_id = s.user_id
WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
  AND s.submission_status = 'APPROVED';

-- Both public salary views must expose the demo groups.
SELECT 'VERIFIED' AS salary_view, COUNT(*) AS group_count
FROM vw_verified_salary_summary
WHERE company_id IN (
    SELECT DISTINCT s.company_id FROM submissions s
    JOIN users u ON u.user_id = s.user_id
    WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
)
UNION ALL
SELECT 'COMMUNITY', COUNT(*)
FROM vw_community_salary_summary
WHERE company_id IN (
    SELECT DISTINCT s.company_id FROM submissions s
    JOIN users u ON u.user_id = s.user_id
    WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
);

-- Approved review counts and averages (expected at least 3 per company).
SELECT c.company_name, COUNT(*) AS approved_review_count,
       ROUND(AVG(cr.overall_rating), 1) AS average_rating
FROM submissions s
JOIN company_reviews cr ON cr.submission_id = s.submission_id
JOIN users u ON u.user_id = s.user_id
JOIN companies c ON c.company_id = s.company_id
WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
  AND s.submission_status = 'APPROVED'
GROUP BY c.company_name
ORDER BY c.company_name;

-- Must return zero: parent/subtype orphans among demo rows.
SELECT 'SALARY_WITHOUT_PARENT' AS problem, ss.submission_id
FROM salary_submissions ss
LEFT JOIN submissions s ON s.submission_id = ss.submission_id
WHERE s.submission_id IS NULL
UNION ALL
SELECT 'REVIEW_WITHOUT_PARENT', cr.submission_id
FROM company_reviews cr
LEFT JOIN submissions s ON s.submission_id = cr.submission_id
WHERE s.submission_id IS NULL;

-- Must return zero: invalid scope references for synthetic demo users.
SELECT s.submission_id
FROM submissions s
JOIN users u ON u.user_id = s.user_id
LEFT JOIN employees e ON e.user_id = s.user_id
LEFT JOIN salary_submissions ss ON ss.submission_id = s.submission_id
LEFT JOIN company_reviews cr ON cr.submission_id = s.submission_id
WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
  AND (
      e.employee_id IS NULL
      OR NOT EXISTS (
          SELECT 1 FROM employment_verifications ev
          WHERE ev.employee_id = e.employee_id
            AND ev.company_id = s.company_id
            AND ev.role_id = COALESCE(ss.role_id, cr.role_id)
            AND ev.verification_status = 'VERIFIED'
            AND (ev.expires_at IS NULL OR ev.expires_at > SYSTIMESTAMP)
      )
  );

-- Must return zero: duplicate deterministic synthetic salary markers.
SELECT s.user_id, s.company_id, ss.role_id, ss.salary_year,
       ss.years_of_experience, ss.base_salary, COUNT(*) AS duplicate_count
FROM submissions s
JOIN salary_submissions ss ON ss.submission_id = s.submission_id
JOIN users u ON u.user_id = s.user_id
WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
GROUP BY s.user_id, s.company_id, ss.role_id, ss.salary_year,
         ss.years_of_experience, ss.base_salary
HAVING COUNT(*) > 1;
