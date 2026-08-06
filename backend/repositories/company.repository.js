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

async function findAllCompanies(search) {
  const baseSql = `
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
  `;

  if (!search) {
    return executeQuery(`${baseSql} ORDER BY company_name`);
  }

  const searchSql = `
    ${baseSql}
    WHERE UPPER(company_name) LIKE :searchPattern
       OR UPPER(industry) LIKE :searchPattern
       OR UPPER(headquarters_city) LIKE :searchPattern
       OR UPPER(country) LIKE :searchPattern
    ORDER BY company_name
  `;

  return executeQuery(searchSql, {
    searchPattern: `%${search.toUpperCase()}%`
  });
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
  findCompanyById,
  findBenefitsByCompanyId,
  findVerifiedSalarySummary,
  findCommunitySalarySummary
};
