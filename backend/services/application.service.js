const crypto = require('node:crypto');
const applicationRepository = require('../repositories/application.repository');
const { MAX_RESUME_BYTES } = require('../middleware/resumeUpload');
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
  INVALID_TRANSITION: 409,
  PREMIUM_REQUIRED: 403
});

function rethrow(error) {
  const status = REPOSITORY_ERRORS[error.sapleCode];
  if (status) {
    const httpError = createHttpError(status, error.message);
    if (error.sapleCode === 'PREMIUM_REQUIRED') httpError.sapleCode = 'PREMIUM_REQUIRED';
    throw httpError;
  }
  throw error;
}

// A safe display name for the PDF: no path, no control or header characters,
// plain ASCII, ending in .pdf and at most 255 characters. It is never used as a
// file system path; the file itself lives in PostgreSQL.
function sanitizeResumeName(value) {
  const base = String(value || '').split(/[\\/]/).pop()
    .normalize('NFKD').replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, '_').replace(/[^A-Za-z0-9._()-]/g, '');
  const stem = base.replace(/\.pdf$/i, '').replace(/^[._-]+/, '').slice(0, 240);
  return `${stem || 'resume'}.pdf`;
}

// The upload is checked again here, independently of the browser and the
// upload middleware: one PDF, at most 2 MB, named .pdf, typed application/pdf
// and starting with the %PDF- signature. Nothing is rendered or executed.
function validateResume(file) {
  if (!file) return null;
  const buffer = file.buffer;
  if (file.fieldname !== 'resume') throw createHttpError(400, 'Attach one PDF resume in the resume field only.');
  if (!buffer || buffer.length === 0 || file.size === 0) throw createHttpError(400, 'The selected file is not a valid PDF.');
  if (buffer.length > MAX_RESUME_BYTES) throw createHttpError(413, 'Resume must be 2 MB or smaller.');
  if (file.mimetype !== 'application/pdf' || !/\.pdf$/i.test(String(file.originalname || ''))) {
    throw createHttpError(400, 'Only PDF resumes are supported.');
  }
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw createHttpError(400, 'The selected file is not a valid PDF.');
  return {
    buffer,
    fileName: sanitizeResumeName(file.originalname),
    mimeType: 'application/pdf',
    size: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex')
  };
}

function resumeDisposition(value) {
  if (value === undefined || value === null || value === '' || value === 'attachment') return 'attachment';
  if (value === 'inline') return 'inline';
  throw createHttpError(400, 'Disposition must be inline or attachment.');
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
    canWithdraw: APPLICANT_WITHDRAWABLE_FROM.includes(row.applicationStatus),
    resumeAttached: row.resumeAttached === true,
    resumeFileName: row.resumeFileName || null,
    resumeFileSizeBytes: row.resumeFileSizeBytes ?? null
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

async function applyToJob(user, jobIdValue, input = {}, file = null) {
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
  const resume = validateResume(file);

  // A Premium vacancy's access check runs inside the application transaction
  // (application.repository.createApplication), where the job row is locked.
  try {
    return await applicationRepository.createApplication({
      jobId,
      applicantUserId: user.userId,
      coverLetter,
      resume
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

// The applicant may read their own attached resume, and nobody else's.
async function getOwnResume(user, applicationIdValue) {
  const applicationId = validate.positiveId(applicationIdValue, 'application ID');
  const scope = await applicationRepository.findApplicationScope(applicationId);
  if (!scope) throw createHttpError(404, 'Resume not found.');
  if (scope.applicantUserId !== user.userId) throw createHttpError(403, 'You do not have access to this resume.');
  const resume = await applicationRepository.findResume(applicationId);
  if (!resume) throw createHttpError(404, 'Resume not found.');
  return resume;
}

// Representatives read a resume only for an application to a job of a
// company they actively represent. Ownership is resolved application -> job
// -> company in the database; nothing from the browser is trusted.
async function getScopedResume(user, applicationIdValue) {
  const { applicationId } = await loadApplicationForScope(user, applicationIdValue);
  const resume = await applicationRepository.findResume(applicationId);
  if (!resume) throw createHttpError(404, 'Resume not found.');
  return resume;
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
  sanitizeResumeName,
  validateResume,
  resumeDisposition,
  getOwnResume,
  getScopedResume,
  applyToJob,
  listOwnApplications,
  getOwnApplication,
  withdrawOwnApplication,
  listScopedApplications,
  getScopedApplication,
  decideApplication
};
