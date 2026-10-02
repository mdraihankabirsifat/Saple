const jobRepository = require('../repositories/job.repository');
const storage = require('../config/supabase-storage');
function withLogo(job) { return { ...job, logoUrl: storage.publicUrl('logo', job.logoPath, job.logoUpdatedAt) }; }
const createHttpError = require('../utils/httpError');
const mlScreening = require('./ml-screening.service');
const validate = require('../utils/validation');
const premiumService = require('./premium.service');
const { assertCompanyScope, isAdmin } = require('../utils/authorization');

const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];
const WORK_MODES = ['ONSITE', 'HYBRID', 'REMOTE'];
// Public list orderings. Each name maps to a fixed ORDER BY in the repository;
// the value from the query string is never placed into SQL.
const PUBLIC_JOB_SORTS = ['POPULAR', 'NEWEST', 'DEADLINE', 'COMPANY'];
const JOB_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'];
const SALARY_PERIODS = ['MONTHLY', 'YEARLY'];
const ACCESS_LEVELS = ['FREE', 'PREMIUM'];
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

// Lifecycle rules live in one place so the route, the service and the
// database CHECK constraints cannot drift apart.
const STATUS_TRANSITIONS = Object.freeze({
  PUBLISHED: ['DRAFT'],
  CLOSED: ['PUBLISHED'],
  ARCHIVED: ['CLOSED'],
  DRAFT: []
});

const REPOSITORY_ERRORS = Object.freeze({
  COMPANY_NOT_FOUND: 404,
  ROLE_NOT_FOUND: 404,
  JOB_NOT_FOUND: 404,
  INVALID_TRANSITION: 409
});

function rethrow(error) {
  const status = REPOSITORY_ERRORS[error.sapleCode];
  if (status) throw createHttpError(status, error.message);
  throw error;
}

function parseJobFilters(query = {}) {
  return {
    companyId: validate.optionalId(query.companyId, 'company ID'),
    roleId: validate.optionalId(query.roleId, 'role ID'),
    location: validate.optionalSearch(query.location, 'Location'),
    workMode: validate.enumValue(query.workMode, WORK_MODES, 'Work mode', { required: false }),
    employmentType: validate.enumValue(
      query.employmentType, EMPLOYMENT_TYPES, 'Employment type', { required: false }
    ),
    search: validate.optionalSearch(query.search)
  };
}

// Who may see a Premium vacancy in full: Premium members (paid or trial),
// administrators, and representatives of the company that owns it.
function premiumJobAccess(viewer) {
  let premium;
  return async (job) => {
    if (job.accessLevel !== 'PREMIUM') return true;
    if (!viewer) return false;
    if (viewer.role === 'ADMIN') return true;
    if ((viewer.representativeCompanyIds || []).map(Number).includes(Number(job.companyId))) return true;
    if (premium === undefined) premium = await premiumService.hasPremium(viewer.userId);
    return premium;
  };
}

// What a free or anonymous visitor sees of a Premium vacancy: enough to know
// it exists, nothing of its content or pay.
function premiumTeaser(job) {
  return {
    jobId: job.jobId,
    companyId: job.companyId,
    companyName: job.companyName,
    industry: job.industry,
    title: job.title,
    location: job.location,
    workMode: job.workMode,
    employmentType: job.employmentType,
    publishedAt: job.publishedAt,
    logoUrl: job.logoUrl,
    accessLevel: 'PREMIUM',
    locked: true
  };
}

async function listPublicJobs(query = {}, viewer = null) {
  const filters = parseJobFilters(query);
  const page = validate.pagination(query);
  const sort = validate.enumValue(query.sort, PUBLIC_JOB_SORTS, 'Sort', { required: false }) || 'POPULAR';

  const [items, total] = await Promise.all([
    jobRepository.findPublicJobs(filters, { ...page, sort }),
    jobRepository.countPublicJobs(filters)
  ]);
  const canSee = premiumJobAccess(viewer);
  const visible = [];
  for (const job of items.map(withLogo)) {
    visible.push(await canSee(job) ? { ...job, locked: false } : premiumTeaser(job));
  }
  return validate.paged(visible, total, page);
}

