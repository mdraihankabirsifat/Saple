const database = require('../config/database');

function repositoryError(code, message) {
  const error = new Error(message);
  error.sapleCode = code;
  return error;
}

async function createReport({ reporterUserId, submissionId, reasonCategory, description }) {
  const client = await database.getClient();
  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      'SELECT account_status AS "accountStatus" FROM users WHERE user_id = $1',
      [reporterUserId]
    );
    if (!userResult.rows[0] || userResult.rows[0].accountStatus !== 'ACTIVE') {
      throw repositoryError('ACCOUNT_UNAVAILABLE', 'This account cannot submit reports');
    }
    const submissionResult = await client.query(
      'SELECT submission_id AS "submissionId" FROM submissions WHERE submission_id = $1',
      [submissionId]
    );
    if (!submissionResult.rows[0]) {
      throw repositoryError('SUBMISSION_NOT_FOUND', 'Submission not found');
    }
    const result = await client.query(`
      INSERT INTO reports (
        reporter_user_id, submission_id, reason_category, report_description, report_status
      ) VALUES ($1, $2, $3, $4, 'OPEN')
      RETURNING report_id AS "reportId"
    `, [reporterUserId, submissionId, reasonCategory, description]);
    await client.query('COMMIT');
    return { reportId: result.rows[0].reportId, reportStatus: 'OPEN', submissionId };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      throw repositoryError('DUPLICATE_REPORT', 'You have already reported this submission');
    }
    throw error;
  } finally {
    client.release();
  }
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
  const result = await database.query(`
    ${ADMIN_REPORT_SELECT}
    ORDER BY CASE r.report_status WHEN 'OPEN' THEN 1 WHEN 'REVIEWING' THEN 2 ELSE 3 END,
      r.reported_at ASC, r.report_id ASC
  `);
  return result.rows;
}

async function findReportById(reportId) {
  const result = await database.query(
    `${ADMIN_REPORT_SELECT} WHERE r.report_id = $1`,
    [reportId]
  );
  return result.rows[0] || null;
}

async function updateReportStatus(input) {
  const {
    reportId, resolverUserId, status, resolutionNote, allowedPreviousStatuses
  } = input;
  const client = await database.getClient();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(`
      SELECT report_status AS "reportStatus"
      FROM reports WHERE report_id = $1 FOR UPDATE
    `, [reportId]);
    const current = currentResult.rows[0];
    if (!current) throw repositoryError('REPORT_NOT_FOUND', 'Report not found');
    if (!allowedPreviousStatuses.includes(current.reportStatus)) {
      throw repositoryError('INVALID_TRANSITION', 'This report cannot make that status transition');
    }
    const terminal = status === 'RESOLVED' || status === 'DISMISSED';
    await client.query(`
      UPDATE reports SET report_status = $1,
        resolved_at = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE NULL END,
        resolved_by = CASE WHEN $2 THEN $3 ELSE NULL END,
        resolution_note = CASE WHEN $2 THEN $4 ELSE NULL END
      WHERE report_id = $5
    `, [status, terminal, resolverUserId, resolutionNote, reportId]);
    await client.query('COMMIT');
    return {
      reportId, previousStatus: current.reportStatus,
      reportStatus: status, resolved: terminal
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { createReport, findReports, findReportById, updateReportStatus };
