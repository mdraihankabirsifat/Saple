const database = require('../config/database');

async function executeQuery(sql, values = []) {
  const result = await database.query(sql, values);
  return result.rows;
}

async function findAllCompanies(filters) {
  const conditions = [];
  const values = [];
  const bind = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (filters.search) {
    const placeholder = bind(`%${filters.search.toUpperCase()}%`);
    conditions.push(`(
      UPPER(c.company_name) LIKE ${placeholder}
      OR UPPER(c.industry) LIKE ${placeholder}
      OR UPPER(c.headquarters_city) LIKE ${placeholder}
      OR UPPER(c.country) LIKE ${placeholder}
    )`);
  }
  if (filters.industry) {
    conditions.push(`UPPER(c.industry) = ${bind(filters.industry.toUpperCase())}`);
  }
  if (filters.location) {
    const placeholder = bind(`%${filters.location.toUpperCase()}%`);
    conditions.push(`(
      UPPER(c.headquarters_city) LIKE ${placeholder}
      OR UPPER(c.country) LIKE ${placeholder}
      OR UPPER(c.headquarters_city || ', ' || c.country) LIKE ${placeholder}
    )`);
  }
  if (filters.companySize) {
    conditions.push(`UPPER(c.company_size) = ${bind(filters.companySize.toUpperCase())}`);
  }
  if (filters.roleId !== null) {
    const placeholder = bind(filters.roleId);
    conditions.push(`EXISTS (
      SELECT 1
      FROM submissions role_submission
      LEFT JOIN salary_submissions role_salary
        ON role_salary.submission_id = role_submission.submission_id
      LEFT JOIN company_reviews role_review
        ON role_review.submission_id = role_submission.submission_id
      LEFT JOIN interview_experiences role_interview
        ON role_interview.submission_id = role_submission.submission_id
      WHERE role_submission.company_id = c.company_id
        AND role_submission.submission_status = 'APPROVED'
        AND (
          role_salary.role_id = ${placeholder}
          OR role_review.role_id = ${placeholder}
          OR role_interview.role_id = ${placeholder}
        )
    )`);
  }
  if (filters.minSalary !== null || filters.maxSalary !== null || filters.hasSalaryData) {
    const salaryConditions = [
      'salary_submission.company_id = c.company_id',
      "salary_submission.submission_status = 'APPROVED'"
    ];
    if (filters.salarySource === 'VERIFIED') {
      salaryConditions.push("salary_submission.verification_status = 'VERIFIED'");
    }
    if (filters.minSalary !== null) {
      salaryConditions.push(`salary_detail.base_salary >= ${bind(filters.minSalary)}`);
    }
    if (filters.maxSalary !== null) {
      salaryConditions.push(`salary_detail.base_salary <= ${bind(filters.maxSalary)}`);
    }
    conditions.push(`EXISTS (
      SELECT 1
      FROM submissions salary_submission
      JOIN salary_submissions salary_detail
        ON salary_detail.submission_id = salary_submission.submission_id
      WHERE ${salaryConditions.join('\n        AND ')}
    )`);
  }
  if (filters.minRating !== null) {
    conditions.push(`COALESCE(review_stats.average_rating, 0) >= ${bind(filters.minRating)}`);
  }
  if (filters.hasReviews) conditions.push('COALESCE(review_stats.review_count, 0) > 0');
  if (filters.hasInterviews) conditions.push('COALESCE(interview_stats.interview_count, 0) > 0');

  return executeQuery(`
    WITH review_stats AS (
      SELECT s.company_id, COUNT(*)::INTEGER AS review_count,
        ROUND(AVG(cr.overall_rating), 1) AS average_rating
      FROM submissions s
      JOIN company_reviews cr ON cr.submission_id = s.submission_id
      WHERE s.submission_status = 'APPROVED'
      GROUP BY s.company_id
    ),
    interview_stats AS (
      SELECT s.company_id, COUNT(*)::INTEGER AS interview_count
      FROM submissions s
      JOIN interview_experiences ie ON ie.submission_id = s.submission_id
      WHERE s.submission_status = 'APPROVED'
      GROUP BY s.company_id
    ),
    salary_stats AS (
      SELECT s.company_id, COUNT(*)::INTEGER AS community_salary_count,
        MIN(ss.base_salary) AS community_min_salary,
        MAX(ss.base_salary) AS community_max_salary,
        COUNT(*) FILTER (WHERE s.verification_status = 'VERIFIED')::INTEGER
          AS verified_salary_count,
        MIN(ss.base_salary) FILTER (WHERE s.verification_status = 'VERIFIED')
          AS verified_min_salary,
        MAX(ss.base_salary) FILTER (WHERE s.verification_status = 'VERIFIED')
          AS verified_max_salary
      FROM submissions s
      JOIN salary_submissions ss ON ss.submission_id = s.submission_id
      WHERE s.submission_status = 'APPROVED'
      GROUP BY s.company_id
    )
    SELECT c.company_id AS "companyId", c.company_name AS "companyName",
      c.industry, c.headquarters_city AS "headquartersCity", c.country,
      c.website, c.company_size AS "companySize", c.description,
      c.created_at AS "createdAt",
      COALESCE(review_stats.review_count, 0) AS "reviewCount",
      review_stats.average_rating AS "averageRating",
      COALESCE(interview_stats.interview_count, 0) AS "interviewCount",
      COALESCE(salary_stats.community_salary_count, 0) AS "communitySalaryCount",
      salary_stats.community_min_salary AS "communityMinimumSalary",
      salary_stats.community_max_salary AS "communityMaximumSalary",
      COALESCE(salary_stats.verified_salary_count, 0) AS "verifiedSalaryCount",
      salary_stats.verified_min_salary AS "verifiedMinimumSalary",
      salary_stats.verified_max_salary AS "verifiedMaximumSalary"
    FROM companies c
    LEFT JOIN review_stats ON review_stats.company_id = c.company_id
    LEFT JOIN interview_stats ON interview_stats.company_id = c.company_id
    LEFT JOIN salary_stats ON salary_stats.company_id = c.company_id
    ${conditions.length ? `WHERE ${conditions.join('\n      AND ')}` : ''}
    ORDER BY c.company_name
  `, values);
}

