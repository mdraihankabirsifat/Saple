const database = require('../config/database');

// Read-only queries behind the homepage hero. Every query is parameterised,
// reads approved or published data only, and returns a handful of rows.
//
// Variety comes from a stable daily tie-break, never from a random sort: an item's
// position among equally relevant candidates is md5(viewer key, today, item),
// so one viewer sees the same order all day, the order moves on the next day,
// and two viewers can see different orders.
const DAILY_TIE_BREAK = (alias) => `md5($1::text || ':' || CURRENT_DATE::text || ':' || ${alias}::text)`;

// Career signals for one account, used only to rank public items. Nothing
// from here is returned to the browser.
async function findProfileSignals(userId) {
  const [profile, experience, skills, activity] = await Promise.all([
    database.query('SELECT headline FROM users WHERE user_id = $1', [userId]),
    database.query(`
      SELECT job_title AS "jobTitle", organization, location, currently_working AS "current"
      FROM user_experience WHERE user_id = $1
      ORDER BY currently_working DESC, start_date DESC, experience_id DESC LIMIT 5
    `, [userId]),
    database.query(`
      SELECT s.skill_name AS "name" FROM user_skills us JOIN skills s ON s.skill_id = us.skill_id
      WHERE us.user_id = $1 ORDER BY s.skill_name LIMIT 30
    `, [userId]),
    // Roles and industries the member has worked with on Saple: jobs they
    // applied to, and companies and roles they contributed about.
    database.query(`
      SELECT ARRAY_REMOVE(ARRAY_AGG(DISTINCT role_id), NULL) AS "roleIds",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT industry), NULL) AS "industries",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT applied_job_id), NULL) AS "appliedJobIds"
      FROM (
        SELECT jp.role_id, c.industry, jp.job_id AS applied_job_id
        FROM job_applications ja
        JOIN job_postings jp ON jp.job_id = ja.job_id
        JOIN companies c ON c.company_id = jp.company_id
        WHERE ja.applicant_user_id = $1
        UNION ALL
        SELECT COALESCE(ss.role_id, cr.role_id, ie.role_id), c.industry, NULL
        FROM submissions s
        JOIN companies c ON c.company_id = s.company_id
        LEFT JOIN salary_submissions ss ON ss.submission_id = s.submission_id
        LEFT JOIN company_reviews cr ON cr.submission_id = s.submission_id
        LEFT JOIN interview_experiences ie ON ie.submission_id = s.submission_id
        WHERE s.user_id = $1
      ) signals
    `, [userId])
  ]);
  return {
    headline: profile.rows[0]?.headline || null,
    experience: experience.rows,
    skills: skills.rows.map((row) => row.name),
    roleIds: (activity.rows[0]?.roleIds || []).map(Number),
    industries: activity.rows[0]?.industries || [],
    appliedJobIds: (activity.rows[0]?.appliedJobIds || []).map(Number)
  };
}

// Open vacancies scored by transparent weights: a title match counts most,
// then the job's role, then skills found in the description, then industry,
// location and recency. Already-applied vacancies are excluded.
async function findRankedJobs({ viewerKey, terms, roleIds, industries, location, excludeJobIds, limit }) {
  const result = await database.query(`
    SELECT v.job_id AS "jobId", v.company_id AS "companyId", v.company_name AS "companyName",
      v.title, v.location, v.work_mode AS "workMode", v.employment_type AS "employmentType",
      v.salary_min AS "salaryMin", v.salary_max AS "salaryMax", v.salary_currency AS "salaryCurrency",
      v.salary_period AS "salaryPeriod", v.published_at AS "publishedAt",
      COALESCE(to_jsonb(v)->>'access_level', 'FREE') AS "accessLevel",
      (
        5 * (SELECT COUNT(*) FROM unnest($2::text[]) t WHERE LOWER(v.title) LIKE '%' || t || '%')
        + 2 * LEAST(3, (SELECT COUNT(*) FROM unnest($2::text[]) t
            WHERE LOWER(COALESCE(v.description, '') || ' ' || COALESCE(v.requirements, '')) LIKE '%' || t || '%'))
        + CASE WHEN v.role_id = ANY($3::bigint[]) THEN 4 ELSE 0 END
        + CASE WHEN v.industry = ANY($4::text[]) THEN 2 ELSE 0 END
        + CASE WHEN $5::text IS NOT NULL AND LOWER(v.location) LIKE '%' || $5::text || '%' THEN 2 ELSE 0 END
        + CASE WHEN v.published_at > CURRENT_TIMESTAMP - INTERVAL '14 days' THEN 1.5
               WHEN v.published_at > CURRENT_TIMESTAMP - INTERVAL '45 days' THEN 0.5 ELSE 0 END
      ) AS score
    FROM vw_public_open_jobs v
    WHERE NOT (v.job_id = ANY($6::bigint[]))
    ORDER BY score DESC, ${DAILY_TIE_BREAK('v.job_id')}
    LIMIT $7
  `, [viewerKey, terms, roleIds, industries, location, excludeJobIds, limit]);
  return result.rows;
}