async function getPublicJob(jobIdValue, viewer = null) {
  const jobId = validate.positiveId(jobIdValue, 'job ID');
  const job = await jobRepository.findPublicJobById(jobId);
  // A draft, closed, archived or expired vacancy is indistinguishable from a
  // vacancy that never existed, which is exactly what a public caller should see.
  if (!job) throw createHttpError(404, 'Job posting not found');
  const full = withLogo(job);
  return await premiumJobAccess(viewer)(full) ? { ...full, locked: false } : premiumTeaser(full);
}

async function getPublicJobFilterOptions() {
  return jobRepository.findPublicJobFilterOptions();
}

async function getPublicCounts() {
  return jobRepository.findPublicCounts();
}

function parseJobInput(input = {}) {
  const salaryMin = validate.optionalMoney(input.salaryMin, 'Minimum salary');
  const salaryMax = validate.optionalMoney(input.salaryMax, 'Maximum salary');
  const hasSalary = salaryMin !== null || salaryMax !== null;

  if (hasSalary && (salaryMin === null || salaryMax === null)) {
    throw createHttpError(400, 'Provide both a minimum and a maximum salary, or neither');
  }
  if (hasSalary && salaryMax < salaryMin) {
    throw createHttpError(400, 'Maximum salary must not be lower than the minimum salary');
  }

  let salaryCurrency = null;
  let salaryPeriod = null;
  if (hasSalary) {
    salaryCurrency = String(input.salaryCurrency || 'BDT').trim().toUpperCase();
    if (!CURRENCY_PATTERN.test(salaryCurrency)) {
      throw createHttpError(400, 'Salary currency must be a three-letter code such as BDT');
    }
    salaryPeriod = validate.enumValue(input.salaryPeriod || 'MONTHLY', SALARY_PERIODS, 'Salary period');
  }

  return {
    roleId: validate.optionalId(input.roleId, 'role ID'),
    title: validate.requiredText(input.title, 'Job title', { min: 4, max: 160 }),
    description: validate.requiredParagraph(input.description, 'Job description', {
      min: 20,
      max: 6000
    }),
    requirements: validate.optionalParagraph(input.requirements, 'Requirements', { max: 4000 }),
    location: validate.requiredText(input.location, 'Location', { min: 2, max: 120 }),
    employmentType: validate.enumValue(input.employmentType, EMPLOYMENT_TYPES, 'Employment type'),
    workMode: validate.enumValue(input.workMode, WORK_MODES, 'Work mode'),
    salaryMin,
    salaryMax,
    salaryCurrency,
    salaryPeriod,
    applicationDeadline: validate.isoDate(input.applicationDeadline, 'Application deadline', {
      allowPast: false
    }),
    // FREE unless the representative chooses a Premium-only vacancy.
    accessLevel: validate.enumValue(input.accessLevel || 'FREE', ACCESS_LEVELS, 'Access level')
  };
}

// The owning company comes from the caller's proven scope, never the body.
async function createJob(user, companyIdValue, input = {}) {
  const companyId = validate.positiveId(companyIdValue, 'company ID');
  assertCompanyScope(user, companyId);

  const parsed = parseJobInput(input);
  const jobStatus = validate.enumValue(
    input.jobStatus || 'DRAFT', ['DRAFT', 'PUBLISHED'], 'Job status'
  );
  const assignment = user.representativeScopes?.find((scope) => scope.companyId === companyId);
  const screening = mlScreening.enabled() ? await mlScreening.screen('JOB', {
    title: parsed.title, description: parsed.description, requirements: parsed.requirements,
    location: parsed.location, employmentType: parsed.employmentType, workMode: parsed.workMode,
    salaryMin: parsed.salaryMin, salaryMax: parsed.salaryMax, accessLevel: parsed.accessLevel
  }) : null;
  // A held or unavailable screening must never make a newly requested
  // publication public. It remains a draft until an authorized human
  // publishes it. Shadow mode also stays held by design.
  const effectiveJobStatus = screening && screening.publicationState !== 'PROVISIONAL'
    ? 'DRAFT' : jobStatus;

  try {
    return await jobRepository.createJob({
      ...parsed,
      companyId,
      createdByUserId: user.userId,
      assignmentId: assignment?.assignmentId ?? null,
      jobStatus: effectiveJobStatus, screening
    });
  } catch (error) {
    return rethrow(error);
  }
}

