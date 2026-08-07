const oracledb = require('oracledb');
const database = require('../config/database');

function createRepositoryError(code, message, detail) {
  const error = new Error(message);
  error.sapleCode = code;
  if (detail !== undefined) error.detail = detail;
  return error;
}

async function withConnection(callback) {
  let connection;

  try {
    connection = await database.getConnection();
    return await callback(connection);
  } finally {
    if (connection) await connection.close();
  }
}

const SUBMISSION_SELECT = `
  SELECT
    s.submission_id AS "submissionId",
    s.submission_type AS "submissionType",
    s.company_id AS "companyId",
    c.company_name AS "companyName",
    s.submitted_at AS "submittedAt",
    s.approved_at AS "approvedAt",
    s.updated_at AS "updatedAt",
    s.submission_status AS "submissionStatus",
    s.verification_status AS "verificationStatus",
    s.is_anonymous AS "isAnonymous",
    u.user_id AS "submitterUserId",
    u.full_name AS "submitterName",
    u.email AS "submitterEmail",
    u.user_type AS "submitterType",
    COALESCE(ss.role_id, cr.role_id, ie.role_id) AS "roleId",
    jr.role_name AS "roleName",
    ss.base_salary AS "baseSalary",
    ss.additional_compensation AS "additionalCompensation",
    ss.currency AS "currency",
    ss.pay_period AS "payPeriod",
    ss.years_of_experience AS "yearsOfExperience",
    ss.employment_type AS "employmentType",
    ss.work_mode AS "workMode",
    ss.salary_year AS "salaryYear",
    cr.review_title AS "reviewTitle",
    cr.overall_rating AS "overallRating",
    cr.work_life_balance_rating AS "workLifeBalanceRating",
    cr.career_growth_rating AS "careerGrowthRating",
    cr.management_rating AS "managementRating",
    cr.culture_rating AS "cultureRating",
    cr.pros AS "pros",
    cr.cons AS "cons",
    cr.advice_to_management AS "adviceToManagement",
    cr.employment_status AS "reviewEmploymentStatus",
    cr.review_date AS "reviewDate",
    ie.interview_date AS "interviewDate",
    ie.difficulty_level AS "difficultyLevel",
    ie.rounds_count AS "roundsCount",
    ie.interview_mode AS "interviewMode",
    ie.result_status AS "resultStatus",
    ie.duration_days AS "durationDays",
    ie.process_description AS "processDescription",
    ie.questions_summary AS "questionsSummary"
  FROM submissions s
  JOIN companies c ON c.company_id = s.company_id
  JOIN users u ON u.user_id = s.user_id
  LEFT JOIN salary_submissions ss
    ON ss.submission_id = s.submission_id
    AND s.submission_type = 'SALARY'
  LEFT JOIN company_reviews cr
    ON cr.submission_id = s.submission_id
    AND s.submission_type = 'REVIEW'
  LEFT JOIN interview_experiences ie
    ON ie.submission_id = s.submission_id
    AND s.submission_type = 'INTERVIEW'
  LEFT JOIN job_roles jr ON jr.role_id = COALESCE(ss.role_id, cr.role_id, ie.role_id)
`;

async function findPendingSubmissions() {
  return withConnection(async (connection) => {
    const result = await connection.execute(`
      ${SUBMISSION_SELECT}
      WHERE s.submission_status = 'PENDING'
      ORDER BY s.submitted_at ASC, s.submission_id ASC
    `);

    return result.rows;
  });
}

async function findSubmissionById(submissionId) {
  return withConnection(async (connection) => {
    const result = await connection.execute(
      `
        ${SUBMISSION_SELECT}
        WHERE s.submission_id = :submissionId
      `,
      { submissionId }
    );

    return result.rows[0] || null;
  });
}

async function findModerationHistory(submissionId) {
  return withConnection(async (connection) => {
    const submissionResult = await connection.execute(
      `
        SELECT submission_id AS "submissionId"
        FROM submissions
        WHERE submission_id = :submissionId
      `,
      { submissionId }
    );

    if (!submissionResult.rows[0]) {
      return null;
    }

    const result = await connection.execute(
      `
        SELECT
          ma.action_id AS "actionId",
          ma.action_type AS "actionType",
          ma.previous_status AS "previousStatus",
          ma.new_status AS "newStatus",
          ma.action_note AS "actionNote",
          ma.action_at AS "actionAt",
          ma.moderator_user_id AS "moderatorUserId",
          u.full_name AS "moderatorName",
          u.email AS "moderatorEmail"
        FROM moderation_actions ma
        JOIN users u ON u.user_id = ma.moderator_user_id
        WHERE ma.submission_id = :submissionId
        ORDER BY ma.action_at ASC, ma.action_id ASC
      `,
      { submissionId }
    );

    return result.rows;
  });
}

async function updateSubmissionStatusWithAudit({
  submissionId,
  moderatorUserId,
  newStatus,
  actionType,
  actionNote,
  allowedPreviousStatuses
}) {
  let connection;

  try {
    connection = await database.getConnection();

    const currentResult = await connection.execute(
      `
        SELECT submission_status AS "submissionStatus"
        FROM submissions
        WHERE submission_id = :submissionId
        FOR UPDATE
      `,
      { submissionId }
    );
    const current = currentResult.rows[0];

    if (!current) {
      throw createRepositoryError('SUBMISSION_NOT_FOUND', 'Submission not found');
    }

    if (!allowedPreviousStatuses.includes(current.submissionStatus)) {
      throw createRepositoryError(
        'INVALID_TRANSITION',
        'This submission has already been processed or cannot make that transition',
        { previousStatus: current.submissionStatus }
      );
    }

    await connection.execute(
      `
        UPDATE submissions
        SET
          submission_status = :newStatus,
          approved_at = CASE WHEN :newStatus = 'APPROVED' THEN SYSTIMESTAMP ELSE NULL END,
          updated_at = SYSTIMESTAMP
        WHERE submission_id = :submissionId
      `,
      { newStatus, submissionId }
    );

    const actionResult = await connection.execute(
      `
        INSERT INTO moderation_actions (
          submission_id,
          moderator_user_id,
          action_type,
          previous_status,
          new_status,
          action_note
        ) VALUES (
          :submissionId,
          :moderatorUserId,
          :actionType,
          :previousStatus,
          :newStatus,
          :actionNote
        )
        RETURNING action_id INTO :actionId
      `,
      {
        submissionId,
        moderatorUserId,
        actionType,
        previousStatus: current.submissionStatus,
        newStatus,
        actionNote,
        actionId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      }
    );

    await connection.commit();

    return {
      submissionId,
      previousStatus: current.submissionStatus,
      submissionStatus: newStatus,
      actionId: actionResult.outBinds.actionId[0],
      approvedAtSet: newStatus === 'APPROVED'
    };
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  findPendingSubmissions,
  findSubmissionById,
  findModerationHistory,
  updateSubmissionStatusWithAudit
};
