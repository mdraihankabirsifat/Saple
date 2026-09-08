const database = require('../config/database');

const IDENTITIES = [
  ['users', 'user_id'],
  ['employees', 'employee_id'],
  ['companies', 'company_id'],
  ['job_roles', 'role_id'],
  ['benefits', 'benefit_id'],
  ['employment_verifications', 'verification_id'],
  ['submissions', 'submission_id'],
  ['reports', 'report_id'],
  ['moderation_actions', 'action_id'],
  ['password_reset_tokens', 'reset_token_id']
];

async function synchronizeRequiredIdentityGenerators() {
  for (const [table, column] of IDENTITIES) {
    // Both identifiers come from the fixed constant above, never request input.
    await database.query(`
      SELECT setval(pg_get_serial_sequence('${table}', '${column}'),
        COALESCE((SELECT MAX(${column}) FROM ${table}), 1),
        EXISTS (SELECT 1 FROM ${table}))
    `);
  }
}

async function probeReferenceIdentityGenerators(uniqueSuffix) {
  const client = await database.getClient();
  try {
    await client.query('BEGIN');
    const companyResult = await client.query(`
      INSERT INTO companies (company_name, industry, headquarters_city, country)
      VALUES ($1, 'Integration', 'Dhaka', 'Bangladesh')
      RETURNING company_id AS "companyId"
    `, [`Identity Probe Company ${uniqueSuffix}`]);
    const roleResult = await client.query(`
      INSERT INTO job_roles (role_name, role_category)
      VALUES ($1, 'Integration') RETURNING role_id AS "roleId"
    `, [`Identity Probe Role ${uniqueSuffix}`]);
    const benefitResult = await client.query(`
      INSERT INTO benefits (benefit_name, benefit_category)
      VALUES ($1, 'Integration') RETURNING benefit_id AS "benefitId"
    `, [`Identity Probe Benefit ${uniqueSuffix}`]);
    return {
      companyId: companyResult.rows[0].companyId,
      roleId: roleResult.rows[0].roleId,
      benefitId: benefitResult.rows[0].benefitId
    };
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function updateWorkflowUser(userId, field, value) {
  const columns = {
    role: 'account_role',
    status: 'account_status'
  };
  const column = columns[field];
  if (!column) throw new Error('Unsupported workflow user field');
  await database.query(`
    UPDATE users SET ${column} = $1, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $2
  `, [value, userId]);
}

const promoteUserToAdmin = (userId) => updateWorkflowUser(userId, 'role', 'ADMIN');
const setWorkflowUserAccountStatus = (userId, status) =>
  updateWorkflowUser(userId, 'status', status);

async function findModerationState(submissionId) {
  const [submissionResult, actionResult] = await Promise.all([
    database.query(`
      SELECT submission_status AS "submissionStatus", approved_at AS "approvedAt"
      FROM submissions WHERE submission_id = $1
    `, [submissionId]),
    database.query(`
      SELECT action_id AS "actionId", action_type AS "actionType",
        previous_status AS "previousStatus", new_status AS "newStatus",
        action_note AS "actionNote"
      FROM moderation_actions WHERE submission_id = $1
      ORDER BY action_at, action_id
    `, [submissionId])
  ]);
  return { submission: submissionResult.rows[0] || null, actions: actionResult.rows };
}

async function countViewContributions(viewName, companyId) {
  const allowedViews = new Set([
    'vw_verified_salary_summary',
    'vw_community_salary_summary'
  ]);
  if (!allowedViews.has(viewName)) throw new Error('Unsupported salary view');
  const result = await database.query(`
    SELECT COALESCE(SUM(contribution_count), 0)::INTEGER AS "contributionCount"
    FROM ${viewName} WHERE company_id = $1
  `, [companyId]);
  return result.rows[0].contributionCount;
}

const countVerifiedContributions = (companyId) =>
  countViewContributions('vw_verified_salary_summary', companyId);
const countCommunityContributions = (companyId) =>
  countViewContributions('vw_community_salary_summary', companyId);

async function findInternalUserByEmail(email) {
  const result = await database.query(`
    SELECT u.user_id AS "userId", u.password_hash AS "passwordHash",
      u.user_type AS "userType", u.account_role AS "accountRole",
      u.account_status AS "accountStatus", u.token_version AS "tokenVersion",
      e.employee_id AS "employeeId", e.employment_status AS "employmentStatus"
    FROM users u LEFT JOIN employees e ON e.user_id = u.user_id
    WHERE u.email = $1
  `, [email]);
  return result.rows[0] || null;
}

async function findSalaryPair(submissionId) {
  const result = await database.query(`
    SELECT s.submission_id AS "parentSubmissionId",
      ss.submission_id AS "childSubmissionId",
      s.submission_status AS "submissionStatus",
      s.verification_status AS "verificationStatus", s.approved_at AS "approvedAt",
      ss.role_id AS "roleId", ss.base_salary AS "baseSalary"
    FROM submissions s JOIN salary_submissions ss ON ss.submission_id = s.submission_id
    WHERE s.submission_id = $1
  `, [submissionId]);
  return result.rows[0] || null;
}

async function findVerification(verificationId) {
  const result = await database.query(`
    SELECT verification_id AS "verificationId",
      verification_status AS "verificationStatus", reviewed_by AS "reviewedBy",
      reviewed_at AS "reviewedAt", expires_at AS "expiresAt", role_id AS "roleId",
      company_email AS "companyEmail", proof_reference AS "proofReference"
    FROM employment_verifications WHERE verification_id = $1
  `, [verificationId]);
  return result.rows[0] || null;
}

async function findSubtypePair(table, detailColumn, submissionId) {
  const allowed = {
    company_reviews: ['review_title', 'reviewTitle'],
    interview_experiences: ['result_status', 'resultStatus']
  };
  const selected = allowed[table];
  if (!selected) throw new Error('Unsupported submission subtype');
  const result = await database.query(`
    SELECT s.submission_id AS "parentSubmissionId",
      detail.submission_id AS "childSubmissionId",
      s.submission_status AS "submissionStatus",
      s.verification_status AS "verificationStatus", s.is_anonymous AS "isAnonymous",
      detail.${selected[0]} AS "${selected[1]}"
    FROM submissions s JOIN ${table} detail ON detail.submission_id = s.submission_id
    WHERE s.submission_id = $1
  `, [submissionId]);
  return result.rows[0] || null;
}

const findReviewPair = (submissionId) =>
  findSubtypePair('company_reviews', 'review_title', submissionId);
const findInterviewPair = (submissionId) =>
  findSubtypePair('interview_experiences', 'result_status', submissionId);

async function findReport(reportId) {
  const result = await database.query(`
    SELECT report_id AS "reportId", report_status AS "reportStatus",
      resolved_by AS "resolvedBy", resolved_at AS "resolvedAt",
      resolution_note AS "resolutionNote", submission_id AS "submissionId"
    FROM reports WHERE report_id = $1
  `, [reportId]);
  return result.rows[0] || null;
}

async function countSubmissionsForUser(userId) {
  const result = await database.query(`
    SELECT COUNT(*)::INTEGER AS "submissionCount"
    FROM submissions WHERE user_id = $1
  `, [userId]);
  return result.rows[0].submissionCount;
}

async function cleanupWorkflowUsers(normalEmail, employeeEmail) {
  const client = await database.getClient();
  try {
    await client.query('BEGIN');
    // Remove the fixture employee's verification before deleting its reviewer.
    await client.query(`
      DELETE FROM employment_verifications
      WHERE employee_id IN (
        SELECT e.employee_id FROM employees e JOIN users u ON u.user_id = e.user_id
        WHERE u.email = ANY($1::TEXT[])
      )
    `, [[normalEmail, employeeEmail]]);
    await client.query(`
      DELETE FROM submissions
      WHERE user_id IN (SELECT user_id FROM users WHERE email = ANY($1::TEXT[]))
    `, [[normalEmail, employeeEmail]]);
    await client.query('DELETE FROM users WHERE email = ANY($1::TEXT[])', [
      [normalEmail, employeeEmail]
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  synchronizeRequiredIdentityGenerators, probeReferenceIdentityGenerators,
  findInternalUserByEmail, findSalaryPair, findVerification, findReviewPair,
  findInterviewPair, findReport, countCommunityContributions, countSubmissionsForUser,
  promoteUserToAdmin, setWorkflowUserAccountStatus, findModerationState,
  countVerifiedContributions, cleanupWorkflowUsers
};