async function loadScopedJob(user, jobIdValue) {
  const jobId = validate.positiveId(jobIdValue, 'job ID');
  const scope = await jobRepository.findJobScope(jobId);
  if (!scope) throw createHttpError(404, 'Job posting not found');
  assertCompanyScope(user, scope.companyId);
  return { jobId, scope };
}

async function getManagedJob(user, jobIdValue) {
  const { jobId } = await loadScopedJob(user, jobIdValue);
  const job = await jobRepository.findManagedJobById(jobId);
  if (!job) throw createHttpError(404, 'Job posting not found');
  return job;
}

async function listManagedJobs(user, query = {}) {
  const status = validate.enumValue(query.status, JOB_STATUSES, 'Status', { required: false });
  const search = validate.optionalSearch(query.search);
  const page = validate.pagination(query, { defaultSize: 20 });
  const requestedCompanyId = validate.optionalId(query.companyId, 'company ID');

  // Administrators see every company; a representative is silently confined to
  // the companies PostgreSQL says are still assigned to them.
  const filters = isAdmin(user)
    ? { companyIds: null, companyId: requestedCompanyId, status, search }
    : { companyIds: user.representativeCompanyIds, companyId: requestedCompanyId, status, search };

  if (!isAdmin(user) && requestedCompanyId !== null) {
    assertCompanyScope(user, requestedCompanyId);
  }

  const [items, total] = await Promise.all([
    jobRepository.findManagedJobs(filters, page),
    jobRepository.countManagedJobs(filters)
  ]);
  return validate.paged(items, total, page);
}

async function updateJob(user, jobIdValue, input = {}) {
  const { jobId } = await loadScopedJob(user, jobIdValue);
  const parsed = parseJobInput(input);
  if (input.accessLevel === undefined || input.accessLevel === null || input.accessLevel === '') {
    // An edit that does not mention access keeps the vacancy's current level.
    const current = await jobRepository.findManagedJobById(jobId);
    parsed.accessLevel = current?.accessLevel || 'FREE';
  }

  try {
    return await jobRepository.updateJob(jobId, parsed);
  } catch (error) {
    return rethrow(error);
  }
}

async function changeJobStatus(user, jobIdValue, input = {}) {
  const { jobId } = await loadScopedJob(user, jobIdValue);
  const newStatus = validate.enumValue(input.jobStatus, ['PUBLISHED', 'CLOSED', 'ARCHIVED'], 'Job status');
  const allowedPreviousStatuses = STATUS_TRANSITIONS[newStatus];
  const actorIsAdmin = user.accountRole === 'ADMIN';
  const auditReason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (actorIsAdmin && newStatus === 'CLOSED' && (!auditReason || auditReason.length > 1000)) {
    throw createHttpError(400, 'An administrator reason is required to close a vacancy');
  }

  try {
    return await jobRepository.changeJobStatus({
      jobId,
      actorUserId: user.userId,
      newStatus,
      allowedPreviousStatuses,
      actorIsAdmin,
      auditReason
    });
  } catch (error) {
    return rethrow(error);
  }
}

module.exports = {
  EMPLOYMENT_TYPES,
  WORK_MODES,
  JOB_STATUSES,
  STATUS_TRANSITIONS,
  listPublicJobs,
  getPublicJob,
  getPublicJobFilterOptions,
  getPublicCounts,
  createJob,
  getManagedJob,
  listManagedJobs,
  updateJob,
  changeJobStatus
};
