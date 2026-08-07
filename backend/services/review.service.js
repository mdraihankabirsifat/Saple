const reviewRepository = require('../repositories/review.repository');
const companyRepository = require('../repositories/company.repository');
const createHttpError = require('../utils/httpError');

function positiveId(value, label, optional = false) {
  if (optional && (value === null || value === undefined || value === '')) return null;
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw createHttpError(400, `Invalid ${label}`);
  return Number(value);
}
function rating(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1 || number > 5 || Math.round(number * 10) !== number * 10) {
    throw createHttpError(400, `${label} must be between 1 and 5 with at most one decimal place`);
  }
  return number;
}
function text(value, label, maximum, required = true) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (required && !normalized) throw createHttpError(400, `${label} is required`);
  if (normalized.length > maximum) throw createHttpError(400, `${label} must not exceed ${maximum} characters`);
  return normalized || null;
}
function dateValue(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw createHttpError(400, `${label} must use YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    value.startsWith('0000')
    || Number.isNaN(date.getTime())
    || date.toISOString().slice(0, 10) !== value
    || date > new Date()
  ) throw createHttpError(400, `${label} must be a valid non-future date`);
  return date;
}

async function submitReview(userId, companyIdValue, input = {}) {
  if (typeof input.isAnonymous !== 'boolean') throw createHttpError(400, 'Anonymous display must be a boolean');
  const employmentStatus = typeof input.employmentStatus === 'string' ? input.employmentStatus.trim().toUpperCase() : '';
  if (!['CURRENT', 'FORMER'].includes(employmentStatus)) throw createHttpError(400, 'Employment status must be CURRENT or FORMER');
  const data = {
    userId,
    companyId: positiveId(companyIdValue, 'company ID'),
    roleId: positiveId(input.roleId, 'role ID', true),
    reviewTitle: text(input.reviewTitle, 'Review title', 200),
    overallRating: rating(input.overallRating, 'Overall rating'),
    workLifeBalanceRating: rating(input.workLifeBalanceRating, 'Work-life balance rating'),
    careerGrowthRating: rating(input.careerGrowthRating, 'Career growth rating'),
    managementRating: rating(input.managementRating, 'Management rating'),
    cultureRating: rating(input.cultureRating, 'Culture rating'),
    pros: text(input.pros, 'Pros', 5000),
    cons: text(input.cons, 'Cons', 5000),
    adviceToManagement: text(input.adviceToManagement, 'Advice to management', 5000, false),
    employmentStatus,
    reviewDate: dateValue(input.reviewDate, 'Review date'),
    isAnonymous: input.isAnonymous
  };
  try { return await reviewRepository.createReview(data); }
  catch (error) {
    const map = { EMPLOYEE_REQUIRED: 403, EMPLOYMENT_STATUS_MISMATCH: 400, COMPANY_NOT_FOUND: 404, ROLE_NOT_FOUND: 404 };
    if (map[error.sapleCode]) throw createHttpError(map[error.sapleCode], error.message);
    throw error;
  }
}

async function getApprovedReviews(companyIdValue) {
  const companyId = positiveId(companyIdValue, 'company ID');
  if (!await companyRepository.findCompanyById(companyId)) throw createHttpError(404, 'Company not found');
  return reviewRepository.findApprovedReviews(companyId);
}
module.exports = { submitReview, getApprovedReviews };
