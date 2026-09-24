const database = require('../config/database');

async function executeSingleRow(sql, values = []) {
  const result = await database.query(sql, values);
  return result.rows[0] || null;
}

async function findUserByEmail(email) {
  return executeSingleRow(`
    SELECT u.user_id AS "userId", u.full_name AS "fullName", u.email,
      u.password_hash AS "passwordHash", u.user_type AS "userType",
      u.account_role AS "accountRole", u.account_status AS "accountStatus",
      u.token_version AS "tokenVersion", e.employment_status AS "employmentStatus"
    FROM users u
    LEFT JOIN employees e ON e.user_id = u.user_id
    WHERE LOWER(u.email) = $1
  `, [email]);
}

async function findUserForPasswordResetByEmail(email) {
  return executeSingleRow(`
    SELECT user_id AS "userId", full_name AS "fullName", email,
      account_status AS "accountStatus"
    FROM users
    WHERE LOWER(email) = $1
  `, [email]);
}

async function findSafeUserById(userId) {
  return executeSingleRow(`
    SELECT u.user_id AS "userId", u.full_name AS "fullName", u.email,
      u.user_type AS "userType", u.account_role AS "accountRole",
      u.account_status AS "accountStatus", e.employment_status AS "employmentStatus",
      u.created_at AS "createdAt"
    FROM users u
    LEFT JOIN employees e ON e.user_id = u.user_id
    WHERE u.user_id = $1
  `, [userId]);
}

async function findAuthorizationById(userId) {
  return executeSingleRow(`
    SELECT account_role AS "accountRole", account_status AS "accountStatus",
      token_version AS "tokenVersion"
    FROM users
    WHERE user_id = $1
  `, [userId]);
}

async function findActiveVerifiedScopesByUserId(userId) {
  const result = await database.query(`
    SELECT DISTINCT c.company_id AS "companyId", c.company_name AS "companyName",
      ev.role_id AS "roleId", jr.role_name AS "roleName", ev.expires_at AS "expiresAt"
    FROM users u
    JOIN employees e ON e.user_id = u.user_id
    JOIN employment_verifications ev ON ev.employee_id = e.employee_id
    JOIN companies c ON c.company_id = ev.company_id
    JOIN job_roles jr ON jr.role_id = ev.role_id
    WHERE u.user_id = $1
      AND u.user_type = 'EMPLOYEE'
      AND u.account_status = 'ACTIVE'
      AND ev.verification_status = 'VERIFIED'
      AND (ev.expires_at IS NULL OR ev.expires_at > CURRENT_TIMESTAMP)
    ORDER BY c.company_name, jr.role_name
  `, [userId]);
  return result.rows;
}

async function updateFullName(userId, fullName) {
  const result = await database.withTransaction((client) => client.query(`
    UPDATE users SET full_name = $1, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $2 AND account_status = 'ACTIVE'
  `, [fullName, userId]));
  return result.rowCount === 1;
}

async function findPasswordHashById(userId) {
  return executeSingleRow(`
    SELECT password_hash AS "passwordHash", account_status AS "accountStatus"
    FROM users WHERE user_id = $1
  `, [userId]);
}

// The new hash and the token-version bump that signs every other session out
// are one statement inside one transaction: a session can never survive a
// committed password change.
async function updatePasswordHash(userId, passwordHash) {
  const result = await database.withTransaction((client) => client.query(`
    UPDATE users
    SET password_hash = $1, token_version = token_version + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $2 AND account_status = 'ACTIVE'
  `, [passwordHash, userId]));
  return result.rowCount === 1;
}

async function incrementTokenVersion(userId) {
  const result = await database.withTransaction((client) => client.query(`
    UPDATE users
    SET token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND account_status = 'ACTIVE'
    RETURNING token_version AS "tokenVersion"
  `, [userId]));
  return result.rows[0] || null;
}

async function createUserWithOptionalEmployee({ fullName, email, passwordHash, userType, employmentStatus }) {
  const client = await database.getClient();

  try {
    await client.query('BEGIN');
    const userResult = await client.query(`
      INSERT INTO users (full_name, email, password_hash, user_type, account_role, account_status)
      VALUES ($1, $2, $3, $4, 'USER', 'ACTIVE')
      RETURNING user_id AS "userId"
    `, [fullName, email, passwordHash, userType]);
    const userId = userResult.rows[0].userId;

    if (userType === 'EMPLOYEE') {
      await client.query(`
        INSERT INTO employees (user_id, employment_status)
        VALUES ($1, $2)
      `, [userId, employmentStatus]);
    }

    await client.query('COMMIT');
    return {
      userId, fullName, email, userType, accountRole: 'USER', accountStatus: 'ACTIVE',
      employmentStatus: userType === 'EMPLOYEE' ? employmentStatus : null
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const PRIVATE_SUBMISSION_SELECT = `
  SELECT s.submission_id AS "submissionId", s.user_id AS "ownerUserId",
    s.company_id AS "companyId", c.company_name AS "companyName",
    s.submission_type AS "submissionType", s.submission_status AS "submissionStatus",
    s.verification_status AS "verificationStatus", s.is_anonymous AS "isAnonymous",
    s.submitted_at AS "submittedAt", s.approved_at AS "approvedAt",
    COALESCE(ss.role_id, cr.role_id, ie.role_id) AS "roleId",
    jr.role_name AS "roleName", ss.base_salary AS "baseSalary",
    ss.additional_compensation AS "additionalCompensation", ss.currency,
    ss.pay_period AS "payPeriod", ss.years_of_experience AS "yearsOfExperience",
    ss.employment_type AS "employmentType", ss.work_mode AS "workMode",
    ss.salary_year AS "salaryYear", cr.review_title AS "reviewTitle",
    cr.overall_rating AS "overallRating", cr.pros, cr.cons,
    ie.interview_date AS "interviewDate", ie.difficulty_level AS "difficultyLevel",
    ie.result_status AS "resultStatus", ie.interview_mode AS "interviewMode"
  FROM submissions s
  JOIN companies c ON c.company_id = s.company_id
  LEFT JOIN salary_submissions ss ON ss.submission_id = s.submission_id
  LEFT JOIN company_reviews cr ON cr.submission_id = s.submission_id
  LEFT JOIN interview_experiences ie ON ie.submission_id = s.submission_id
  LEFT JOIN job_roles jr ON jr.role_id = COALESCE(ss.role_id, cr.role_id, ie.role_id)
`;

async function findSubmissionsByOwner(userId) {
  const result = await database.query(`
    ${PRIVATE_SUBMISSION_SELECT}
    WHERE s.user_id = $1
    ORDER BY s.submitted_at DESC, s.submission_id DESC
  `, [userId]);
  return result.rows;
}

async function findPrivateSubmissionById(submissionId) {
  return executeSingleRow(`${PRIVATE_SUBMISSION_SELECT} WHERE s.submission_id = $1`, [submissionId]);
}

module.exports = {
  findUserByEmail, findUserForPasswordResetByEmail, findSafeUserById, findAuthorizationById,
  findActiveVerifiedScopesByUserId, updateFullName, findPasswordHashById, updatePasswordHash,
  incrementTokenVersion, createUserWithOptionalEmployee, findSubmissionsByOwner,
  findPrivateSubmissionById
};
