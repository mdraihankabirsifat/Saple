const database = require('../config/database');

async function executeQuery(sql, binds = {}) {
  let connection;

  try {
    connection = await database.getConnection();
    const result = await connection.execute(sql, binds);
    return result.rows;
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

async function findAllCompanies(filters) {
  const conditions = [];
  const binds = {};

  if (filters.search) {
    conditions.push(`(
      UPPER(c.company_name) LIKE :searchPattern
      OR UPPER(c.industry) LIKE :searchPattern
      OR UPPER(c.headquarters_city) LIKE :searchPattern
      OR UPPER(c.country) LIKE :searchPattern
    )`);
    binds.searchPattern = `%${filters.search.toUpperCase()}%`;
  }
  if (filters.industry) {
    conditions.push('UPPER(c.industry) = :industry');
    binds.industry = filters.industry.toUpperCase();
  }
  if (filters.location) {
    conditions.push(`(
      UPPER(c.headquarters_city) LIKE :locationPattern
      OR UPPER(c.country) LIKE :locationPattern
    )`);
    binds.locationPattern = `%${filters.location.toUpperCase()}%`;
  }
  if (filters.companySize) {
    conditions.push('UPPER(c.company_size) = :companySize');
    binds.companySize = filters.companySize.toUpperCase();
  }
  if (filters.roleId !== null) {
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
          role_salary.role_id = :roleId
          OR role_review.role_id = :roleId
          OR role_interview.role_id = :roleId
        )
    )`);
    binds.roleId = filters.roleId;
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
      salaryConditions.push('salary_detail.base_salary >= :minSalary');
      binds.minSalary = filters.minSalary;
    }
    if (filters.maxSalary !== null) {
      salaryConditions.push('salary_detail.base_salary <= :maxSalary');
      binds.maxSalary = filters.maxSalary;
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
    conditions.push('NVL(review_stats.average_rating, 0) >= :minRating');
    binds.minRating = filters.minRating;
  }
  if (filters.hasReviews) conditions.push('NVL(review_stats.review_count, 0) > 0');
  if (filters.hasInterviews) conditions.push('NVL(interview_stats.interview_count, 0) > 0');

  const sql = `
    WITH review_stats AS (
      SELECT s.company_id, COUNT(*) AS review_count,
        ROUND(AVG(cr.overall_rating), 2) AS average_rating
      FROM submissions s
      JOIN company_reviews cr ON cr.submission_id = s.submission_id
      WHERE s.submission_status = 'APPROVED'
      GROUP BY s.company_id
    ),
    interview_stats AS (
      SELECT s.company_id, COUNT(*) AS interview_count
      FROM submissions s
      JOIN interview_experiences ie ON ie.submission_id = s.submission_id
      WHERE s.submission_status = 'APPROVED'
      GROUP BY s.company_id
    ),
    salary_stats AS (
      SELECT s.company_id,
        COUNT(*) AS community_salary_count,
        MIN(ss.base_salary) AS community_min_salary,
        MAX(ss.base_salary) AS community_max_salary,
        COUNT(CASE WHEN s.verification_status = 'VERIFIED' THEN 1 END) AS verified_salary_count,
        MIN(CASE WHEN s.verification_status = 'VERIFIED' THEN ss.base_salary END) AS verified_min_salary,
        MAX(CASE WHEN s.verification_status = 'VERIFIED' THEN ss.base_salary END) AS verified_max_salary
      FROM submissions s
      JOIN salary_submissions ss ON ss.submission_id = s.submission_id
      WHERE s.submission_status = 'APPROVED'
      GROUP BY s.company_id
    )
    SELECT
      c.company_id AS "companyId",
      c.company_name AS "companyName",
      c.industry AS "industry",
      c.headquarters_city AS "headquartersCity",
      c.country AS "country",
      c.website AS "website",
      c.company_size AS "companySize",
      c.description AS "description",
      c.created_at AS "createdAt",
      NVL(review_stats.review_count, 0) AS "reviewCount",
      review_stats.average_rating AS "averageRating",
      NVL(interview_stats.interview_count, 0) AS "interviewCount",
      NVL(salary_stats.community_salary_count, 0) AS "communitySalaryCount",
      salary_stats.community_min_salary AS "communityMinimumSalary",
      salary_stats.community_max_salary AS "communityMaximumSalary",
      NVL(salary_stats.verified_salary_count, 0) AS "verifiedSalaryCount",
      salary_stats.verified_min_salary AS "verifiedMinimumSalary",
      salary_stats.verified_max_salary AS "verifiedMaximumSalary"
    FROM companies c
    LEFT JOIN review_stats ON review_stats.company_id = c.company_id
    LEFT JOIN interview_stats ON interview_stats.company_id = c.company_id
    LEFT JOIN salary_stats ON salary_stats.company_id = c.company_id
    ${conditions.length ? `WHERE ${conditions.join('\n      AND ')}` : ''}
    ORDER BY c.company_name
  `;
  return executeQuery(sql, binds);
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
  const sql = `
    SELECT
      company_id AS "companyId",
      company_name AS "companyName",
      industry AS "industry",
      headquarters_city AS "headquartersCity",
      country AS "country",
      website AS "website",
      company_size AS "companySize",
      description AS "description",
      created_at AS "createdAt"
    FROM companies
    WHERE company_id = :companyId
  `;

  const rows = await executeQuery(sql, { companyId });
  return rows[0] || null;
}

async function findBenefitsByCompanyId(companyId) {
  const sql = `
    SELECT
      b.benefit_id AS "benefitId",
      b.benefit_name AS "benefitName",
      b.benefit_category AS "benefitCategory",
      b.description AS "description",
      cb.details AS "details",
      cb.eligibility AS "eligibility",
      cb.last_updated AS "lastUpdated"
    FROM company_benefits cb
    JOIN benefits b ON b.benefit_id = cb.benefit_id
    WHERE cb.company_id = :companyId
    ORDER BY b.benefit_name
  `;

  return executeQuery(sql, { companyId });
}

async function findVerifiedSalarySummary(companyId) {
  const sql = `
    SELECT
      role_id AS "roleId",
      role_name AS "roleName",
      currency AS "currency",
      pay_period AS "payPeriod",
      minimum_salary AS "minimumSalary",
      maximum_salary AS "maximumSalary",
      average_salary AS "averageSalary",
      contribution_count AS "contributionCount"
    FROM vw_verified_salary_summary
    WHERE company_id = :companyId
    ORDER BY role_name, currency, pay_period
  `;

  return executeQuery(sql, { companyId });
}

async function findCommunitySalarySummary(companyId) {
  const sql = `
    SELECT
      role_id AS "roleId",
      role_name AS "roleName",
      currency AS "currency",
      pay_period AS "payPeriod",
      minimum_salary AS "minimumSalary",
      maximum_salary AS "maximumSalary",
      average_salary AS "averageSalary",
      contribution_count AS "contributionCount"
    FROM vw_community_salary_summary
    WHERE company_id = :companyId
    ORDER BY role_name, currency, pay_period
  `;

  return executeQuery(sql, { companyId });
}

module.exports = {
  findAllCompanies,
  findCompanyFilterOptions,
  findCompanyById,
  findBenefitsByCompanyId,
  findVerifiedSalarySummary,
  findCommunitySalarySummary
};
