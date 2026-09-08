const database = require('../config/database');

function repositoryError(code, message) {
  const error = new Error(message);
  error.sapleCode = code;
  return error;
}

async function findActiveVerifiedEmployment(userId, companyId, roleId) {
  const result = await database.query(`
    SELECT e.employee_id AS "employeeId", e.employment_status AS "employmentStatus",
      ev.verification_id AS "verificationId", ev.company_id AS "companyId",
      ev.role_id AS "roleId", ev.expires_at AS "expiresAt"
    FROM users u
    JOIN employees e ON e.user_id = u.user_id
    JOIN employment_verifications ev ON ev.employee_id = e.employee_id
    WHERE u.user_id = $1 AND u.user_type = 'EMPLOYEE' AND u.account_status = 'ACTIVE'
      AND ev.company_id = $2 AND ev.role_id = $3
      AND ev.verification_status = 'VERIFIED'
      AND (ev.expires_at IS NULL OR ev.expires_at > CURRENT_TIMESTAMP)
    ORDER BY ev.reviewed_at DESC
    LIMIT 1
  `, [userId, companyId, roleId]);
  return result.rows[0] || null;
}

async function createVerificationRequest(input) {
  const {
    userId, companyId, roleId, employmentStatus, verificationMethod,
    companyEmail, proofType, proofReference
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
    if (!employee) throw repositoryError('EMPLOYEE_REQUIRED', 'An active employee account is required');
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

    const existingResult = await client.query(`
      SELECT verification_id AS "verificationId"
      FROM employment_verifications
      WHERE employee_id = $1 AND company_id = $2 AND role_id = $3
        AND (verification_status = 'PENDING'
          OR (verification_status = 'VERIFIED'
            AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)))
      LIMIT 1
      FOR UPDATE
    `, [employee.employeeId, companyId, roleId]);
    if (existingResult.rows[0]) {
      throw repositoryError(
        'ACTIVE_VERIFICATION_EXISTS',
        'A pending or active verification already exists for this company and designation'
      );
    }

    const result = await client.query(`
      INSERT INTO employment_verifications (
        employee_id, company_id, role_id, verification_method, company_email,
        proof_type, proof_reference, verification_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
      RETURNING verification_id AS "verificationId"
    `, [
      employee.employeeId, companyId, roleId, verificationMethod,
      companyEmail, proofType, proofReference
    ]);
    await client.query('COMMIT');
    return {
      verificationId: result.rows[0].verificationId,
      verificationStatus: 'PENDING',
      companyId,
      roleId,
      employmentStatus,
      verificationMethod
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const ADMIN_VERIFICATION_SELECT = `
  SELECT ev.verification_id AS "verificationId", ev.employee_id AS "employeeId",
    e.employment_status AS "employmentStatus", e.user_id AS "userId",
    u.full_name AS "employeeName", u.email AS "employeeEmail",
    ev.company_id AS "companyId", c.company_name AS "companyName",
    ev.role_id AS "roleId", jr.role_name AS "roleName",
    ev.verification_method AS "verificationMethod", ev.company_email AS "companyEmail",
    ev.proof_type AS "proofType", ev.proof_reference AS "proofReference",
    ev.verification_status AS "verificationStatus", ev.requested_at AS "requestedAt",
    ev.reviewed_at AS "reviewedAt", ev.expires_at AS "expiresAt",
    ev.rejection_reason AS "rejectionReason", ev.reviewed_by AS "reviewedBy"
  FROM employment_verifications ev
  JOIN employees e ON e.employee_id = ev.employee_id
  JOIN users u ON u.user_id = e.user_id
  JOIN companies c ON c.company_id = ev.company_id
  LEFT JOIN job_roles jr ON jr.role_id = ev.role_id
`;

async function findPendingVerifications() {
  const result = await database.query(`
    ${ADMIN_VERIFICATION_SELECT}
    WHERE ev.verification_status = 'PENDING'
    ORDER BY ev.requested_at ASC, ev.verification_id ASC
  `);
  return result.rows;
}

async function findVerificationById(verificationId) {
  const result = await database.query(
    `${ADMIN_VERIFICATION_SELECT} WHERE ev.verification_id = $1`,
    [verificationId]
  );
  return result.rows[0] || null;
}

async function decideVerification({ verificationId, reviewerUserId, status, rejectionReason }) {
  const client = await database.getClient();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(`
      SELECT verification_status AS "verificationStatus", role_id AS "roleId"
      FROM employment_verifications WHERE verification_id = $1 FOR UPDATE
    `, [verificationId]);
    const current = currentResult.rows[0];
    if (!current) throw repositoryError('VERIFICATION_NOT_FOUND', 'Verification request not found');
    if (current.verificationStatus !== 'PENDING') {
      throw repositoryError('INVALID_TRANSITION', 'This verification request has already been reviewed');
    }
    if (status === 'VERIFIED' && !current.roleId) {
      throw repositoryError('ROLE_REQUIRED', 'A legacy request without a designation cannot be approved');
    }

    await client.query(`
      UPDATE employment_verifications SET
        verification_status = $1::varchar, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $2,
        expires_at = CASE WHEN $1 = 'VERIFIED'
          THEN CURRENT_TIMESTAMP + INTERVAL '12 months' ELSE NULL END,
        rejection_reason = $3
      WHERE verification_id = $4
    `, [status, reviewerUserId, rejectionReason, verificationId]);
    await client.query('COMMIT');
    return { verificationId, previousStatus: 'PENDING', verificationStatus: status };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  findActiveVerifiedEmployment, createVerificationRequest, findPendingVerifications,
  findVerificationById, decideVerification
};
