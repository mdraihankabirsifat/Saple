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

function validateSearch(search) {
  if (search === undefined) {
    return '';
  }

  if (typeof search !== 'string') {
    throw createHttpError(400, 'Search must be a string');
  }

  const trimmedSearch = search.trim();

  if (trimmedSearch.length > 100) {
    throw createHttpError(400, 'Search must not exceed 100 characters');
  }

  return trimmedSearch;
}

async function getCompanies(search) {
  return companyRepository.findAllCompanies(validateSearch(search));
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
  getCompany,
  getCompanyBenefits,
  getCompanySalarySummary
};
