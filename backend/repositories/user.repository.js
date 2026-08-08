const oracledb = require('oracledb');
const database = require('../config/database');

async function executeSingleRow(sql, binds) {
  let connection;

  try {
    connection = await database.getConnection();
    const result = await connection.execute(sql, binds);
    return result.rows[0] || null;
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

async function findUserByEmail(email) {
  const sql = `
    SELECT
      u.user_id AS "userId",
      u.full_name AS "fullName",
      u.email AS "email",
      u.password_hash AS "passwordHash",
      u.user_type AS "userType",
      u.account_role AS "accountRole",
      u.account_status AS "accountStatus",
      e.employment_status AS "employmentStatus"
    FROM users u
    LEFT JOIN employees e ON e.user_id = u.user_id
    WHERE LOWER(u.email) = :email
  `;

  return executeSingleRow(sql, { email });
}

async function findUserForPasswordResetByEmail(email) {
  const sql = `
    SELECT
      user_id AS "userId",
      full_name AS "fullName",
      email AS "email",
      account_status AS "accountStatus"
    FROM users
    WHERE LOWER(email) = :email
  `;

  return executeSingleRow(sql, { email });
}

async function findSafeUserById(userId) {
  const sql = `
    SELECT
      u.user_id AS "userId",
      u.full_name AS "fullName",
      u.email AS "email",
      u.user_type AS "userType",
      u.account_role AS "accountRole",
      u.account_status AS "accountStatus",
      e.employment_status AS "employmentStatus",
      u.created_at AS "createdAt"
    FROM users u
    LEFT JOIN employees e ON e.user_id = u.user_id
    WHERE u.user_id = :userId
  `;

  return executeSingleRow(sql, { userId });
}

async function findAuthorizationById(userId) {
  const sql = `
    SELECT
      account_role AS "accountRole",
      account_status AS "accountStatus"
    FROM users
    WHERE user_id = :userId
  `;

  return executeSingleRow(sql, { userId });
}

async function findActiveVerifiedScopesByUserId(userId) {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT DISTINCT c.company_id AS "companyId", c.company_name AS "companyName",
         ev.role_id AS "roleId", jr.role_name AS "roleName", ev.expires_at AS "expiresAt"
       FROM users u
       JOIN employees e ON e.user_id = u.user_id
       JOIN employment_verifications ev ON ev.employee_id = e.employee_id
       JOIN companies c ON c.company_id = ev.company_id
       JOIN job_roles jr ON jr.role_id = ev.role_id
       WHERE u.user_id = :userId
         AND u.user_type = 'EMPLOYEE'
         AND u.account_status = 'ACTIVE'
         AND ev.verification_status = 'VERIFIED'
         AND (ev.expires_at IS NULL OR ev.expires_at > SYSTIMESTAMP)
       ORDER BY c.company_name, jr.role_name`,
      { userId }
    );
    return result.rows;
  } finally {
    if (connection) await connection.close();
  }
}

async function updateFullName(userId, fullName) {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `UPDATE users SET full_name = :fullName, updated_at = SYSTIMESTAMP
       WHERE user_id = :userId AND account_status = 'ACTIVE'`,
      { userId, fullName },
      { autoCommit: true }
    );
    return result.rowsAffected === 1;
  } finally {
    if (connection) await connection.close();
  }
}

async function findPasswordHashById(userId) {
  const result = await executeSingleRow(
    `SELECT password_hash AS "passwordHash", account_status AS "accountStatus"
     FROM users WHERE user_id = :userId`,
    { userId }
  );
  return result;
}

async function updatePasswordHash(userId, passwordHash) {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `UPDATE users SET password_hash = :passwordHash, updated_at = SYSTIMESTAMP
       WHERE user_id = :userId AND account_status = 'ACTIVE'`,
      { userId, passwordHash },
      { autoCommit: true }
    );
    return result.rowsAffected === 1;
  } finally {
    if (connection) await connection.close();
  }
}

async function createUserWithOptionalEmployee({
  fullName,
  email,
  passwordHash,
  userType,
  employmentStatus
}) {
  let connection;

  try {
    connection = await database.getConnection();

    const userResult = await connection.execute(
      `
        INSERT INTO users (
          full_name,
          email,
          password_hash,
          user_type,
          account_role,
          account_status
        ) VALUES (
          :fullName,
          :email,
          :passwordHash,
          :userType,
          'USER',
          'ACTIVE'
        )
        RETURNING user_id INTO :userId
      `,
      {
        fullName,
        email,
        passwordHash,
        userType,
        userId: {
          dir: oracledb.BIND_OUT,
          type: oracledb.NUMBER
        }
      }
    );

    const userId = userResult.outBinds.userId[0];

    if (userType === 'EMPLOYEE') {
      await connection.execute(
        `
          INSERT INTO employees (
            user_id,
            employment_status
          ) VALUES (
            :userId,
            :employmentStatus
          )
        `,
        { userId, employmentStatus }
      );
    }

    await connection.commit();

    return {
      userId,
      fullName,
      email,
      userType,
      accountRole: 'USER',
      accountStatus: 'ACTIVE',
      employmentStatus: userType === 'EMPLOYEE' ? employmentStatus : null
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
  findUserByEmail,
  findUserForPasswordResetByEmail,
  findSafeUserById,
  findAuthorizationById,
  findActiveVerifiedScopesByUserId,
  updateFullName,
  findPasswordHashById,
  updatePasswordHash,
  createUserWithOptionalEmployee
};
