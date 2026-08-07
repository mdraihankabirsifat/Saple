const oracledb = require('oracledb');
const database = require('../config/database');

function repositoryError(code, message) {
  const error = new Error(message);
  error.sapleCode = code;
  return error;
}

async function createVerificationRequest({
  userId,
  companyId,
  employmentStatus,
  verificationMethod,
  companyEmail,
  proofType,
  proofReference
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
    if (!employee) throw repositoryError('EMPLOYEE_REQUIRED', 'An active employee account is required');
    if (employee.employmentStatus !== employmentStatus) {
      throw repositoryError('EMPLOYMENT_STATUS_MISMATCH', 'Employment status does not match the employee profile');
    }

    const companyResult = await connection.execute(
      `SELECT company_id AS "companyId" FROM companies WHERE company_id = :companyId`,
      { companyId }
    );
    if (!companyResult.rows[0]) throw repositoryError('COMPANY_NOT_FOUND', 'Company not found');

    const existingResult = await connection.execute(
      `SELECT verification_id AS "verificationId"
       FROM employment_verifications
       WHERE employee_id = :employeeId AND company_id = :companyId
         AND (verification_status = 'PENDING'
           OR (verification_status = 'VERIFIED' AND (expires_at IS NULL OR expires_at > SYSTIMESTAMP)))
       FETCH FIRST 1 ROW ONLY`,
      { employeeId: employee.employeeId, companyId }
    );
    if (existingResult.rows[0]) {
      throw repositoryError('ACTIVE_VERIFICATION_EXISTS', 'A pending or active verification already exists for this company');
    }

    const result = await connection.execute(
      `INSERT INTO employment_verifications (
         employee_id, company_id, verification_method, company_email,
         proof_type, proof_reference, verification_status
       ) VALUES (
         :employeeId, :companyId, :verificationMethod, :companyEmail,
         :proofType, :proofReference, 'PENDING'
       ) RETURNING verification_id INTO :verificationId`,
      {
        employeeId: employee.employeeId,
        companyId,
        verificationMethod,
        companyEmail,
        proofType,
        proofReference,
        verificationId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      }
    );
    await connection.commit();
    return {
      verificationId: result.outBinds.verificationId[0],
      verificationStatus: 'PENDING',
      companyId,
      employmentStatus,
      verificationMethod
    };
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) await connection.close();
  }
}

const ADMIN_VERIFICATION_SELECT = `
  SELECT ev.verification_id AS "verificationId", ev.employee_id AS "employeeId",
    e.employment_status AS "employmentStatus", e.user_id AS "userId",
    u.full_name AS "employeeName", u.email AS "employeeEmail",
    ev.company_id AS "companyId", c.company_name AS "companyName",
    ev.verification_method AS "verificationMethod", ev.company_email AS "companyEmail",
    ev.proof_type AS "proofType", ev.proof_reference AS "proofReference",
    ev.verification_status AS "verificationStatus", ev.requested_at AS "requestedAt",
    ev.reviewed_at AS "reviewedAt", ev.expires_at AS "expiresAt",
    ev.rejection_reason AS "rejectionReason", ev.reviewed_by AS "reviewedBy"
  FROM employment_verifications ev
  JOIN employees e ON e.employee_id = ev.employee_id
  JOIN users u ON u.user_id = e.user_id
  JOIN companies c ON c.company_id = ev.company_id
`;

async function findPendingVerifications() {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(`${ADMIN_VERIFICATION_SELECT}
      WHERE ev.verification_status = 'PENDING'
      ORDER BY ev.requested_at ASC, ev.verification_id ASC`);
    return result.rows;
  } finally {
    if (connection) await connection.close();
  }
}

async function findVerificationById(verificationId) {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `${ADMIN_VERIFICATION_SELECT} WHERE ev.verification_id = :verificationId`,
      { verificationId }
    );
    return result.rows[0] || null;
  } finally {
    if (connection) await connection.close();
  }
}

async function decideVerification({ verificationId, reviewerUserId, status, rejectionReason }) {
  let connection;
  try {
    connection = await database.getConnection();
    const currentResult = await connection.execute(
      `SELECT verification_status AS "verificationStatus"
       FROM employment_verifications WHERE verification_id = :verificationId FOR UPDATE`,
      { verificationId }
    );
    const current = currentResult.rows[0];
    if (!current) throw repositoryError('VERIFICATION_NOT_FOUND', 'Verification request not found');
    if (current.verificationStatus !== 'PENDING') {
      throw repositoryError('INVALID_TRANSITION', 'This verification request has already been reviewed');
    }

    await connection.execute(
      `UPDATE employment_verifications SET
         verification_status = :status,
         reviewed_at = SYSTIMESTAMP,
         reviewed_by = :reviewerUserId,
         expires_at = CASE WHEN :status = 'VERIFIED' THEN ADD_MONTHS(SYSTIMESTAMP, 12) ELSE NULL END,
         rejection_reason = :rejectionReason
       WHERE verification_id = :verificationId`,
      { status, reviewerUserId, rejectionReason, verificationId }
    );
    await connection.commit();
    return { verificationId, previousStatus: 'PENDING', verificationStatus: status };
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  createVerificationRequest,
  findPendingVerifications,
  findVerificationById,
  decideVerification
};