async function findCompanyFilterOptions() {
  const [industries, locations, companySizes] = await Promise.all([
    executeQuery('SELECT DISTINCT industry AS "value" FROM companies ORDER BY industry'),
    executeQuery(`SELECT DISTINCT headquarters_city || ', ' || country AS "value"
      FROM companies ORDER BY "value"`),
    executeQuery(`SELECT DISTINCT company_size AS "value" FROM companies
      WHERE company_size IS NOT NULL ORDER BY company_size`)
  ]);
  return {
    industries: industries.map((item) => item.value),
    locations: locations.map((item) => item.value),
    companySizes: companySizes.map((item) => item.value)
  };
}

async function findCompanyById(companyId) {
  const rows = await executeQuery(`
    SELECT c.company_id AS "companyId", c.company_name AS "companyName",
      c.industry, c.headquarters_city AS "headquartersCity", c.country,
      c.website, c.company_size AS "companySize", c.description,
      c.created_at AS "createdAt", COALESCE(review_stats.review_count, 0) AS "reviewCount",
      review_stats.average_rating AS "averageRating"
    FROM companies c
    LEFT JOIN (
      SELECT s.company_id, COUNT(*)::INTEGER AS review_count,
        ROUND(AVG(cr.overall_rating), 1) AS average_rating
      FROM submissions s
      JOIN company_reviews cr ON cr.submission_id = s.submission_id
      WHERE s.submission_status = 'APPROVED'
      GROUP BY s.company_id
    ) review_stats ON review_stats.company_id = c.company_id
    WHERE c.company_id = $1
  `, [companyId]);
  return rows[0] || null;
}

async function findBenefitsByCompanyId(companyId) {
  return executeQuery(`
    SELECT b.benefit_id AS "benefitId", b.benefit_name AS "benefitName",
      b.benefit_category AS "benefitCategory", b.description, cb.details,
      cb.eligibility, cb.last_updated AS "lastUpdated"
    FROM company_benefits cb
    JOIN benefits b ON b.benefit_id = cb.benefit_id
    WHERE cb.company_id = $1
    ORDER BY b.benefit_name
  `, [companyId]);
}

const SALARY_SUMMARY_VIEWS = Object.freeze({
  VERIFIED: 'vw_verified_salary_summary',
  COMMUNITY: 'vw_community_salary_summary'
});

async function findSalarySummary(source, companyId) {
  const viewName = SALARY_SUMMARY_VIEWS[source];
  if (!viewName) {
    throw new Error('Unsupported salary summary source');
  }

  return executeQuery(`
    SELECT role_id AS "roleId", role_name AS "roleName", currency,
      pay_period AS "payPeriod", minimum_salary AS "minimumSalary",
      maximum_salary AS "maximumSalary", average_salary AS "averageSalary",
      contribution_count::INTEGER AS "contributionCount"
    FROM ${viewName}
    WHERE company_id = $1
    ORDER BY role_name, currency, pay_period
  `, [companyId]);
}

const findVerifiedSalarySummary = (companyId) =>
  findSalarySummary('VERIFIED', companyId);
const findCommunitySalarySummary = (companyId) =>
  findSalarySummary('COMMUNITY', companyId);

module.exports = {
  findAllCompanies, findCompanyFilterOptions, findCompanyById, findBenefitsByCompanyId,
  findVerifiedSalarySummary, findCommunitySalarySummary
};
