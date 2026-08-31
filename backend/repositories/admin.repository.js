const database = require('../config/database');

function createRepositoryError(code, message, detail) {
  const error = new Error(message);
  error.sapleCode = code;
  if (detail !== undefined) error.detail = detail;
  return error;
}

const SUBMISSION_SELECT = `
  SELECT s.submission_id AS "submissionId", s.submission_type AS "submissionType",
    s.company_id AS "companyId", c.company_name AS "companyName",
    s.submitted_at AS "submittedAt", s.approved_at AS "approvedAt",
    s.updated_at AS "updatedAt", s.submission_status AS "submissionStatus",
    s.verification_status AS "verificationStatus", s.is_anonymous AS "isAnonymous",
    u.user_id AS "submitterUserId", u.full_name AS "submitterName",
    u.email AS "submitterEmail", u.user_type AS "submitterType",
    COALESCE(ss.role_id, cr.role_id, ie.role_id) AS "roleId",
    jr.role_name AS "roleName", ss.base_salary AS "baseSalary",
    ss.additional_compensation AS "additionalCompensation", ss.currency,
    ss.pay_period AS "payPeriod", ss.years_of_experience AS "yearsOfExperience",
    ss.employment_type AS "employmentType", ss.work_mode AS "workMode",
    ss.salary_year AS "salaryYear", cr.review_title AS "reviewTitle",
    cr.overall_rating AS "overallRating",
    cr.work_life_balance_rating AS "workLifeBalanceRating",
    cr.career_growth_rating AS "careerGrowthRating",
    cr.management_rating AS "managementRating", cr.culture_rating AS "cultureRating",
    cr.pros, cr.cons, cr.advice_to_management AS "adviceToManagement",
    cr.employment_status AS "reviewEmploymentStatus", cr.review_date AS "reviewDate",
    ie.interview_date AS "interviewDate", ie.difficulty_level AS "difficultyLevel",
    ie.rounds_count AS "roundsCount", ie.interview_mode AS "interviewMode",
    ie.result_status AS "resultStatus", ie.duration_days AS "durationDays",
    ie.process_description AS "processDescription", ie.questions_summary AS "questionsSummary"
  FROM submissions s
  JOIN companies c ON c.company_id = s.company_id
  JOIN users u ON u.user_id = s.user_id
  LEFT JOIN salary_submissions ss
    ON ss.submission_id = s.submission_id AND s.submission_type = 'SALARY'
  LEFT JOIN company_reviews cr
    ON cr.submission_id = s.submission_id AND s.submission_type = 'REVIEW'
  LEFT JOIN interview_experiences ie
    ON ie.submission_id = s.submission_id AND s.submission_type = 'INTERVIEW'
  LEFT JOIN job_roles jr ON jr.role_id = COALESCE(ss.role_id, cr.role_id, ie.role_id)
`;

async function findPendingSubmissions() {
  const result = await database.query(`
    ${SUBMISSION_SELECT}
    WHERE s.submission_status = 'PENDING'
    ORDER BY s.submitted_at ASC, s.submission_id ASC
  `);
  return result.rows;
}

async function findSubmissionById(submissionId) {
  const result = await database.query(
    `${SUBMISSION_SELECT} WHERE s.submission_id = $1`,
    [submissionId]
  );
  return result.rows[0] || null;
}

async function findModerationHistory(submissionId) {
  const submissionResult = await database.query(
    'SELECT submission_id AS "submissionId" FROM submissions WHERE submission_id = $1',
    [submissionId]
  );
  if (!submissionResult.rows[0]) return null;

  const result = await database.query(`
    SELECT ma.action_id AS "actionId", ma.action_type AS "actionType",
      ma.previous_status AS "previousStatus", ma.new_status AS "newStatus",
      ma.action_note AS "actionNote", ma.action_at AS "actionAt",
      ma.moderator_user_id AS "moderatorUserId",
      u.full_name AS "moderatorName", u.email AS "moderatorEmail"
    FROM moderation_actions ma
    JOIN users u ON u.user_id = ma.moderator_user_id
    WHERE ma.submission_id = $1
    ORDER BY ma.action_at ASC, ma.action_id ASC
  `, [submissionId]);
  return result.rows;
}

async function updateSubmissionStatusWithAudit(input) {
  const {
    submissionId, moderatorUserId, newStatus, actionType,
    actionNote, allowedPreviousStatuses
  } = input;
  const client = await database.getClient();

  try {
    await client.query('BEGIN');
    const currentResult = await client.query(`
      SELECT submission_status AS "submissionStatus"
      FROM submissions WHERE submission_id = $1 FOR UPDATE
    `, [submissionId]);
    const current = currentResult.rows[0];
    if (!current) throw createRepositoryError('SUBMISSION_NOT_FOUND', 'Submission not found');
    if (!allowedPreviousStatuses.includes(current.submissionStatus)) {
      throw createRepositoryError(
        'INVALID_TRANSITION',
        'This submission has already been processed or cannot make that transition',
        { previousStatus: current.submissionStatus }
      );
    }

    await client.query(`
      UPDATE submissions SET submission_status = $1,
        approved_at = CASE WHEN $1 = 'APPROVED' THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
      WHERE submission_id = $2
    `, [newStatus, submissionId]);
    const actionResult = await client.query(`
      INSERT INTO moderation_actions (
        submission_id, moderator_user_id, action_type,
        previous_status, new_status, action_note
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING action_id AS "actionId"
    `, [
      submissionId, moderatorUserId, actionType,
      current.submissionStatus, newStatus, actionNote
    ]);
    await client.query('COMMIT');
    return {
      submissionId,
      previousStatus: current.submissionStatus,
      submissionStatus: newStatus,
      actionId: actionResult.rows[0].actionId,
      approvedAtSet: newStatus === 'APPROVED'
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  findPendingSubmissions, findSubmissionById, findModerationHistory,
  updateSubmissionStatusWithAudit
};
