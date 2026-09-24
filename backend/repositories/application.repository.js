const database = require('../config/database');
const { insertNotification } = require('./notification.repository');

function repositoryError(code, message) {
  const error = new Error(message);
  error.sapleCode = code;
  return error;
}

// The applicant identity is always the authenticated account. Nothing in the
// request body can name a different applicant.
const APPLICATION_SELECT = `
  SELECT ja.application_id AS "applicationId", ja.job_id AS "jobId",
    ja.applicant_user_id AS "applicantUserId", ja.cover_letter AS "coverLetter",
    ja.application_status AS "applicationStatus",
    ja.submitted_at AS "submittedAt", ja.updated_at AS "updatedAt",
    ja.reviewed_at AS "reviewedAt",
    jp.company_id AS "companyId", c.company_name AS "companyName",
    jp.title AS "jobTitle", jp.location, jp.job_status AS "jobStatus",
    jp.application_deadline AS "applicationDeadline",
    jp.employment_type AS "employmentType", jp.work_mode AS "workMode"
  FROM job_applications ja
  JOIN job_postings jp ON jp.job_id = ja.job_id
  JOIN companies c ON c.company_id = jp.company_id
`;

async function findApplicationScope(applicationId) {
  const result = await database.query(`
    SELECT ja.application_id AS "applicationId", ja.job_id AS "jobId",
      ja.applicant_user_id AS "applicantUserId",
      ja.application_status AS "applicationStatus", jp.company_id AS "companyId"
    FROM job_applications ja
    JOIN job_postings jp ON jp.job_id = ja.job_id
    WHERE ja.application_id = $1
  `, [applicationId]);
  return result.rows[0] || null;
}

async function findApplicationById(applicationId) {
  const result = await database.query(
    `${APPLICATION_SELECT} WHERE ja.application_id = $1`,
    [applicationId]
  );
  return result.rows[0] || null;
}

async function findApplicationsByApplicant(userId, { limit, offset }) {
  const result = await database.query(`
    ${APPLICATION_SELECT}
    WHERE ja.applicant_user_id = $1
    ORDER BY ja.submitted_at DESC, ja.application_id DESC
    LIMIT $2 OFFSET $3
  `, [userId, limit, offset]);
  return result.rows;
}

async function countApplicationsByApplicant(userId) {
  const result = await database.query(`
    SELECT COUNT(*)::int AS "total" FROM job_applications WHERE applicant_user_id = $1
  `, [userId]);
  return result.rows[0].total;
}

// Applicant identity is included here because a representative reviewing an
// application for their own company legitimately needs to know who applied.
const SCOPED_APPLICATION_SELECT = `
  SELECT ja.application_id AS "applicationId", ja.job_id AS "jobId",
    ja.applicant_user_id AS "applicantUserId", applicant.full_name AS "applicantName",
    applicant.email AS "applicantEmail", ja.cover_letter AS "coverLetter",
    ja.application_status AS "applicationStatus",
    ja.submitted_at AS "submittedAt", ja.updated_at AS "updatedAt",
    ja.reviewed_at AS "reviewedAt", jp.company_id AS "companyId",
    c.company_name AS "companyName", jp.title AS "jobTitle",
    jp.job_status AS "jobStatus"
  FROM job_applications ja
  JOIN job_postings jp ON jp.job_id = ja.job_id
  JOIN companies c ON c.company_id = jp.company_id
  JOIN users applicant ON applicant.user_id = ja.applicant_user_id
`;

const SCOPED_APPLICATION_FILTER = `
  WHERE ($1::bigint[] IS NULL OR jp.company_id = ANY($1))
    AND ($2::bigint IS NULL OR ja.job_id = $2)
    AND ($3::varchar IS NULL OR ja.application_status = $3)
`;

async function findApplicationsForScope({ companyIds = null, jobId = null, status = null }, { limit, offset }) {
  const result = await database.query(`
    ${SCOPED_APPLICATION_SELECT}
    ${SCOPED_APPLICATION_FILTER}
    ORDER BY ja.submitted_at DESC, ja.application_id DESC
    LIMIT $4 OFFSET $5
  `, [companyIds, jobId, status, limit, offset]);
  return result.rows;
}

async function countApplicationsForScope({ companyIds = null, jobId = null, status = null }) {
  const result = await database.query(`
    SELECT COUNT(*)::int AS "total"
    FROM job_applications ja
    JOIN job_postings jp ON jp.job_id = ja.job_id
    JOIN companies c ON c.company_id = jp.company_id
    JOIN users applicant ON applicant.user_id = ja.applicant_user_id
    ${SCOPED_APPLICATION_FILTER}
  `, [companyIds, jobId, status]);
  return result.rows[0].total;
}

async function findApplicationHistory(applicationId) {
  const result = await database.query(`
    SELECT h.history_id AS "historyId", h.previous_status AS "previousStatus",
      h.new_status AS "newStatus", h.action_note AS "actionNote",
      h.action_at AS "actionAt", u.full_name AS "actorName"
    FROM job_application_status_history h
    JOIN users u ON u.user_id = h.actor_user_id
    WHERE h.application_id = $1
    ORDER BY h.action_at ASC, h.history_id ASC
  `, [applicationId]);
  return result.rows;
}

