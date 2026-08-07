const browseRepository = require('../repositories/browse.repository');
const createHttpError = require('../utils/httpError');

function optionalPositiveInteger(value, label) {
  if (value === undefined || value === '') return null;
  if (!/^\d+$/.test(String(value))) throw createHttpError(400, `${label} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw createHttpError(400, `${label} must be a positive integer`);
  }
  return parsed;
}

function optionalNumber(value, label, minimum, maximum) {
  if (value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw createHttpError(400, `${label} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function optionalText(value, label, maximum = 100) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string') throw createHttpError(400, `${label} must be a string`);
  const normalized = value.trim();
  if (normalized.length > maximum) throw createHttpError(400, `${label} must not exceed ${maximum} characters`);
  return normalized;
}

function commonFilters(query) {
  return {
    companyId: optionalPositiveInteger(query.companyId, 'Company ID'),
    roleId: optionalPositiveInteger(query.roleId, 'Role ID'),
    location: optionalText(query.location, 'Location')
  };
}

async function getPublicSalaryInsights(query = {}) {
  const salarySource = optionalText(query.salarySource, 'Salary source', 20).toUpperCase() || 'COMMUNITY';
  if (!['COMMUNITY', 'VERIFIED'].includes(salarySource)) {
    throw createHttpError(400, 'Salary source must be COMMUNITY or VERIFIED');
  }
  const filters = {
    ...commonFilters(query),
    minSalary: optionalNumber(query.minSalary, 'Minimum salary', 0, 9999999999.99),
    maxSalary: optionalNumber(query.maxSalary, 'Maximum salary', 0, 9999999999.99),
    salarySource
  };
  if (filters.minSalary !== null && filters.maxSalary !== null && filters.minSalary > filters.maxSalary) {
    throw createHttpError(400, 'Minimum salary cannot exceed maximum salary');
  }
  return browseRepository.findPublicSalaryInsights(filters);
}

async function getPublicReviews(query = {}) {
  return browseRepository.findPublicReviews({
    ...commonFilters(query),
    minRating: optionalNumber(query.minRating, 'Minimum rating', 1, 5)
  });
}

async function getPublicInterviews(query = {}) {
  const difficultyLevel = optionalText(query.difficultyLevel, 'Difficulty level', 20).toUpperCase();
  const interviewMode = optionalText(query.interviewMode, 'Interview mode', 20).toUpperCase();
  if (difficultyLevel && !['EASY', 'MEDIUM', 'HARD'].includes(difficultyLevel)) {
    throw createHttpError(400, 'Difficulty level must be EASY, MEDIUM, or HARD');
  }
  if (interviewMode && !['ONLINE', 'ONSITE', 'HYBRID'].includes(interviewMode)) {
    throw createHttpError(400, 'Interview mode must be ONLINE, ONSITE, or HYBRID');
  }
  return browseRepository.findPublicInterviews({
    ...commonFilters(query),
    difficultyLevel,
    interviewMode
  });
}

module.exports = {
  getPublicSalaryInsights,
  getPublicReviews,
  getPublicInterviews
};
