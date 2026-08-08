const oracledb = require('oracledb');
const database = require('../config/database');

function createRepositoryError(code, message) {
  const error = new Error(message);
  error.sapleCode = code;
  return error;
}

async function createSalarySubmission({
  userId,
  companyId,
  roleId,
  baseSalary,
  additionalCompensation,
  currency,
  payPeriod,
  yearsOfExperience,
  employmentType,
  workMode,
  salaryYear,
  isAnonymous
}) {
  let connection;

  try {
    connection = await database.getConnection();

    const verificationResult = await connection.execute(
      `
        SELECT
          ev.verification_id AS "verificationId"
        FROM users u
        JOIN employees e ON e.user_id = u.user_id
        JOIN employment_verifications ev ON ev.employee_id = e.employee_id
        WHERE u.user_id = :userId
          AND u.user_type = 'EMPLOYEE'
          AND u.account_status = 'ACTIVE'
          AND ev.company_id = :companyId
          AND ev.role_id = :roleId
          AND ev.verification_status = 'VERIFIED'
          AND (ev.expires_at IS NULL OR ev.expires_at > SYSTIMESTAMP)
        FETCH FIRST 1 ROW ONLY
      `,
      { userId, companyId, roleId }
    );

    if (!verificationResult.rows[0]) {
      throw createRepositoryError(
        'VERIFICATION_REQUIRED',
        'Employee verification is required for this company and designation'
      );
    }

    const companyResult = await connection.execute(
      `
        SELECT
          company_id AS "companyId"
        FROM companies
        WHERE company_id = :companyId
      `,
      { companyId }
    );

    if (!companyResult.rows[0]) {
      throw createRepositoryError('COMPANY_NOT_FOUND', 'Company not found');
    }

    const roleResult = await connection.execute(
      `
        SELECT
          role_id AS "roleId"
        FROM job_roles
        WHERE role_id = :roleId
      `,
      { roleId }
    );

    if (!roleResult.rows[0]) {
      throw createRepositoryError('ROLE_NOT_FOUND', 'Job role not found');
    }

    const verificationStatus = 'VERIFIED';

    const parentResult = await connection.execute(
      `
        INSERT INTO submissions (
          user_id,
          company_id,
          submission_type,
          is_anonymous,
          submission_status,
          verification_status
        ) VALUES (
          :userId,
          :companyId,
          'SALARY',
          :isAnonymous,
          'PENDING',
          :verificationStatus
        )
        RETURNING submission_id INTO :submissionId
      `,
      {
        userId,
        companyId,
        isAnonymous: isAnonymous ? 1 : 0,
        verificationStatus,
        submissionId: {
          dir: oracledb.BIND_OUT,
          type: oracledb.NUMBER
        }
      }
    );

    const submissionId = parentResult.outBinds.submissionId[0];

    await connection.execute(
      `
        INSERT INTO salary_submissions (
          submission_id,
          role_id,
          base_salary,
          additional_compensation,
          currency,
          pay_period,
          years_of_experience,
          employment_type,
          work_mode,
          salary_year
        ) VALUES (
          :submissionId,
          :roleId,
          :baseSalary,
          :additionalCompensation,
          :currency,
          :payPeriod,
          :yearsOfExperience,
          :employmentType,
          :workMode,
          :salaryYear
        )
      `,
      {
        submissionId,
        roleId,
        baseSalary,
        additionalCompensation,
        currency,
        payPeriod,
        yearsOfExperience,
        employmentType,
        workMode,
        salaryYear
      }
    );

    await connection.commit();

    return {
      submissionId,
      submissionStatus: 'PENDING',
      verificationStatus
    };
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    throw error;
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

module.exports = {
  createSalarySubmission
};
