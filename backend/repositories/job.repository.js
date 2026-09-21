const database = require('../config/database');
const { insertNotification } = require('./notification.repository');

function repositoryError(code, message) {
  const error = new Error(message);
  error.sapleCode = code;
  return error;
}

// Public reads go through the view, which already excludes DRAFT, CLOSED,
// ARCHIVED and expired rows. No public query touches job_postings directly.
const PUBLIC_JOB_COLUMNS = `
  job_id AS "jobId", company_id AS "companyId", company_name AS "companyName",
  industry, role_id AS "roleId", role_name AS "roleName",
  role_category AS "roleCategory", title, location,
  employment_type AS "employmentType", work_mode AS "workMode",
  salary_min AS "salaryMin", salary_max AS "salaryMax",
  salary_currency AS "salaryCurrency", salary_period AS "salaryPeriod",
  application_deadline AS "applicationDeadline", published_at AS "publishedAt"
`;

const PUBLIC_JOB_FILTER = `
  WHERE ($1::bigint IS NULL OR company_id = $1)
    AND ($2::bigint IS NULL OR role_id = $2)
    AND ($3::varchar IS NULL OR LOWER(location) LIKE '%' || LOWER($3) || '%')
    AND ($4::varchar IS NULL OR work_mode = $4)
    AND ($5::varchar IS NULL OR employment_type = $5)
    AND ($6::varchar IS NULL
      OR LOWER(title) LIKE '%' || LOWER($6) || '%'
      OR LOWER(company_name) LIKE '%' || LOWER($6) || '%'
      OR LOWER(COALESCE(role_name, '')) LIKE '%' || LOWER($6) || '%')
`;

function publicFilterValues(filters) {
  return [
    filters.companyId ?? null,
    filters.roleId ?? null,
    filters.location ?? null,
    filters.workMode ?? null,
    filters.employmentType ?? null,
    filters.search ?? null
  ];
}

async function findPublicJobs(filters, { limit, offset }) {
  const result = await database.query(`
    SELECT ${PUBLIC_JOB_COLUMNS}
    FROM vw_public_open_jobs
    ${PUBLIC_JOB_FILTER}
    ORDER BY published_at DESC, job_id DESC
    LIMIT $7 OFFSET $8
  `, [...publicFilterValues(filters), limit, offset]);
  return result.rows;
}

async function countPublicJobs(filters) {
  const result = await database.query(`
    SELECT COUNT(*)::int AS "total"
    FROM vw_public_open_jobs
    ${PUBLIC_JOB_FILTER}
  `, publicFilterValues(filters));
  return result.rows[0].total;
}

async function findPublicJobById(jobId) {
  const result = await database.query(`
    SELECT ${PUBLIC_JOB_COLUMNS}, description, requirements
    FROM vw_public_open_jobs
    WHERE job_id = $1
  `, [jobId]);
  return result.rows[0] || null;
}

async function findPublicJobFilterOptions() {
  const [companies, roles, locations] = await Promise.all([
    database.query(`
      SELECT DISTINCT company_id AS "companyId", company_name AS "companyName"
      FROM vw_public_open_jobs ORDER BY company_name
    `),
    database.query(`
      SELECT DISTINCT role_id AS "roleId", role_name AS "roleName",
        role_category AS "roleCategory"
      FROM vw_public_open_jobs WHERE role_id IS NOT NULL ORDER BY role_name
    `),
    database.query(`
      SELECT DISTINCT location FROM vw_public_open_jobs ORDER BY location
    `)
  ]);
  return {
    companies: companies.rows,
    roles: roles.rows,
    locations: locations.rows.map((row) => row.location),
    workModes: ['ONSITE', 'HYBRID', 'REMOTE'],
    employmentTypes: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']
  };
}

// Managed reads include every lifecycle state, so they are only ever called
// after the caller's company scope has been proven.
const MANAGED_JOB_SELECT = `
  SELECT jp.job_id AS "jobId", jp.company_id AS "companyId",
    c.company_name AS "companyName", jp.role_id AS "roleId",
    jr.role_name AS "roleName", jp.title, jp.description, jp.requirements,
    jp.location, jp.employment_type AS "employmentType",
    jp.work_mode AS "workMode", jp.salary_min AS "salaryMin",
    jp.salary_max AS "salaryMax", jp.salary_currency AS "salaryCurrency",
    jp.salary_period AS "salaryPeriod",
    jp.application_deadline AS "applicationDeadline",
    jp.job_status AS "jobStatus", jp.published_at AS "publishedAt",
    jp.closed_at AS "closedAt", jp.created_at AS "createdAt",
    jp.updated_at AS "updatedAt", jp.created_by_user_id AS "createdByUserId",
    creator.full_name AS "createdByName",
    (SELECT COUNT(*)::int FROM job_applications ja WHERE ja.job_id = jp.job_id)
      AS "applicationCount"
  FROM job_postings jp
  JOIN companies c ON c.company_id = jp.company_id
  JOIN users creator ON creator.user_id = jp.created_by_user_id
  LEFT JOIN job_roles jr ON jr.role_id = jp.role_id
`;

