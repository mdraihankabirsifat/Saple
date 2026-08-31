const database = require('../config/database');

function repositoryError(code, message) {
  const error = new Error(message);
  error.sapleCode = code;
  return error;
}

async function createReview(input) {
  const {
    userId, companyId, roleId, reviewTitle, overallRating, workLifeBalanceRating,
    careerGrowthRating, managementRating, cultureRating, pros, cons,
    adviceToManagement, employmentStatus, reviewDate, isAnonymous
  } = input;
  const client = await database.getClient();

  try {
    await client.query('BEGIN');
    const employeeResult = await client.query(`
      SELECT e.employee_id AS "employeeId", e.employment_status AS "employmentStatus"
      FROM users u JOIN employees e ON e.user_id = u.user_id
      WHERE u.user_id = $1 AND u.user_type = 'EMPLOYEE' AND u.account_status = 'ACTIVE'
    `, [userId]);
    const employee = employeeResult.rows[0];
    if (!employee) {
      throw repositoryError('EMPLOYEE_REQUIRED', 'An active employee account is required to submit reviews');
    }
    if (employee.employmentStatus !== employmentStatus) {
      throw repositoryError('EMPLOYMENT_STATUS_MISMATCH', 'Employment status does not match the employee profile');
    }

    const companyResult = await client.query(
      'SELECT company_id AS "companyId" FROM companies WHERE company_id = $1',
      [companyId]
    );
    if (!companyResult.rows[0]) throw repositoryError('COMPANY_NOT_FOUND', 'Company not found');
    const roleResult = await client.query(
      'SELECT role_id AS "roleId" FROM job_roles WHERE role_id = $1',
      [roleId]
    );
    if (!roleResult.rows[0]) throw repositoryError('ROLE_NOT_FOUND', 'Job role not found');

    const verificationResult = await client.query(`
      SELECT ev.verification_id AS "verificationId"
      FROM employment_verifications ev
      WHERE ev.employee_id = $1 AND ev.company_id = $2 AND ev.role_id = $3
        AND ev.verification_status = 'VERIFIED'
        AND (ev.expires_at IS NULL OR ev.expires_at > CURRENT_TIMESTAMP)
      LIMIT 1
      FOR UPDATE OF ev
    `, [employee.employeeId, companyId, roleId]);
    if (!verificationResult.rows[0]) {
      throw repositoryError(
        'VERIFICATION_REQUIRED',
        'Employee verification is required for this company and designation'
      );
    }

    const parent = await client.query(`
      INSERT INTO submissions (
        user_id, company_id, submission_type, is_anonymous,
        submission_status, verification_status
      ) VALUES ($1, $2, 'REVIEW', $3, 'PENDING', 'VERIFIED')
      RETURNING submission_id AS "submissionId"
    `, [userId, companyId, isAnonymous ? 1 : 0]);
    const submissionId = parent.rows[0].submissionId;

    await client.query(`
      INSERT INTO company_reviews (
        submission_id, role_id, review_title, overall_rating,
        work_life_balance_rating, career_growth_rating, management_rating,
        culture_rating, pros, cons, advice_to_management, employment_status, review_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      submissionId, roleId, reviewTitle, overallRating, workLifeBalanceRating,
      careerGrowthRating, managementRating, cultureRating, pros, cons,
      adviceToManagement, employmentStatus, reviewDate
    ]);

    await client.query('COMMIT');
    return { submissionId, submissionStatus: 'PENDING', verificationStatus: 'VERIFIED' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function findApprovedReviews(companyId) {
  const [result, summary] = await Promise.all([
    database.query(`
      SELECT s.submission_id AS "submissionId", cr.role_id AS "roleId",
        jr.role_name AS "roleName", cr.review_title AS "reviewTitle",
        cr.overall_rating AS "overallRating",
        cr.work_life_balance_rating AS "workLifeBalanceRating",
        cr.career_growth_rating AS "careerGrowthRating",
        cr.management_rating AS "managementRating", cr.culture_rating AS "cultureRating",
        cr.pros, cr.cons, cr.advice_to_management AS "adviceToManagement",
        cr.employment_status AS "employmentStatus", cr.review_date AS "reviewDate",
        s.verification_status AS "verificationStatus", s.submitted_at AS "submittedAt",
        s.approved_at AS "approvedAt", s.is_anonymous AS "isAnonymous",
        CASE WHEN s.is_anonymous = 0 THEN u.full_name ELSE NULL END AS "authorName"
      FROM submissions s
      JOIN company_reviews cr ON cr.submission_id = s.submission_id
      LEFT JOIN job_roles jr ON jr.role_id = cr.role_id
      JOIN users u ON u.user_id = s.user_id
      WHERE s.company_id = $1 AND s.submission_type = 'REVIEW'
        AND s.submission_status = 'APPROVED'
      ORDER BY s.approved_at DESC, s.submission_id DESC
    `, [companyId]),
    database.query(`
      SELECT COUNT(*)::INTEGER AS "reviewCount",
        ROUND(AVG(cr.overall_rating), 2) AS "overallAverage",
        ROUND(AVG(cr.work_life_balance_rating), 2) AS "workLifeBalanceAverage",
        ROUND(AVG(cr.career_growth_rating), 2) AS "careerGrowthAverage",
        ROUND(AVG(cr.management_rating), 2) AS "managementAverage",
        ROUND(AVG(cr.culture_rating), 2) AS "cultureAverage"
      FROM submissions s JOIN company_reviews cr ON cr.submission_id = s.submission_id
      WHERE s.company_id = $1 AND s.submission_status = 'APPROVED'
    `, [companyId])
  ]);
  return { reviews: result.rows, summary: summary.rows[0] };
}

module.exports = { createReview, findApprovedReviews };
