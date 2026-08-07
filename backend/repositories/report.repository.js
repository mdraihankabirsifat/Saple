const oracledb = require('oracledb');
const database = require('../config/database');

function repositoryError(code, message) { const error = new Error(message); error.sapleCode = code; return error; }

async function createReport({ reporterUserId, submissionId, reasonCategory, description }) {
  let connection;
  try {
    connection = await database.getConnection();
    const userResult = await connection.execute(`SELECT account_status AS "accountStatus" FROM users WHERE user_id = :reporterUserId`, { reporterUserId });
    if (!userResult.rows[0] || userResult.rows[0].accountStatus !== 'ACTIVE') throw repositoryError('ACCOUNT_UNAVAILABLE', 'This account cannot submit reports');
    const submissionResult = await connection.execute(`SELECT submission_id AS "submissionId" FROM submissions WHERE submission_id = :submissionId`, { submissionId });
    if (!submissionResult.rows[0]) throw repositoryError('SUBMISSION_NOT_FOUND', 'Submission not found');
    const result = await connection.execute(
      `INSERT INTO reports (
         reporter_user_id, submission_id, reason_category, report_description, report_status
       ) VALUES (
         :reporterUserId, :submissionId, :reasonCategory, :description, 'OPEN'
       ) RETURNING report_id INTO :reportId`,
      {
        reporterUserId, submissionId, reasonCategory, description,
        reportId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      }
    );
    await connection.commit();
    return { reportId: result.outBinds.reportId[0], reportStatus: 'OPEN', submissionId };
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.errorNum === 1) throw repositoryError('DUPLICATE_REPORT', 'You have already reported this submission');
    throw error;
  } finally { if (connection) await connection.close(); }
}

const ADMIN_REPORT_SELECT = `
  SELECT r.report_id AS "reportId", r.reason_category AS "reasonCategory",
    r.report_description AS "description", r.report_status AS "reportStatus",
    r.reported_at AS "reportedAt", r.resolved_at AS "resolvedAt",
    r.resolution_note AS "resolutionNote", r.resolved_by AS "resolvedBy",
    r.reporter_user_id AS "reporterUserId", ru.full_name AS "reporterName",
    ru.email AS "reporterEmail", r.submission_id AS "submissionId",
    s.submission_type AS "submissionType", s.submission_status AS "submissionStatus",
    s.verification_status AS "verificationStatus", s.is_anonymous AS "isAnonymous",
    s.company_id AS "companyId", c.company_name AS "companyName"
  FROM reports r
  JOIN users ru ON ru.user_id = r.reporter_user_id
  JOIN submissions s ON s.submission_id = r.submission_id
  JOIN companies c ON c.company_id = s.company_id
`;

async function findReports() {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(`${ADMIN_REPORT_SELECT}
      ORDER BY CASE r.report_status WHEN 'OPEN' THEN 1 WHEN 'REVIEWING' THEN 2 ELSE 3 END,
        r.reported_at ASC, r.report_id ASC`);
    return result.rows;
  } finally { if (connection) await connection.close(); }
}
async function findReportById(reportId) {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(`${ADMIN_REPORT_SELECT} WHERE r.report_id = :reportId`, { reportId });
    return result.rows[0] || null;
  } finally { if (connection) await connection.close(); }
}

async function updateReportStatus({ reportId, resolverUserId, status, resolutionNote, allowedPreviousStatuses }) {
  let connection;
  try {
    connection = await database.getConnection();
    const currentResult = await connection.execute(
      `SELECT report_status AS "reportStatus" FROM reports WHERE report_id = :reportId FOR UPDATE`,
      { reportId }
    );
    const current = currentResult.rows[0];
    if (!current) throw repositoryError('REPORT_NOT_FOUND', 'Report not found');
    if (!allowedPreviousStatuses.includes(current.reportStatus)) throw repositoryError('INVALID_TRANSITION', 'This report cannot make that status transition');
    const terminal = status === 'RESOLVED' || status === 'DISMISSED';
    await connection.execute(
      `UPDATE reports SET report_status = :status,
         resolved_at = CASE WHEN :isTerminal = 1 THEN SYSTIMESTAMP ELSE NULL END,
         resolved_by = CASE WHEN :isTerminal = 1 THEN :resolverUserId ELSE NULL END,
         resolution_note = CASE WHEN :isTerminal = 1 THEN :resolutionNote ELSE NULL END
       WHERE report_id = :reportId`,
      { status, isTerminal: terminal ? 1 : 0, resolverUserId, resolutionNote, reportId }
    );
    await connection.commit();
    return { reportId, previousStatus: current.reportStatus, reportStatus: status, resolved: terminal };
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally { if (connection) await connection.close(); }
}

module.exports = { createReport, findReports, findReportById, updateReportStatus };
