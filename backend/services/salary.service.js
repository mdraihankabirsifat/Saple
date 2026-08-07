const salaryRepository = require('../repositories/salary.repository');
const createHttpError = require('../utils/httpError');

const PAY_PERIODS = new Set(['MONTHLY', 'YEARLY']);
const EMPLOYMENT_TYPES = new Set(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']);
const WORK_MODES = new Set(['ONSITE', 'HYBRID', 'REMOTE']);
const MAX_SALARY = 9999999999.99;

function parsePositiveInteger(value, label) {
  const stringValue = String(value);

  if (!/^\d+$/.test(stringValue)) {
    throw createHttpError(400, `${label} must be a positive integer`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw createHttpError(400, `${label} must be a positive integer`);
  }

  return parsed;
}

function parseNumber(value, label, { minimum, maximum, optional = false } = {}) {
  if ((value === undefined || value === null || value === '') && optional) {
    return null;
  }

  if (value === undefined || value === null || value === '' || typeof value === 'boolean') {
    throw createHttpError(400, `${label} must be a number`);
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw createHttpError(400, `${label} must be between ${minimum} and ${maximum}`);
  }

  return parsed;
}

function validateDecimalPlaces(value, maximumPlaces, label) {
  const normalized = String(value).toLowerCase();
  const decimalPart = normalized.includes('.') ? normalized.split('.')[1] : '';

  if (normalized.includes('e') || decimalPart.length > maximumPlaces) {
    throw createHttpError(400, `${label} supports at most ${maximumPlaces} decimal place${maximumPlaces === 1 ? '' : 's'}`);
  }
}

function validateEnum(value, allowedValues, label) {
  if (typeof value !== 'string' || !allowedValues.has(value)) {
    throw createHttpError(400, `${label} has an invalid value`);
  }

  return value;
}

function validateSalaryInput(companyIdValue, input = {}) {
  const companyId = parsePositiveInteger(companyIdValue, 'Company ID');
  const roleId = parsePositiveInteger(input.roleId, 'Role ID');
  const baseSalary = parseNumber(input.baseSalary, 'Base salary', {
    minimum: 0.01,
    maximum: MAX_SALARY
  });
  const additionalCompensation = parseNumber(input.additionalCompensation, 'Additional compensation', {
    minimum: 0,
    maximum: MAX_SALARY,
    optional: true
  });
  const yearsOfExperience = parseNumber(input.yearsOfExperience, 'Years of experience', {
    minimum: 0,
    maximum: 60
  });

  validateDecimalPlaces(input.baseSalary, 2, 'Base salary');
  if (additionalCompensation !== null) {
    validateDecimalPlaces(input.additionalCompensation, 2, 'Additional compensation');
  }
  validateDecimalPlaces(input.yearsOfExperience, 1, 'Years of experience');

  if (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)) {
    throw createHttpError(400, 'Currency must be a three-letter uppercase code');
  }

  const salaryYear = Number(input.salaryYear);

  if (!Number.isInteger(salaryYear) || salaryYear < 2000 || salaryYear > 2100) {
    throw createHttpError(400, 'Salary year must be an integer between 2000 and 2100');
  }

  if (typeof input.isAnonymous !== 'boolean') {
    throw createHttpError(400, 'Anonymous display must be a boolean');
  }

  return {
    companyId,
    roleId,
    baseSalary,
    additionalCompensation,
    currency: input.currency,
    payPeriod: validateEnum(input.payPeriod, PAY_PERIODS, 'Pay period'),
    yearsOfExperience,
    employmentType: validateEnum(input.employmentType, EMPLOYMENT_TYPES, 'Employment type'),
    workMode: validateEnum(input.workMode, WORK_MODES, 'Work mode'),
    salaryYear,
    isAnonymous: input.isAnonymous
  };
}

async function submitSalary(userId, companyIdValue, input) {
  const validated = validateSalaryInput(companyIdValue, input);

  try {
    return await salaryRepository.createSalarySubmission({
      userId,
      ...validated
    });
  } catch (error) {
    if (error.sapleCode === 'ACCOUNT_UNAVAILABLE') {
      throw createHttpError(403, 'This account cannot submit salary information');
    }

    if (error.sapleCode === 'COMPANY_NOT_FOUND') {
      throw createHttpError(404, 'Company not found');
    }

    if (error.sapleCode === 'ROLE_NOT_FOUND') {
      throw createHttpError(404, 'Job role not found');
    }

    throw error;
  }
}

module.exports = {
  submitSalary,
  validateSalaryInput
};
