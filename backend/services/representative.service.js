const representativeRepository = require('../repositories/representative.repository');
const createHttpError = require('../utils/httpError');
const validate = require('../utils/validation');

const ASSIGNMENT_STATUSES = ['PENDING', 'ACTIVE', 'REJECTED', 'REVOKED'];
const ACTIONS = ['APPROVE', 'REJECT', 'REVOKE'];

const REPOSITORY_ERRORS = Object.freeze({
  ACCOUNT_NOT_FOUND: 404,
  ACCOUNT_UNAVAILABLE: 403,
  ADMIN_NOT_ELIGIBLE: 409,
  COMPANY_NOT_FOUND: 404,
  ACTIVE_ASSIGNMENT_EXISTS: 409,
  ASSIGNMENT_NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  INVALID_ACTION: 400
});

function rethrow(error) {
  const status = REPOSITORY_ERRORS[error.sapleCode];
  if (status) throw createHttpError(status, error.message);
  throw error;
}

// Public-facing shape. Internal reviewer identity stays out of it; only the
// administrator queue includes the full record.
function toPublicAssignment(row) {
  return {
    assignmentId: row.assignmentId,
    companyId: row.companyId,
    companyName: row.companyName,
    jobTitle: row.jobTitle,
    assignmentStatus: row.assignmentStatus,
    decisionNote: row.decisionNote,
    approvedAt: row.approvedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt
  };
}

function toAdminAssignment(row) {
  return {
    ...toPublicAssignment(row),
    userId: row.userId,
    representativeName: row.representativeName,
    representativeEmail: row.representativeEmail,
    accountStatus: row.accountStatus,
    requestNote: row.requestNote,
    approvedBy: row.approvedBy,
    revokedBy: row.revokedBy,
    updatedAt: row.updatedAt
  };
}

// A signed-in account may ask to represent a company. This can only ever
// create a PENDING request: it never grants the role.
async function requestAssignment(userId, input = {}) {
  const companyId = validate.positiveId(input.companyId, 'company ID');
  const jobTitle = input.jobTitle === undefined || input.jobTitle === null || input.jobTitle === ''
    ? null
    : validate.requiredText(input.jobTitle, 'Job title', { min: 2, max: 120 });
  const requestNote = validate.requiredParagraph(input.requestNote, 'Request note', {
    min: 20,
    max: 1000
  });

  try {
    return await representativeRepository.createAssignmentRequest({
      userId, companyId, jobTitle, requestNote
    });
  } catch (error) {
    return rethrow(error);
  }
}

async function getOwnAssignments(userId) {
  const rows = await representativeRepository.findAssignmentsByUserId(userId);
  return rows.map(toPublicAssignment);
}

async function getActiveScopes(userId) {
  return representativeRepository.findActiveScopesByUserId(userId);
}

async function listAssignments(query = {}) {
  const status = validate.enumValue(query.status, ASSIGNMENT_STATUSES, 'Status', { required: false });
  const companyId = validate.optionalId(query.companyId, 'company ID');
  const search = validate.optionalSearch(query.search);
  const page = validate.pagination(query, { defaultSize: 20 });

  const [rows, total] = await Promise.all([
    representativeRepository.findAssignments({ status, companyId, search, ...page }),
    representativeRepository.countAssignments({ status, companyId, search })
  ]);
  return validate.paged(rows.map(toAdminAssignment), total, page);
}

async function getAssignment(assignmentIdValue) {
  const assignmentId = validate.positiveId(assignmentIdValue, 'assignment ID');
  const row = await representativeRepository.findAssignmentById(assignmentId);
  if (!row) throw createHttpError(404, 'Representative assignment not found');
  return toAdminAssignment(row);
}

async function getAssignmentHistory(assignmentIdValue) {
  const assignmentId = validate.positiveId(assignmentIdValue, 'assignment ID');
  const row = await representativeRepository.findAssignmentById(assignmentId);
  if (!row) throw createHttpError(404, 'Representative assignment not found');
  return representativeRepository.findAssignmentHistory(assignmentId);
}

// Only an administrator reaches this. The route enforces that; the note rules
// are enforced here so every rejection and revocation explains itself.
async function decideAssignment(actorUserId, assignmentIdValue, input = {}) {
  const assignmentId = validate.positiveId(assignmentIdValue, 'assignment ID');
  const action = validate.enumValue(input.action, ACTIONS, 'Action');
  const noteRequired = action !== 'APPROVE';
  const note = noteRequired
    ? validate.requiredParagraph(input.note, 'Decision note', { min: 5, max: 1000 })
    : validate.optionalParagraph(input.note, 'Decision note', { max: 1000 });

  try {
    return await representativeRepository.decideAssignment({
      assignmentId, actorUserId, action, note
    });
  } catch (error) {
    return rethrow(error);
  }
}

module.exports = {
  ASSIGNMENT_STATUSES,
  ACTIONS,
  requestAssignment,
  getOwnAssignments,
  getActiveScopes,
  listAssignments,
  getAssignment,
  getAssignmentHistory,
  decideAssignment
};
