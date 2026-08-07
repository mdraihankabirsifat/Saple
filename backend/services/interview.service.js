const interviewRepository = require('../repositories/interview.repository');
const createHttpError = require('../utils/httpError');

function positiveInteger(value, label, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (!/^\d+$/.test(String(value))) throw createHttpError(400, `${label} must be an integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw createHttpError(400, `${label} must be between ${min} and ${max}`);
  return number;
}
function enumValue(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.includes(value.trim().toUpperCase())) throw createHttpError(400, `${label} has an invalid value`);
  return value.trim().toUpperCase();
}
function text(value, label, maximum, required = true) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (required && !normalized) throw createHttpError(400, `${label} is required`);
  if (normalized.length > maximum) throw createHttpError(400, `${label} must not exceed ${maximum} characters`);
  return normalized || null;
}
function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw createHttpError(400, 'Interview date must use YYYY-MM-DD');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date > new Date()) throw createHttpError(400, 'Interview date must be a valid non-future date');
  return date;
}

async function submitInterview(userId, companyIdValue, input = {}) {
  if (typeof input.isAnonymous !== 'boolean') throw createHttpError(400, 'Anonymous display must be a boolean');
  const data = {
    userId,
    companyId: positiveInteger(companyIdValue, 'Company ID'),
    roleId: positiveInteger(input.roleId, 'Role ID'),
    interviewDate: dateValue(input.interviewDate),
    difficultyLevel: enumValue(input.difficultyLevel, ['EASY', 'MEDIUM', 'HARD'], 'Difficulty level'),
    roundsCount: positiveInteger(input.roundsCount, 'Rounds count', 1, 20),
    interviewMode: enumValue(input.interviewMode, ['ONLINE', 'ONSITE', 'HYBRID'], 'Interview mode'),
    resultStatus: enumValue(input.resultStatus, ['OFFERED', 'REJECTED', 'PENDING', 'WITHDREW'], 'Result status'),
    durationDays: positiveInteger(input.durationDays, 'Duration days', 0, 365),
    processDescription: text(input.processDescription, 'Process description', 8000),
    questionsSummary: text(input.questionsSummary, 'Questions summary', 5000, false),
    isAnonymous: input.isAnonymous
  };
  try { return await interviewRepository.createInterview(data); }
  catch (error) {
    const map = { ACCOUNT_UNAVAILABLE: 403, COMPANY_NOT_FOUND: 404, ROLE_NOT_FOUND: 404 };
    if (map[error.sapleCode]) throw createHttpError(map[error.sapleCode], error.message);
    throw error;
  }
}
async function getApprovedInterviews(companyIdValue) {
  return interviewRepository.findApprovedInterviews(positiveInteger(companyIdValue, 'Company ID'));
}
module.exports = { submitInterview, getApprovedInterviews };
