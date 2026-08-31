const database = require('../config/database');

async function executeQuery(sql, values = []) {
  const result = await database.query(sql, values);
  return result.rows;
}

function addSharedFilters(filters, conditions, values, aliases) {
  const bind = (value) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.companyId !== null) {
    conditions.push(`${aliases.company}.company_id = ${bind(filters.companyId)}`);
  }
  if (filters.roleId !== null) {
    conditions.push(`${aliases.detail}.role_id = ${bind(filters.roleId)}`);
  }
  if (filters.location) {
    const placeholder = bind(`%${filters.location.toUpperCase()}%`);
    conditions.push(`(
      UPPER(${aliases.company}.headquarters_city) LIKE ${placeholder}
      OR UPPER(${aliases.company}.country) LIKE ${placeholder}
    )`);
  }
  return bind;
}

async function findPublicSalaryInsights(filters) {
  const conditions = ["s.submission_status = 'APPROVED'"];
  const having = [];
  const values = [];
  const bind = addSharedFilters(filters, conditions, values, { company: 'c', detail: 'ss' });
  const selectedMinimum = filters.salarySource === 'VERIFIED'
    ? "MIN(ss.base_salary) FILTER (WHERE s.verification_status = 'VERIFIED')"
    : 'MIN(ss.base_salary)';
  const selectedMaximum = filters.salarySource === 'VERIFIED'
    ? "MAX(ss.base_salary) FILTER (WHERE s.verification_status = 'VERIFIED')"
    : 'MAX(ss.base_salary)';

  if (filters.salarySource === 'VERIFIED') {
    having.push("COUNT(*) FILTER (WHERE s.verification_status = 'VERIFIED') > 0");
  }
  if (filters.minSalary !== null) having.push(`${selectedMaximum} >= ${bind(filters.minSalary)}`);
  if (filters.maxSalary !== null) having.push(`${selectedMinimum} <= ${bind(filters.maxSalary)}`);

  return executeQuery(`
    SELECT c.company_id AS "companyId", c.company_name AS "companyName",
      c.headquarters_city AS "headquartersCity", c.country,
      jr.role_id AS "roleId", jr.role_name AS "roleName",
      ss.currency, ss.pay_period AS "payPeriod",
      MIN(ss.base_salary) AS "communityMinimumSalary",
      MAX(ss.base_salary) AS "communityMaximumSalary",
      ROUND(AVG(ss.base_salary), 2) AS "communityAverageSalary",
      COUNT(*)::INTEGER AS "communityContributionCount",
      MIN(ss.base_salary) FILTER (WHERE s.verification_status = 'VERIFIED')
        AS "verifiedMinimumSalary",
      MAX(ss.base_salary) FILTER (WHERE s.verification_status = 'VERIFIED')
        AS "verifiedMaximumSalary",
      ROUND(AVG(ss.base_salary) FILTER (WHERE s.verification_status = 'VERIFIED'), 2)
        AS "verifiedAverageSalary",
      COUNT(*) FILTER (WHERE s.verification_status = 'VERIFIED')::INTEGER
        AS "verifiedContributionCount"
    FROM submissions s
    JOIN salary_submissions ss ON ss.submission_id = s.submission_id
    JOIN companies c ON c.company_id = s.company_id
    JOIN job_roles jr ON jr.role_id = ss.role_id
    WHERE ${conditions.join('\n      AND ')}
    GROUP BY c.company_id, c.company_name, c.headquarters_city, c.country,
      jr.role_id, jr.role_name, ss.currency, ss.pay_period
    ${having.length ? `HAVING ${having.join('\n      AND ')}` : ''}
    ORDER BY c.company_name, jr.role_name, ss.currency, ss.pay_period
  `, values);
}

async function findPublicReviews(filters) {
  const conditions = ["s.submission_type = 'REVIEW'", "s.submission_status = 'APPROVED'"];
  const values = [];
  const bind = addSharedFilters(filters, conditions, values, { company: 'c', detail: 'cr' });
  if (filters.minRating !== null) {
    conditions.push(`cr.overall_rating >= ${bind(filters.minRating)}`);
  }
  return executeQuery(`
    SELECT s.submission_id AS "submissionId", c.company_id AS "companyId",
      c.company_name AS "companyName", c.headquarters_city AS "headquartersCity",
      c.country, cr.role_id AS "roleId", jr.role_name AS "roleName",
      cr.review_title AS "reviewTitle", cr.overall_rating AS "overallRating",
      cr.work_life_balance_rating AS "workLifeBalanceRating",
      cr.career_growth_rating AS "careerGrowthRating",
      cr.management_rating AS "managementRating", cr.culture_rating AS "cultureRating",
      cr.pros, cr.cons, cr.advice_to_management AS "adviceToManagement",
      cr.employment_status AS "employmentStatus", cr.review_date AS "reviewDate",
      s.verification_status AS "verificationStatus", s.approved_at AS "approvedAt",
      CASE WHEN s.is_anonymous = 0 THEN u.full_name ELSE NULL END AS "authorName"
    FROM submissions s
    JOIN company_reviews cr ON cr.submission_id = s.submission_id
    JOIN companies c ON c.company_id = s.company_id
    LEFT JOIN job_roles jr ON jr.role_id = cr.role_id
    JOIN users u ON u.user_id = s.user_id
    WHERE ${conditions.join('\n      AND ')}
    ORDER BY s.approved_at DESC, s.submission_id DESC
  `, values);
}

async function findPublicInterviews(filters) {
  const conditions = ["s.submission_type = 'INTERVIEW'", "s.submission_status = 'APPROVED'"];
  const values = [];
  const bind = addSharedFilters(filters, conditions, values, { company: 'c', detail: 'ie' });
  if (filters.difficultyLevel) {
    conditions.push(`ie.difficulty_level = ${bind(filters.difficultyLevel)}`);
  }
  if (filters.interviewMode) {
    conditions.push(`ie.interview_mode = ${bind(filters.interviewMode)}`);
  }
  return executeQuery(`
    SELECT s.submission_id AS "submissionId", c.company_id AS "companyId",
      c.company_name AS "companyName", c.headquarters_city AS "headquartersCity",
      c.country, ie.role_id AS "roleId", jr.role_name AS "roleName",
      ie.interview_date AS "interviewDate", ie.difficulty_level AS "difficultyLevel",
      ie.rounds_count AS "roundsCount", ie.interview_mode AS "interviewMode",
      ie.result_status AS "resultStatus", ie.duration_days AS "durationDays",
      ie.process_description AS "processDescription", ie.questions_summary AS "questionsSummary",
      s.verification_status AS "verificationStatus", s.approved_at AS "approvedAt",
      CASE WHEN s.is_anonymous = 0 THEN u.full_name ELSE NULL END AS "authorName"
    FROM submissions s
    JOIN interview_experiences ie ON ie.submission_id = s.submission_id
    JOIN companies c ON c.company_id = s.company_id
    JOIN job_roles jr ON jr.role_id = ie.role_id
    JOIN users u ON u.user_id = s.user_id
    WHERE ${conditions.join('\n      AND ')}
    ORDER BY s.approved_at DESC, s.submission_id DESC
  `, values);
}

module.exports = { findPublicSalaryInsights, findPublicReviews, findPublicInterviews };
