const database = require('../config/database');

async function executeQuery(sql, binds = {}) {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(sql, binds);
    return result.rows;
  } finally {
    if (connection) await connection.close();
  }
}

function addSharedFilters(filters, conditions, binds, aliases) {
  if (filters.companyId !== null) {
    conditions.push(`${aliases.company}.company_id = :companyId`);
    binds.companyId = filters.companyId;
  }
  if (filters.roleId !== null) {
    conditions.push(`${aliases.detail}.role_id = :roleId`);
    binds.roleId = filters.roleId;
  }
  if (filters.location) {
    conditions.push(`(
      UPPER(${aliases.company}.headquarters_city) LIKE :locationPattern
      OR UPPER(${aliases.company}.country) LIKE :locationPattern
    )`);
    binds.locationPattern = `%${filters.location.toUpperCase()}%`;
  }
}

async function findPublicSalaryInsights(filters) {
  const conditions = ["s.submission_status = 'APPROVED'"];
  const having = [];
  const binds = {};
  addSharedFilters(filters, conditions, binds, { company: 'c', detail: 'ss' });

  const selectedMinimum = filters.salarySource === 'VERIFIED'
    ? "MIN(CASE WHEN s.verification_status = 'VERIFIED' THEN ss.base_salary END)"
    : 'MIN(ss.base_salary)';
  const selectedMaximum = filters.salarySource === 'VERIFIED'
    ? "MAX(CASE WHEN s.verification_status = 'VERIFIED' THEN ss.base_salary END)"
    : 'MAX(ss.base_salary)';

  if (filters.salarySource === 'VERIFIED') {
    having.push("COUNT(CASE WHEN s.verification_status = 'VERIFIED' THEN 1 END) > 0");
  }
  if (filters.minSalary !== null) {
    having.push(`${selectedMaximum} >= :minSalary`);
    binds.minSalary = filters.minSalary;
  }
  if (filters.maxSalary !== null) {
    having.push(`${selectedMinimum} <= :maxSalary`);
    binds.maxSalary = filters.maxSalary;
  }

  return executeQuery(`
    SELECT c.company_id AS "companyId", c.company_name AS "companyName",
      c.headquarters_city AS "headquartersCity", c.country AS "country",
      jr.role_id AS "roleId", jr.role_name AS "roleName",
      ss.currency AS "currency", ss.pay_period AS "payPeriod",
      MIN(ss.base_salary) AS "communityMinimumSalary",
      MAX(ss.base_salary) AS "communityMaximumSalary",
      ROUND(AVG(ss.base_salary), 2) AS "communityAverageSalary",
      COUNT(*) AS "communityContributionCount",
      MIN(CASE WHEN s.verification_status = 'VERIFIED' THEN ss.base_salary END)
        AS "verifiedMinimumSalary",
      MAX(CASE WHEN s.verification_status = 'VERIFIED' THEN ss.base_salary END)
        AS "verifiedMaximumSalary",
      ROUND(AVG(CASE WHEN s.verification_status = 'VERIFIED' THEN ss.base_salary END), 2)
        AS "verifiedAverageSalary",
      COUNT(CASE WHEN s.verification_status = 'VERIFIED' THEN 1 END)
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
  `, binds);
}

async function findPublicReviews(filters) {
  const conditions = [
    "s.submission_type = 'REVIEW'",
    "s.submission_status = 'APPROVED'"
  ];
  const binds = {};
  addSharedFilters(filters, conditions, binds, { company: 'c', detail: 'cr' });
  if (filters.minRating !== null) {
    conditions.push('cr.overall_rating >= :minRating');
    binds.minRating = filters.minRating;
  }

  return executeQuery(`
    SELECT s.submission_id AS "submissionId", c.company_id AS "companyId",
      c.company_name AS "companyName", c.headquarters_city AS "headquartersCity",
      c.country AS "country", cr.role_id AS "roleId", jr.role_name AS "roleName",
      cr.review_title AS "reviewTitle", cr.overall_rating AS "overallRating",
      cr.work_life_balance_rating AS "workLifeBalanceRating",
      cr.career_growth_rating AS "careerGrowthRating",
      cr.management_rating AS "managementRating", cr.culture_rating AS "cultureRating",
      cr.pros AS "pros", cr.cons AS "cons", cr.advice_to_management AS "adviceToManagement",
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
  `, binds);
}

async function findPublicInterviews(filters) {
  const conditions = [
    "s.submission_type = 'INTERVIEW'",
    "s.submission_status = 'APPROVED'"
  ];
  const binds = {};
  addSharedFilters(filters, conditions, binds, { company: 'c', detail: 'ie' });
  if (filters.difficultyLevel) {
    conditions.push('ie.difficulty_level = :difficultyLevel');
    binds.difficultyLevel = filters.difficultyLevel;
  }
  if (filters.interviewMode) {
    conditions.push('ie.interview_mode = :interviewMode');
    binds.interviewMode = filters.interviewMode;
  }

  return executeQuery(`
    SELECT s.submission_id AS "submissionId", c.company_id AS "companyId",
      c.company_name AS "companyName", c.headquarters_city AS "headquartersCity",
      c.country AS "country", ie.role_id AS "roleId", jr.role_name AS "roleName",
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
  `, binds);
}

module.exports = {
  findPublicSalaryInsights,
  findPublicReviews,
  findPublicInterviews
};
