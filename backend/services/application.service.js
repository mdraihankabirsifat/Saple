const applicationRepository = require('../repositories/application.repository');
const createHttpError = require('../utils/httpError');
const validate = require('../utils/validation');
const { assertCompanyScope, isAdmin } = require('../utils/authorization');

const APPLICATION_STATUSES = [
  'SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'REJECTED', 'WITHDRAWN', 'ACCEPTED'
];

// Who may move an application where. Terminal states accept nothing further,
// which is what keeps a rejected application from silently reopening.
const REVIEWER_TRANSITIONS = Object.freeze({
  UNDER_REVIEW: ['SUBMITTED'],
  SHORTLISTED: ['SUBMITTED', 'UNDER_REVIEW'],
  ACCEPTED: ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED'],
  REJECTED: ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED']
});
const APPLICANT_WITHDRAWABLE_FROM = ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED'];

const REPOSITORY_ERRORS = Object.freeze({
  JOB_NOT_FOUND: 404,
  JOB_NOT_OPEN: 409,
  JOB_EXPIRED: 409,
  ACCOUNT_UNAVAILABLE: 403,
  DUPLICATE_APPLICATION: 409,
  APPLICATION_NOT_FOUND: 404,
  INVALID_TRANSITION: 409
});

function rethrow(error) {
  const status = REPOSITORY_ERRORS[error.sapleCode];
  if (status) throw createHttpError(status, error.message);
  throw error;
}

// The applicant's own view. It never exposes internal reviewer identity.
function toApplicantView(row) {
  return {
    applicationId: row.applicationId,
    jobId: row.jobId,
    jobTitle: row.jobTitle,
    companyId: row.companyId,
    companyName: row.companyName,
    location: row.location,
    employmentType: row.employmentType,
    workMode: row.workMode,
    jobStatus: row.jobStatus,
    applicationDeadline: row.applicationDeadline,
    applicationStatus: row.applicationStatus,
    coverLetter: row.coverLetter,
    submittedAt: row.submittedAt,
    updatedAt: row.updatedAt,
    canWithdraw: APPLICANT_WITHDRAWABLE_FROM.includes(row.applicationStatus)
  };
}

// Administrators and admins-as-reviewers can act on any company; a company
// representative only ever acts inside an ACTIVE assignment.
async function loadApplicationForScope(user, applicationIdValue) {
  const applicationId = validate.positiveId(applicationIdValue, 'application ID');
  const scope = await applicationRepository.findApplicationScope(applicationId);
  if (!scope) throw createHttpError(404, 'Application not found');
  assertCompanyScope(user, scope.companyId);
  return { applicationId, scope };
}

async function applyToJob(user, jobIdValue, input = {}) {
  const jobId = validate.positiveId(jobIdValue, 'job ID');

  // Representatives and administrators manage vacancies; they do not apply
  // through the same workspace, which keeps the two roles visibly separate.
  if (user.role !== 'USER') {
    throw createHttpError(403, 'Only job-seeker accounts can apply to vacancies');
  }

  const coverLetter = validate.requiredParagraph(input.coverLetter, 'Application statement', {
    min: 30,
    max: 4000
  });

  try {
    return await applicationRepository.createApplication({
      jobId,
      applicantUserId: user.userId,
      coverLetter
    });
  } catch (error) {
    return rethrow(error);
  }
}

async function listOwnApplications(user, query = {}) {
  const page = validate.pagination(query, { defaultSize: 20 });
  const [rows, total] = await Promise.all([
    applicationRepository.findApplicationsByApplicant(user.userId, page),
    applicationRepository.countApplicationsByApplicant(user.userId)
  ]);
  return validate.paged(rows.map(toApplicantView), total, page);
}

async function getOwnApplication(user, applicationIdValue) {
  const applicationId = validate.positiveId(applicationIdValue, 'application ID');
  const row = await applicationRepository.findApplicationById(applicationId);
  if (!row) throw createHttpError(404, 'Application not found');
  // Ownership is proven from the authenticated identity, never the request.
  if (row.applicantUserId !== user.userId) {
    throw createHttpError(403, 'You do not have access to this application');
  }
  const history = await applicationRepository.findApplicationHistory(applicationId);
  return { ...toApplicantView(row), history };
}

async function withdrawOwnApplication(user, applicationIdValue) {
  const applicationId = validate.positiveId(applicationIdValue, 'application ID');
  const scope = await applicationRepository.findApplicationScope(applicationId);
  if (!scope) throw createHttpError(404, 'Application not found');
  if (scope.applicantUserId !== user.userId) {
    throw createHttpError(403, 'You do not have access to this application');
  }

  try {
    return await applicationRepository.changeApplicationStatus({
      applicationId,
      actorUserId: user.userId,
      newStatus: 'WITHDRAWN',
      note: null,
      allowedPreviousStatuses: APPLICANT_WITHDRAWABLE_FROM,
      isReviewerDecision: false
    });
  } catch (error) {
    return rethrow(error);
  }
}

async function listScopedApplications(user, query = {}) {
  const jobId = validate.optionalId(query.jobId, 'job ID');
  const status = validate.enumValue(query.status, APPLICATION_STATUSES, 'Status', { required: false });
  const page = validate.pagination(query, { defaultSize: 20 });

  if (jobId !== null) {
    const scope = await applicationRepository.findApplicationsForScope(
      { companyIds: isAdmin(user) ? null : user.representativeCompanyIds, jobId, status },
      { limit: 1, offset: 0 }
    );
    // An out-of-scope job simply yields nothing; no company is enumerable.
    if (scope.length === 0 && !isAdmin(user)) {
      return validate.paged([], 0, page);
    }
  }

  const filters = {
    companyIds: isAdmin(user) ? null : user.representativeCompanyIds,
    jobId,
    status
  };
  const [items, total] = await Promise.all([
    applicationRepository.findApplicationsForScope(filters, page),
    applicationRepository.countApplicationsForScope(filters)
  ]);
  return validate.paged(items, total, page);
}

async function getScopedApplication(user, applicationIdValue) {
  const { applicationId } = await loadApplicationForScope(user, applicationIdValue);
  const row = await applicationRepository.findApplicationById(applicationId);
  if (!row) throw createHttpError(404, 'Application not found');
  const history = await applicationRepository.findApplicationHistory(applicationId);
  return { ...row, history };
}

async function decideApplication(user, applicationIdValue, input = {}) {
  const { applicationId } = await loadApplicationForScope(user, applicationIdValue);
  const newStatus = validate.enumValue(
    input.applicationStatus, Object.keys(REVIEWER_TRANSITIONS), 'Application status'
  );
  const noteRequired = ['REJECTED', 'ACCEPTED'].includes(newStatus);
  const note = noteRequired
    ? validate.requiredParagraph(input.note, 'Decision note', { min: 5, max: 1000 })
    : validate.optionalParagraph(input.note, 'Decision note', { max: 1000 });

  try {
    return await applicationRepository.changeApplicationStatus({
      applicationId,
      actorUserId: user.userId,
      newStatus,
      note,
      allowedPreviousStatuses: REVIEWER_TRANSITIONS[newStatus],
      isReviewerDecision: true
    });
  } catch (error) {
    return rethrow(error);
  }
}

module.exports = {
  APPLICATION_STATUSES,
  REVIEWER_TRANSITIONS,
  APPLICANT_WITHDRAWABLE_FROM,
  applyToJob,
  listOwnApplications,
  getOwnApplication,
  withdrawOwnApplication,
  listScopedApplications,
  getScopedApplication,
  decideApplication
};
