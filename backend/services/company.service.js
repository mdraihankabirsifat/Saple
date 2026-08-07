const companyRepository = require('../repositories/company.repository');

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateCompanyId(companyId) {
  if (!/^\d+$/.test(String(companyId))) {
    throw createHttpError(400, 'Invalid company ID');
  }

  const parsedId = Number(companyId);

  if (!Number.isSafeInteger(parsedId) || parsedId <= 0) {
    throw createHttpError(400, 'Invalid company ID');
  }

  return parsedId;
}

function validateText(value, label, maximum = 100) {
  if (value === undefined || value === '') {
    return '';
  }

  if (typeof value !== 'string') {
    throw createHttpError(400, `${label} must be a string`);
  }

  const normalized = value.trim();

  if (normalized.length > maximum) {
    throw createHttpError(400, `${label} must not exceed ${maximum} characters`);
  }

  return normalized;
}

function optionalPositiveInteger(value, label) {
  if (value === undefined || value === '') return null;
  if (!/^\d+$/.test(String(value))) {
    throw createHttpError(400, `${label} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw createHttpError(400, `${label} must be a positive integer`);
  }
  return parsed;
}

function optionalNumber(value, label, minimum = 0, maximum = 9999999999.99) {
  if (value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw createHttpError(400, `${label} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function optionalBoolean(value, label) {
  if (value === undefined || value === '') return false;
  if (value !== 'true' && value !== true) {
    throw createHttpError(400, `${label} must be true when provided`);
  }
  return true;
}

function validateCompanyFilters(query = {}) {
  const salarySource = validateText(query.salarySource, 'Salary source', 20).toUpperCase() || 'COMMUNITY';
  if (!['COMMUNITY', 'VERIFIED'].includes(salarySource)) {
    throw createHttpError(400, 'Salary source must be COMMUNITY or VERIFIED');
  }

  const filters = {
    search: validateText(query.search, 'Search'),
    industry: validateText(query.industry, 'Industry'),
    roleId: optionalPositiveInteger(query.roleId, 'Role ID'),
    minSalary: optionalNumber(query.minSalary, 'Minimum salary'),
    maxSalary: optionalNumber(query.maxSalary, 'Maximum salary'),
    location: validateText(query.location, 'Location'),
    companySize: validateText(query.companySize, 'Company size', 30),
    minRating: optionalNumber(query.minRating, 'Minimum rating', 1, 5),
    salarySource,
    hasSalaryData: optionalBoolean(query.hasSalaryData, 'Has salary data'),
    hasReviews: optionalBoolean(query.hasReviews, 'Has reviews'),
    hasInterviews: optionalBoolean(query.hasInterviews, 'Has interviews')
  };

  if (filters.minSalary !== null && filters.maxSalary !== null && filters.minSalary > filters.maxSalary) {
    throw createHttpError(400, 'Minimum salary cannot exceed maximum salary');
  }

  return filters;
}

async function getCompanies(query) {
  return companyRepository.findAllCompanies(validateCompanyFilters(query));
}

async function getCompanyFilterOptions() {
  return companyRepository.findCompanyFilterOptions();
}

async function getCompany(companyId) {
  const validCompanyId = validateCompanyId(companyId);
  const company = await companyRepository.findCompanyById(validCompanyId);

  if (!company) {
    throw createHttpError(404, 'Company not found');
  }

  return company;
}

async function getCompanyBenefits(companyId) {
  const validCompanyId = validateCompanyId(companyId);
  const company = await companyRepository.findCompanyById(validCompanyId);

  if (!company) {
    throw createHttpError(404, 'Company not found');
  }

  return companyRepository.findBenefitsByCompanyId(validCompanyId);
}

async function getCompanySalarySummary(companyId) {
  const validCompanyId = validateCompanyId(companyId);
  const company = await companyRepository.findCompanyById(validCompanyId);

  if (!company) {
    throw createHttpError(404, 'Company not found');
  }

  const [verified, community] = await Promise.all([
    companyRepository.findVerifiedSalarySummary(validCompanyId),
    companyRepository.findCommunitySalarySummary(validCompanyId)
  ]);

  return {
    companyId: validCompanyId,
    verified,
    community
  };
}

module.exports = {
  getCompanies,
  getCompanyFilterOptions,
  getCompany,
  getCompanyBenefits,
  getCompanySalarySummary,
  validateCompanyFilters
};