// Scope check only: the caller decides what to do with the owning company.
async function findJobScope(jobId) {
  const result = await database.query(`
    SELECT job_id AS "jobId", company_id AS "companyId",
      job_status AS "jobStatus", application_deadline AS "applicationDeadline"
    FROM job_postings WHERE job_id = $1
  `, [jobId]);
  return result.rows[0] || null;
}

async function findManagedJobById(jobId) {
  const result = await database.query(`${MANAGED_JOB_SELECT} WHERE jp.job_id = $1`, [jobId]);
  return result.rows[0] || null;
}

const MANAGED_JOB_FILTER = `
  WHERE ($1::bigint[] IS NULL OR jp.company_id = ANY($1))
    AND ($2::bigint IS NULL OR jp.company_id = $2)
    AND ($3::varchar IS NULL OR jp.job_status = $3)
    AND ($4::varchar IS NULL
      OR LOWER(jp.title) LIKE '%' || LOWER($4) || '%'
      OR LOWER(c.company_name) LIKE '%' || LOWER($4) || '%')
`;

function managedFilterValues({ companyIds = null, companyId = null, status = null, search = null }) {
  return [companyIds, companyId, status, search];
}

async function findManagedJobs(filters, { limit, offset }) {
  const result = await database.query(`
    ${MANAGED_JOB_SELECT}
    ${MANAGED_JOB_FILTER}
    ORDER BY jp.updated_at DESC, jp.job_id DESC
    LIMIT $5 OFFSET $6
  `, [...managedFilterValues(filters), limit, offset]);
  return result.rows;
}

async function countManagedJobs(filters) {
  const result = await database.query(`
    SELECT COUNT(*)::int AS "total"
    FROM job_postings jp
    JOIN companies c ON c.company_id = jp.company_id
    ${MANAGED_JOB_FILTER}
  `, managedFilterValues(filters));
  return result.rows[0].total;
}

