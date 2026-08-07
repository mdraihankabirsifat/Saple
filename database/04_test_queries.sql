-- Readable demonstration queries for Saple (Oracle 19c)
-- 1. All companies through the safe public view
SELECT
    company_id,
    company_name,
    industry,
    headquarters_city,
    country,
    company_size
FROM
    vw_public_companies
ORDER BY
    company_name;

-- 2. Employee and company-specific verification information (admin query)
-- Private email, proof reference, and rejection reason are intentionally omitted.
SELECT
    ev.verification_id,
    u.full_name AS employee_name,
    e.employment_status,
    c.company_name,
    ev.verification_method,
    ev.verification_status,
    ev.requested_at,
    ev.reviewed_at,
    ev.expires_at
FROM
    employment_verifications ev
    JOIN employees e ON e.employee_id = ev.employee_id
    JOIN users u ON u.user_id = e.user_id
    JOIN companies c ON c.company_id = ev.company_id
ORDER BY
    ev.requested_at;

-- 3. Approved public reviews (no submitter identity)
SELECT
    company_name,
    role_name,
    review_title,
    overall_rating,
    pros,
    cons,
    employment_status,
    review_date
FROM
    vw_public_approved_reviews
ORDER BY
    review_date DESC;

-- 4. Company-wise average approved review rating (GROUP BY)
SELECT
    company_id,
    company_name,
    ROUND(AVG(overall_rating), 2) AS average_rating,
    COUNT(*) AS approved_review_count
FROM
    vw_public_approved_reviews
GROUP BY
    company_id,
    company_name
ORDER BY
    average_rating DESC,
    company_name;

-- 5. Verified salary range by company and job role
SELECT
    company_name,
    role_name,
    currency,
    pay_period,
    minimum_salary,
    maximum_salary,
    average_salary,
    contribution_count
FROM
    vw_verified_salary_summary
ORDER BY
    company_name,
    role_name,
    pay_period;

-- 6. Community salary range by company and job role
SELECT
    company_name,
    role_name,
    currency,
    pay_period,
    minimum_salary,
    maximum_salary,
    average_salary,
    contribution_count
FROM
    vw_community_salary_summary
ORDER BY
    company_name,
    role_name,
    pay_period;

-- 7. Number of approved contributions by company and submission type
SELECT
    c.company_name,
    s.submission_type,
    COUNT(*) AS contribution_count
FROM
    submissions s
    JOIN companies c ON c.company_id = s.company_id
WHERE
    s.submission_status = 'APPROVED'
GROUP BY
    c.company_name,
    s.submission_type
ORDER BY
    c.company_name,
    s.submission_type;

-- 8. Companies offering a selected benefit (multi-table JOIN)
SELECT
    c.company_name,
    b.benefit_name,
    cb.details,
    cb.eligibility
FROM
    companies c
    JOIN company_benefits cb ON cb.company_id = c.company_id
    JOIN benefits b ON b.benefit_id = cb.benefit_id
WHERE
    b.benefit_name = 'Health Insurance'
ORDER BY
    c.company_name;

-- 9. Pending submissions for admin review
SELECT
    s.submission_id,
    s.submission_type,
    c.company_name,
    s.verification_status,
    s.submitted_at
FROM
    submissions s
    JOIN companies c ON c.company_id = s.company_id
WHERE
    s.submission_status = 'PENDING'
ORDER BY
    s.submitted_at;

-- 10. Open reports (admin query; reporter identity and internal notes omitted)
SELECT
    r.report_id,
    r.submission_id,
    r.reason_category,
    r.report_description,
    r.report_status,
    r.reported_at
FROM
    reports r
WHERE
    r.report_status IN ('OPEN', 'REVIEWING')
ORDER BY
    r.reported_at;

-- 11. Moderation action history (admin query; internal action note omitted)
SELECT
    ma.action_id,
    ma.submission_id,
    u.full_name AS moderator_name,
    ma.action_type,
    ma.previous_status,
    ma.new_status,
    ma.action_at
FROM
    moderation_actions ma
    JOIN users u ON u.user_id = ma.moderator_user_id
