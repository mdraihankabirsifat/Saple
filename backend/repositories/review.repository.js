const oracledb = require('oracledb');
const database = require('../config/database');

function repositoryError(code, message) {
  const error = new Error(message);
  error.sapleCode = code;
  return error;
}

async function createReview({
  userId, companyId, roleId, reviewTitle, overallRating, workLifeBalanceRating,
  careerGrowthRating, managementRating, cultureRating, pros, cons,
  adviceToManagement, employmentStatus, reviewDate, isAnonymous
}) {
  let connection;
  try {
    connection = await database.getConnection();
    const employeeResult = await connection.execute(
      `SELECT e.employee_id AS "employeeId", e.employment_status AS "employmentStatus"
       FROM users u JOIN employees e ON e.user_id = u.user_id
       WHERE u.user_id = :userId AND u.user_type = 'EMPLOYEE' AND u.account_status = 'ACTIVE'`,
      { userId }
    );
    const employee = employeeResult.rows[0];
    if (!employee) throw repositoryError('EMPLOYEE_REQUIRED', 'An active employee account is required to submit reviews');
    if (employee.employmentStatus !== employmentStatus) throw repositoryError('EMPLOYMENT_STATUS_MISMATCH', 'Employment status does not match the employee profile');

    const companyResult = await connection.execute(`SELECT company_id AS "companyId" FROM companies WHERE company_id = :companyId`, { companyId });
    if (!companyResult.rows[0]) throw repositoryError('COMPANY_NOT_FOUND', 'Company not found');
    if (roleId !== null) {
      const roleResult = await connection.execute(`SELECT role_id AS "roleId" FROM job_roles WHERE role_id = :roleId`, { roleId });
      if (!roleResult.rows[0]) throw repositoryError('ROLE_NOT_FOUND', 'Job role not found');
    }

    const verificationResult = await connection.execute(
      `SELECT verification_id AS "verificationId" FROM employment_verifications
       WHERE employee_id = :employeeId AND company_id = :companyId
         AND verification_status = 'VERIFIED'
         AND (expires_at IS NULL OR expires_at > SYSTIMESTAMP)
       FETCH FIRST 1 ROW ONLY`,
      { employeeId: employee.employeeId, companyId }
    );
    const verificationStatus = verificationResult.rows[0] ? 'VERIFIED' : 'UNVERIFIED';
    const parent = await connection.execute(
      `INSERT INTO submissions (
         user_id, company_id, submission_type, is_anonymous, submission_status, verification_status
       ) VALUES (
         :userId, :companyId, 'REVIEW', :isAnonymous, 'PENDING', :verificationStatus
       ) RETURNING submission_id INTO :submissionId`,
      {
        userId, companyId, isAnonymous: isAnonymous ? 1 : 0, verificationStatus,
        submissionId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      }
    );
    const submissionId = parent.outBinds.submissionId[0];
    await connection.execute(
      `INSERT INTO company_reviews (
         submission_id, role_id, review_title, overall_rating,
         work_life_balance_rating, career_growth_rating, management_rating,
         culture_rating, pros, cons, advice_to_management, employment_status, review_date
       ) VALUES (
         :submissionId, :roleId, :reviewTitle, :overallRating,
         :workLifeBalanceRating, :careerGrowthRating, :managementRating,
         :cultureRating, :pros, :cons, :adviceToManagement, :employmentStatus, :reviewDate
       )`,
      {
        submissionId, roleId, reviewTitle, overallRating, workLifeBalanceRating,
        careerGrowthRating, managementRating, cultureRating, pros, cons,
        adviceToManagement, employmentStatus, reviewDate
      }
    );
    await connection.commit();
    return { submissionId, submissionStatus: 'PENDING', verificationStatus };
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) await connection.close();
  }
}

async function findApprovedReviews(companyId) {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT s.submission_id AS "submissionId", cr.role_id AS "roleId",
         jr.role_name AS "roleName", cr.review_title AS "reviewTitle",
         cr.overall_rating AS "overallRating", cr.work_life_balance_rating AS "workLifeBalanceRating",
         cr.career_growth_rating AS "careerGrowthRating", cr.management_rating AS "managementRating",
         cr.culture_rating AS "cultureRating", cr.pros AS "pros", cr.cons AS "cons",
         cr.advice_to_management AS "adviceToManagement", cr.employment_status AS "employmentStatus",
         cr.review_date AS "reviewDate", s.verification_status AS "verificationStatus",
         s.submitted_at AS "submittedAt", s.approved_at AS "approvedAt", s.is_anonymous AS "isAnonymous",
         CASE WHEN s.is_anonymous = 0 THEN u.full_name ELSE NULL END AS "authorName"
       FROM submissions s
       JOIN company_reviews cr ON cr.submission_id = s.submission_id
       LEFT JOIN job_roles jr ON jr.role_id = cr.role_id
       JOIN users u ON u.user_id = s.user_id
       WHERE s.company_id = :companyId AND s.submission_type = 'REVIEW'
         AND s.submission_status = 'APPROVED'
       ORDER BY s.approved_at DESC, s.submission_id DESC`,
      { companyId }
    );
    const summary = await connection.execute(
      `SELECT COUNT(*) AS "reviewCount", ROUND(AVG(cr.overall_rating), 2) AS "overallAverage",
         ROUND(AVG(cr.work_life_balance_rating), 2) AS "workLifeBalanceAverage",
         ROUND(AVG(cr.career_growth_rating), 2) AS "careerGrowthAverage",
         ROUND(AVG(cr.management_rating), 2) AS "managementAverage",
         ROUND(AVG(cr.culture_rating), 2) AS "cultureAverage"
       FROM submissions s JOIN company_reviews cr ON cr.submission_id = s.submission_id
       WHERE s.company_id = :companyId AND s.submission_status = 'APPROVED'`,
      { companyId }
    );
    return { reviews: result.rows, summary: summary.rows[0] };
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { createReview, findApprovedReviews };