// The company and assignment come from the proven scope, never from the body.
async function createJob(input) {
  const client = await database.getClient();

  try {
    await client.query('BEGIN');
    const companyResult = await client.query(
      'SELECT company_id AS "companyId" FROM companies WHERE company_id = $1',
      [input.companyId]
    );
    if (!companyResult.rows[0]) throw repositoryError('COMPANY_NOT_FOUND', 'Company not found');

    if (input.roleId !== null) {
      const roleResult = await client.query(
        'SELECT role_id AS "roleId" FROM job_roles WHERE role_id = $1',
        [input.roleId]
      );
      if (!roleResult.rows[0]) throw repositoryError('ROLE_NOT_FOUND', 'Job role not found');
    }

    const result = await client.query(`
      INSERT INTO job_postings (
        company_id, created_by_user_id, created_by_assignment_id, role_id,
        title, description, requirements, location, employment_type, work_mode,
        salary_min, salary_max, salary_currency, salary_period,
        application_deadline, job_status, published_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::varchar,
        CASE WHEN $16::varchar = 'PUBLISHED' THEN CURRENT_TIMESTAMP ELSE NULL END
      )
      RETURNING job_id AS "jobId", job_status AS "jobStatus"
    `, [
      input.companyId, input.createdByUserId, input.assignmentId, input.roleId,
      input.title, input.description, input.requirements, input.location,
      input.employmentType, input.workMode, input.salaryMin, input.salaryMax,
      input.salaryCurrency, input.salaryPeriod, input.applicationDeadline, input.jobStatus
    ]);

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Only DRAFT and PUBLISHED content is editable. Closed and archived vacancies
// are frozen so applicants cannot have applied to different wording.
async function updateJob(jobId, input) {
  const client = await database.getClient();

  try {
    await client.query('BEGIN');
    const currentResult = await client.query(`
      SELECT job_status AS "jobStatus" FROM job_postings
      WHERE job_id = $1 FOR UPDATE
    `, [jobId]);
    const current = currentResult.rows[0];
    if (!current) throw repositoryError('JOB_NOT_FOUND', 'Job posting not found');
    if (!['DRAFT', 'PUBLISHED'].includes(current.jobStatus)) {
      throw repositoryError('INVALID_TRANSITION', 'Closed and archived vacancies cannot be edited');
    }

    if (input.roleId !== null) {
      const roleResult = await client.query(
        'SELECT role_id AS "roleId" FROM job_roles WHERE role_id = $1',
        [input.roleId]
      );
      if (!roleResult.rows[0]) throw repositoryError('ROLE_NOT_FOUND', 'Job role not found');
    }

    await client.query(`
      UPDATE job_postings SET
        role_id = $1, title = $2, description = $3, requirements = $4,
        location = $5, employment_type = $6, work_mode = $7,
        salary_min = $8, salary_max = $9, salary_currency = $10,
        salary_period = $11, application_deadline = $12,
        updated_at = CURRENT_TIMESTAMP
      WHERE job_id = $13
    `, [
      input.roleId, input.title, input.description, input.requirements,
      input.location, input.employmentType, input.workMode,
      input.salaryMin, input.salaryMax, input.salaryCurrency,
      input.salaryPeriod, input.applicationDeadline, jobId
    ]);

    await client.query('COMMIT');
    return { jobId, jobStatus: current.jobStatus };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Closing or archiving never deletes applications. Open applicants are told
// in the same transaction that produced the closure.
async function changeJobStatus({ jobId, actorUserId, newStatus, allowedPreviousStatuses }) {
  const client = await database.getClient();

  try {
    await client.query('BEGIN');
    const currentResult = await client.query(`
      SELECT jp.job_id AS "jobId", jp.job_status AS "jobStatus", jp.title,
        c.company_name AS "companyName"
      FROM job_postings jp
      JOIN companies c ON c.company_id = jp.company_id
      WHERE jp.job_id = $1
      FOR UPDATE OF jp
    `, [jobId]);
    const current = currentResult.rows[0];
    if (!current) throw repositoryError('JOB_NOT_FOUND', 'Job posting not found');
    if (!allowedPreviousStatuses.includes(current.jobStatus)) {
      throw repositoryError('INVALID_TRANSITION', 'This vacancy cannot make that transition');
    }

    await client.query(`
      UPDATE job_postings SET
        job_status = $1::varchar,
        published_at = CASE
          WHEN $1::varchar = 'DRAFT' THEN NULL
          WHEN published_at IS NULL THEN CURRENT_TIMESTAMP
          ELSE published_at END,
        closed_at = CASE
          WHEN $1::varchar IN ('CLOSED', 'ARCHIVED') THEN COALESCE(closed_at, CURRENT_TIMESTAMP)
          ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
      WHERE job_id = $2
    `, [newStatus, jobId]);

    let notifiedCount = 0;
    if (newStatus === 'CLOSED') {
      const openApplicants = await client.query(`
        SELECT application_id AS "applicationId", applicant_user_id AS "applicantUserId"
        FROM job_applications
        WHERE job_id = $1
          AND application_status IN ('SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED')
      `, [jobId]);

      for (const application of openApplicants.rows) {
        await insertNotification(client, {
          userId: application.applicantUserId,
          notificationType: 'JOB_CLOSED',
          title: 'A vacancy you applied to has closed',
          message: `${current.companyName} closed the vacancy "${current.title}". Your application stays in your history.`
            .replace(/[<>]/g, ''),
          relatedEntityType: 'APPLICATION',
          relatedEntityId: application.applicationId
        });
        notifiedCount += 1;
      }
    }

    await client.query('COMMIT');
    return {
      jobId,
      previousStatus: current.jobStatus,
      jobStatus: newStatus,
      notifiedApplicantCount: notifiedCount
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Public homepage counters. Aggregates stay derived, never stored.
async function findPublicCounts() {
  const result = await database.query(`
    SELECT
      (SELECT COUNT(*)::int FROM vw_public_companies) AS "companyCount",
      (SELECT COUNT(*)::int FROM submissions WHERE submission_status = 'APPROVED')
        AS "approvedInsightCount",
      (SELECT COUNT(*)::int FROM vw_public_open_jobs) AS "openJobCount",
      (SELECT COUNT(*)::int FROM vw_public_approved_reviews) AS "approvedReviewCount"
  `);
  return result.rows[0];
}

module.exports = {
  findPublicJobs,
  countPublicJobs,
  findPublicJobById,
  findPublicJobFilterOptions,
  findJobScope,
  findManagedJobById,
  findManagedJobs,
  countManagedJobs,
  createJob,
  updateJob,
  changeJobStatus,
  findPublicCounts
};