ORDER BY
    ma.submission_id,
    ma.action_at;

-- 12. Approved interview experience summary
SELECT
    c.company_name,
    jr.role_name,
    COUNT(*) AS experience_count,
    ROUND(AVG(ie.rounds_count), 2) AS average_rounds,
    ROUND(AVG(ie.duration_days), 2) AS average_duration_days
FROM
    submissions s
    JOIN interview_experiences ie ON ie.submission_id = s.submission_id
    JOIN companies c ON c.company_id = s.company_id
    JOIN job_roles jr ON jr.role_id = ie.role_id
WHERE
    s.submission_status = 'APPROVED'
GROUP BY
    c.company_name,
    jr.role_name
ORDER BY
    c.company_name,
    jr.role_name;

-- 13. GROUP BY example: benefit count for every company
SELECT
    c.company_name,
    COUNT(cb.benefit_id) AS benefit_count
FROM
    companies c
    LEFT JOIN company_benefits cb ON cb.company_id = c.company_id
GROUP BY
    c.company_id,
    c.company_name
ORDER BY
    benefit_count DESC,
    c.company_name;

-- 14. HAVING example: salary groups with at least two approved contributions
SELECT
    c.company_name,
    jr.role_name,
    ss.currency,
    ss.pay_period,
    COUNT(*) AS contribution_count
FROM
    submissions s
    JOIN salary_submissions ss ON ss.submission_id = s.submission_id
    JOIN companies c ON c.company_id = s.company_id
    JOIN job_roles jr ON jr.role_id = ss.role_id
WHERE
    s.submission_status = 'APPROVED'
GROUP BY
    c.company_name,
    jr.role_name,
    ss.currency,
    ss.pay_period
HAVING
    COUNT(*) >= 2
ORDER BY
    contribution_count DESC,
    c.company_name;

-- 15. Multi-table JOIN: approved salary contribution details without user identity
SELECT
    s.submission_id,
    c.company_name,
    jr.role_name,
    ss.base_salary,
    ss.currency,
    ss.pay_period,
    s.verification_status
FROM
    submissions s
    JOIN salary_submissions ss ON ss.submission_id = s.submission_id
    JOIN companies c ON c.company_id = s.company_id
    JOIN job_roles jr ON jr.role_id = ss.role_id
WHERE
    s.submission_status = 'APPROVED'
ORDER BY
    c.company_name,
    jr.role_name,
    ss.base_salary;

-- 16. Subquery: companies whose approved review rating exceeds the overall average
SELECT
    company_name,
    ROUND(AVG(overall_rating), 2) AS company_average_rating
FROM
    vw_public_approved_reviews
GROUP BY
    company_id,
    company_name
HAVING
    AVG(overall_rating) > (
        SELECT
            AVG(overall_rating)
        FROM
            vw_public_approved_reviews
    )
ORDER BY
    company_average_rating DESC;

-- 17. Safe public-view query: software companies
SELECT
    company_name,
    headquarters_city,
    country,
    website
FROM
    vw_public_companies
WHERE
    industry = 'Software'
ORDER BY
    company_name;

-- 18. Terminal report resolution history (admin query)
SELECT
    r.report_id,
    r.submission_id,
    r.reason_category,
    r.report_status,
    r.resolved_at,
    r.resolution_note,
    u.full_name AS resolved_by_name
FROM
    reports r
    JOIN users u ON u.user_id = r.resolved_by
WHERE
    r.report_status IN ('RESOLVED', 'DISMISSED')
ORDER BY
    r.resolved_at DESC;

-- 19. Identity-column inventory for rebuild verification
SELECT
    table_name,
    column_name,
    generation_type,
    identity_options
FROM
    user_tab_identity_cols
WHERE
    table_name IN (
        'USERS', 'EMPLOYEES', 'COMPANIES', 'JOB_ROLES', 'BENEFITS',
        'EMPLOYMENT_VERIFICATIONS', 'SUBMISSIONS', 'REPORTS', 'MODERATION_ACTIONS'
    )
ORDER BY
    table_name;
