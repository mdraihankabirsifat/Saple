const oracledb = require('oracledb');
const database = require('../config/database');

function repositoryError(code, message) { const error = new Error(message); error.sapleCode = code; return error; }

async function createInterview({
  userId, companyId, roleId, interviewDate, difficultyLevel, roundsCount,
  interviewMode, resultStatus, durationDays, processDescription,
  questionsSummary, isAnonymous
}) {
  let connection;
  try {
    connection = await database.getConnection();
    const userResult = await connection.execute(
      `SELECT u.account_status AS "accountStatus", e.employee_id AS "employeeId",
         e.employment_status AS "employmentStatus"
       FROM users u JOIN employees e ON e.user_id = u.user_id
       WHERE u.user_id = :userId AND u.user_type = 'EMPLOYEE'`,
      { userId }
    );
    const user = userResult.rows[0];
    if (!user || user.accountStatus !== 'ACTIVE') throw repositoryError('ACCOUNT_UNAVAILABLE', 'This account cannot submit interview experiences');
    const companyResult = await connection.execute(`SELECT company_id AS "companyId" FROM companies WHERE company_id = :companyId`, { companyId });
    if (!companyResult.rows[0]) throw repositoryError('COMPANY_NOT_FOUND', 'Company not found');
    const roleResult = await connection.execute(`SELECT role_id AS "roleId" FROM job_roles WHERE role_id = :roleId`, { roleId });
    if (!roleResult.rows[0]) throw repositoryError('ROLE_NOT_FOUND', 'Job role not found');

    const verification = await connection.execute(
      `SELECT verification_id AS "verificationId" FROM employment_verifications
       WHERE employee_id = :employeeId AND company_id = :companyId
         AND verification_status = 'VERIFIED'
         AND (expires_at IS NULL OR expires_at > SYSTIMESTAMP)
       FETCH FIRST 1 ROW ONLY`,
      { employeeId: user.employeeId, companyId }
    );
    if (!verification.rows[0]) {
      throw repositoryError('VERIFICATION_REQUIRED', 'Employee verification is required for this company');
    }
    const verificationStatus = 'VERIFIED';

    const parent = await connection.execute(
      `INSERT INTO submissions (
         user_id, company_id, submission_type, is_anonymous, submission_status, verification_status
       ) VALUES (
         :userId, :companyId, 'INTERVIEW', :isAnonymous, 'PENDING', :verificationStatus
       ) RETURNING submission_id INTO :submissionId`,
      {
        userId, companyId, isAnonymous: isAnonymous ? 1 : 0, verificationStatus,
        submissionId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      }
    );
    const submissionId = parent.outBinds.submissionId[0];
    await connection.execute(
      `INSERT INTO interview_experiences (
         submission_id, role_id, interview_date, difficulty_level, rounds_count,
         interview_mode, result_status, duration_days, process_description, questions_summary
       ) VALUES (
         :submissionId, :roleId, :interviewDate, :difficultyLevel, :roundsCount,
         :interviewMode, :resultStatus, :durationDays, :processDescription, :questionsSummary
       )`,
      {
        submissionId, roleId, interviewDate, difficultyLevel, roundsCount,
        interviewMode, resultStatus, durationDays, processDescription, questionsSummary
      }
    );
    await connection.commit();
    return { submissionId, submissionStatus: 'PENDING', verificationStatus };
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally { if (connection) await connection.close(); }
}

async function findApprovedInterviews(companyId) {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT s.submission_id AS "submissionId", ie.role_id AS "roleId", jr.role_name AS "roleName",
         ie.interview_date AS "interviewDate", ie.difficulty_level AS "difficultyLevel",
         ie.rounds_count AS "roundsCount", ie.interview_mode AS "interviewMode",
         ie.result_status AS "resultStatus", ie.duration_days AS "durationDays",
         ie.process_description AS "processDescription", ie.questions_summary AS "questionsSummary",
         s.verification_status AS "verificationStatus", s.submitted_at AS "submittedAt",
         s.approved_at AS "approvedAt", s.is_anonymous AS "isAnonymous",
         CASE WHEN s.is_anonymous = 0 THEN u.full_name ELSE NULL END AS "authorName"
       FROM submissions s
       JOIN interview_experiences ie ON ie.submission_id = s.submission_id
       JOIN job_roles jr ON jr.role_id = ie.role_id
       JOIN users u ON u.user_id = s.user_id
       WHERE s.company_id = :companyId AND s.submission_type = 'INTERVIEW'
         AND s.submission_status = 'APPROVED'
       ORDER BY s.approved_at DESC, s.submission_id DESC`,
      { companyId }
    );
    return result.rows;
  } finally { if (connection) await connection.close(); }
}

module.exports = { createInterview, findApprovedInterviews };
