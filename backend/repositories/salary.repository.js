const database = require('../config/database');

function createRepositoryError(code, message) {
  const error = new Error(message);
  error.sapleCode = code;
  return error;
}

async function createSalarySubmission(input) {
  const {
    userId, companyId, roleId, baseSalary, additionalCompensation, currency,
    payPeriod, yearsOfExperience, employmentType, workMode, salaryYear, isAnonymous
  } = input;
  const client = await database.getClient();

  try {
    await client.query('BEGIN');
    const verificationResult = await client.query(`
      SELECT ev.verification_id AS "verificationId"
      FROM users u
      JOIN employees e ON e.user_id = u.user_id
      JOIN employment_verifications ev ON ev.employee_id = e.employee_id
      WHERE u.user_id = $1
        AND u.user_type = 'EMPLOYEE'
        AND u.account_status = 'ACTIVE'
        AND ev.company_id = $2
        AND ev.role_id = $3
        AND ev.verification_status = 'VERIFIED'
        AND (ev.expires_at IS NULL OR ev.expires_at > CURRENT_TIMESTAMP)
      LIMIT 1
      FOR UPDATE OF ev
    `, [userId, companyId, roleId]);

    if (!verificationResult.rows[0]) {
      throw createRepositoryError(
        'VERIFICATION_REQUIRED',
        'Employee verification is required for this company and designation'
      );
    }

    const companyResult = await client.query(
      'SELECT company_id AS "companyId" FROM companies WHERE company_id = $1',
      [companyId]
    );
    if (!companyResult.rows[0]) throw createRepositoryError('COMPANY_NOT_FOUND', 'Company not found');

    const roleResult = await client.query(
      'SELECT role_id AS "roleId" FROM job_roles WHERE role_id = $1',
      [roleId]
    );
    if (!roleResult.rows[0]) throw createRepositoryError('ROLE_NOT_FOUND', 'Job role not found');

    const verificationStatus = 'VERIFIED';
    const parentResult = await client.query(`
      INSERT INTO submissions (
        user_id, company_id, submission_type, is_anonymous,
        submission_status, verification_status
      ) VALUES ($1, $2, 'SALARY', $3, 'PENDING', $4)
      RETURNING submission_id AS "submissionId"
    `, [userId, companyId, isAnonymous ? 1 : 0, verificationStatus]);
    const submissionId = parentResult.rows[0].submissionId;

    await client.query(`
      INSERT INTO salary_submissions (
        submission_id, role_id, base_salary, additional_compensation, currency,
        pay_period, years_of_experience, employment_type, work_mode, salary_year
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      submissionId, roleId, baseSalary, additionalCompensation, currency,
      payPeriod, yearsOfExperience, employmentType, workMode, salaryYear
    ]);

    await client.query('COMMIT');
    return { submissionId, submissionStatus: 'PENDING', verificationStatus };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { createSalarySubmission };