// Eligibility is re-checked inside the transaction: the vacancy must still be
// published and inside its deadline at the moment the row is written.
async function createApplication({ jobId, applicantUserId, coverLetter }) {
  const client = await database.getClient();

  try {
    await client.query('BEGIN');
    const jobResult = await client.query(`
      SELECT jp.job_id AS "jobId", jp.job_status AS "jobStatus", jp.title,
        jp.company_id AS "companyId", c.company_name AS "companyName",
        (jp.application_deadline < CURRENT_DATE) AS "isExpired"
      FROM job_postings jp
      JOIN companies c ON c.company_id = jp.company_id
      WHERE jp.job_id = $1
      FOR UPDATE OF jp
    `, [jobId]);
    const job = jobResult.rows[0];
    if (!job) throw repositoryError('JOB_NOT_FOUND', 'Job posting not found');
    if (job.jobStatus !== 'PUBLISHED') {
      throw repositoryError('JOB_NOT_OPEN', 'This vacancy is not open for applications');
    }
    if (job.isExpired) {
      throw repositoryError('JOB_EXPIRED', 'The application deadline for this vacancy has passed');
    }

    const accountResult = await client.query(`
      SELECT account_role AS "accountRole", account_status AS "accountStatus"
      FROM users WHERE user_id = $1
    `, [applicantUserId]);
    const account = accountResult.rows[0];
    if (!account || account.accountStatus !== 'ACTIVE') {
      throw repositoryError('ACCOUNT_UNAVAILABLE', 'This account cannot apply to vacancies');
    }

    let applicationId;
    try {
      const insertResult = await client.query(`
        INSERT INTO job_applications (job_id, applicant_user_id, cover_letter, application_status)
        VALUES ($1, $2, $3, 'SUBMITTED')
        RETURNING application_id AS "applicationId"
      `, [jobId, applicantUserId, coverLetter]);
      applicationId = insertResult.rows[0].applicationId;
    } catch (error) {
      if (error.code === '23505') {
        throw repositoryError('DUPLICATE_APPLICATION', 'You have already applied to this vacancy');
      }
      throw error;
    }

    await client.query(`
      INSERT INTO job_application_status_history (
        application_id, actor_user_id, previous_status, new_status, action_note
      ) VALUES ($1, $2, NULL, 'SUBMITTED', NULL)
    `, [applicationId, applicantUserId]);

    const safeTitle = String(job.title).replace(/[<>]/g, '');
    await insertNotification(client, {
      userId: applicantUserId,
      notificationType: 'APPLICATION_STATUS',
      title: 'Application submitted',
      message: `Your application for ${safeTitle} was received and is now SUBMITTED.`,
      relatedEntityType: 'APPLICATION',
      relatedEntityId: applicationId
    });

    // Every active representative of the owning company is told, because a
    // company may legitimately have more than one.
    const representatives = await client.query(`
      SELECT cr.user_id AS "userId"
      FROM company_representatives cr
      JOIN users u ON u.user_id = cr.user_id
      WHERE cr.company_id = $1 AND cr.assignment_status = 'ACTIVE'
        AND u.account_status = 'ACTIVE'
    `, [job.companyId]);

    for (const representative of representatives.rows) {
      await insertNotification(client, {
        userId: representative.userId,
        notificationType: 'APPLICATION_RECEIVED',
        title: 'New application received',
        message: `A new application arrived for ${safeTitle}.`,
        relatedEntityType: 'APPLICATION',
        relatedEntityId: applicationId
      });
    }

    await client.query('COMMIT');
    return { applicationId, applicationStatus: 'SUBMITTED', jobId, companyId: job.companyId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// One transaction: application row, immutable history and applicant notice.
const PROCEDURE_ERRORS = Object.freeze({
  SA001: ['APPLICATION_NOT_FOUND', 'Application not found'],
  SA002: ['INVALID_TRANSITION', 'This application cannot make that transition']
});

function translateDecisionError(error) {
  const known = PROCEDURE_ERRORS[error?.code];
  return known ? repositoryError(known[0], known[1]) : error;
}

async function changeApplicationStatus({
  applicationId, actorUserId, newStatus, note, allowedPreviousStatuses, isReviewerDecision
}) {
  const client = await database.getClient();

  try {
    await client.query('BEGIN');

    // One CALL does the two-table part of the decision: it locks the
    // application row, rejects a transition the caller's role may not make,
    // updates job_applications and writes job_application_status_history.
    // The procedure never commits, so the notification below still belongs to
    // this transaction.
    const decision = await client.query(`
      CALL saple_apply_application_decision(
        $1::bigint, $2::bigint, $3::varchar, $4::text, $5::varchar[], $6::boolean,
        NULL, NULL, NULL, NULL
      )
    `, [
      applicationId, actorUserId, newStatus, note ?? null,
      allowedPreviousStatuses, Boolean(isReviewerDecision)
    ]);
    const current = decision.rows[0];

    // The applicant is always told, including when they withdrew themselves,
    // so their own history stays complete. Internal notes are never included.
    const safeTitle = String(current.io_job_title).replace(/[<>]/g, '');
    await insertNotification(client, {
      userId: current.io_applicant_user_id,
      notificationType: 'APPLICATION_STATUS',
      title: 'Application status updated',
      message: `Your application for ${safeTitle} is now ${newStatus}.`,
      relatedEntityType: 'APPLICATION',
      relatedEntityId: applicationId
    });

    await client.query('COMMIT');
    return {
      applicationId,
      previousStatus: current.io_previous_status,
      applicationStatus: newStatus,
      historyId: current.io_history_id
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw translateDecisionError(error);
  } finally {
    client.release();
  }
}

module.exports = {
  findApplicationScope,
  findApplicationById,
  findApplicationsByApplicant,
  countApplicationsByApplicant,
  findApplicationsForScope,
  countApplicationsForScope,
  findApplicationHistory,
  createApplication,
  changeApplicationStatus
};