// The best-paid open vacancies in one currency and pay period at a time, so
// taka are never compared with dollars or months with years. The group is the
// most common one among open vacancies that publish a salary.
async function findHighPayingJobs({ viewerKey, location, excludeJobIds, includePremium, limit }) {
  const result = await database.query(`
    WITH salaried AS (
      SELECT v.*, COALESCE(to_jsonb(v)->>'access_level', 'FREE') AS access
      FROM vw_public_open_jobs v
      WHERE v.salary_max IS NOT NULL AND v.salary_currency IS NOT NULL AND v.salary_period IS NOT NULL
    ),
    main_group AS (
      SELECT salary_currency, salary_period FROM salaried
      GROUP BY salary_currency, salary_period ORDER BY COUNT(*) DESC, salary_currency, salary_period LIMIT 1
    ),
    ranked AS (
      SELECT s.*, (CASE WHEN $2::text IS NOT NULL AND LOWER(s.location) LIKE '%' || $2::text || '%' THEN 1 ELSE 0 END) AS nearby,
        PERCENT_RANK() OVER (ORDER BY s.salary_max) AS pay_rank
      FROM salaried s JOIN main_group g USING (salary_currency, salary_period)
      WHERE ($4::boolean OR s.access = 'FREE') AND NOT (s.job_id = ANY($3::bigint[]))
    )
    SELECT job_id AS "jobId", company_id AS "companyId", company_name AS "companyName", title, location,
      work_mode AS "workMode", employment_type AS "employmentType", salary_min AS "salaryMin",
      salary_max AS "salaryMax", salary_currency AS "salaryCurrency", salary_period AS "salaryPeriod",
      published_at AS "publishedAt", access AS "accessLevel", nearby = 1 AS "nearby"
    FROM ranked
    -- Only the upper half of the group is called high-paying.
    WHERE pay_rank >= 0.5
    ORDER BY nearby DESC, salary_max DESC, ${DAILY_TIE_BREAK('job_id')}
    LIMIT $5
  `, [viewerKey, location, excludeJobIds, includePremium, limit]);
  return result.rows;
}

// Recent approved interview experiences, relevant roles first. The questions
// text is read here and gated by the service before anything leaves.
async function findInterviews({ viewerKey, terms, roleIds, limit }) {
  const result = await database.query(`
    SELECT ie.submission_id AS "submissionId", s.company_id AS "companyId", c.company_name AS "companyName",
      jr.role_id AS "roleId", jr.role_name AS "roleName", ie.difficulty_level AS "difficultyLevel",
      ie.interview_mode AS "interviewMode", ie.questions_summary AS "questionsSummary",
      s.approved_at AS "approvedAt"
    FROM interview_experiences ie
    JOIN submissions s ON s.submission_id = ie.submission_id
    JOIN companies c ON c.company_id = s.company_id
    JOIN job_roles jr ON jr.role_id = ie.role_id
    WHERE s.submission_type = 'INTERVIEW' AND s.submission_status = 'APPROVED'
      AND ie.questions_summary IS NOT NULL AND LENGTH(TRIM(ie.questions_summary)) > 0
    ORDER BY (
        CASE WHEN jr.role_id = ANY($3::bigint[]) THEN 3 ELSE 0 END
        + 2 * LEAST(2, (SELECT COUNT(*) FROM unnest($2::text[]) t WHERE LOWER(jr.role_name) LIKE '%' || t || '%'))
      ) DESC,
      s.approved_at DESC NULLS LAST,
      ${DAILY_TIE_BREAK('ie.submission_id')}
    LIMIT $4
  `, [viewerKey, terms, roleIds, limit]);
  return result.rows;
}

// Approved reviews only. A company needs at least three of them to be called
// top reviewed, unless fewer than three companies reach that bar at all.
async function findTopReviewedCompanies({ viewerKey, industries, limit }) {
  const result = await database.query(`
    WITH rated AS (
      SELECT s.company_id, c.company_name, c.industry,
        ROUND(AVG(r.overall_rating), 1) AS average_rating, COUNT(*)::int AS review_count,
        MAX(r.review_date) AS latest_review
      FROM submissions s
      JOIN company_reviews r ON r.submission_id = s.submission_id
      JOIN companies c ON c.company_id = s.company_id
      WHERE s.submission_type = 'REVIEW' AND s.submission_status = 'APPROVED'
      GROUP BY s.company_id, c.company_name, c.industry
    ),
    eligible AS (
      SELECT * FROM rated
      WHERE review_count >= CASE WHEN (SELECT COUNT(*) FROM rated WHERE review_count >= 3) >= 3 THEN 3 ELSE 1 END
    ),
    shortlist AS (
      SELECT *, (CASE WHEN industry = ANY($2::text[]) THEN 1 ELSE 0 END) AS related
      FROM eligible
      ORDER BY related DESC, average_rating DESC, review_count DESC, latest_review DESC
      LIMIT $3 * 2
    )
    SELECT company_id AS "companyId", company_name AS "companyName", industry,
      average_rating AS "averageRating", review_count AS "reviewCount"
    FROM shortlist
    ORDER BY related DESC, ${DAILY_TIE_BREAK('company_id')}
    LIMIT $3
  `, [viewerKey, industries, limit]);
  return result.rows;
}

// Approved salary ranges per role, one currency and pay period per group, so
// incomparable figures are never merged. Relevant roles first.
async function findSalaryInsights({ viewerKey, terms, roleIds, limit }) {
  const result = await database.query(`
    WITH grouped AS (
      SELECT ss.role_id, jr.role_name, ss.currency, ss.pay_period,
        MIN(ss.base_salary) AS minimum, MAX(ss.base_salary) AS maximum, COUNT(*)::int AS contributions
      FROM submissions s
      JOIN salary_submissions ss ON ss.submission_id = s.submission_id
      JOIN job_roles jr ON jr.role_id = ss.role_id
      WHERE s.submission_type = 'SALARY' AND s.submission_status = 'APPROVED'
      GROUP BY ss.role_id, jr.role_name, ss.currency, ss.pay_period
      HAVING COUNT(*) >= 2
    )
    SELECT role_id AS "roleId", role_name AS "roleName", currency, pay_period AS "payPeriod",
      minimum, maximum, contributions
    FROM grouped
    ORDER BY (
        CASE WHEN role_id = ANY($3::bigint[]) THEN 3 ELSE 0 END
        + 2 * LEAST(2, (SELECT COUNT(*) FROM unnest($2::text[]) t WHERE LOWER(role_name) LIKE '%' || t || '%'))
      ) DESC,
      LEAST(contributions, 10) DESC,
      ${DAILY_TIE_BREAK('role_id')}
    LIMIT $4
  `, [viewerKey, terms, roleIds, limit]);
  return result.rows;
}

// Cumulative approved insights (salaries, reviews and interviews) at the end
// of each of the last twelve months, from the approval timestamps.
async function findActivitySeries() {
  const result = await database.query(`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', CURRENT_TIMESTAMP) - INTERVAL '11 months',
        date_trunc('month', CURRENT_TIMESTAMP),
        INTERVAL '1 month'
      ) AS month_start
    )
    SELECT to_char(m.month_start, 'YYYY-MM') AS period,
      (SELECT COUNT(*)::int FROM submissions s
        WHERE s.submission_status = 'APPROVED'
          AND s.submission_type IN ('SALARY', 'REVIEW', 'INTERVIEW')
          AND s.approved_at < m.month_start + INTERVAL '1 month') AS "cumulativeApprovedInsights"
    FROM months m
    ORDER BY m.month_start
  `);
  return result.rows;
}

module.exports = {
  findProfileSignals,
  findRankedJobs,
  findHighPayingJobs,
  findInterviews,
  findTopReviewedCompanies,
  findSalaryInsights,
  findActivitySeries
};
