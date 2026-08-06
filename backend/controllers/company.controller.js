const companyService = require('../services/company.service');
const { sendSuccess } = require('../utils/apiResponse');

async function getCompanies(request, response, next) {
  try {
    const companies = await companyService.getCompanies(request.query.search);
    return sendSuccess(response, 200, 'Companies retrieved successfully', companies);
  } catch (error) {
    return next(error);
  }
}

async function getCompany(request, response, next) {
  try {
    const company = await companyService.getCompany(request.params.companyId);
    return sendSuccess(response, 200, 'Company retrieved successfully', company);
  } catch (error) {
    return next(error);
  }
}

async function getCompanyBenefits(request, response, next) {
  try {
    const benefits = await companyService.getCompanyBenefits(request.params.companyId);
    return sendSuccess(response, 200, 'Company benefits retrieved successfully', benefits);
  } catch (error) {
    return next(error);
  }
}

async function getCompanySalarySummary(request, response, next) {
  try {
    const summary = await companyService.getCompanySalarySummary(request.params.companyId);
    return sendSuccess(response, 200, 'Salary summary retrieved successfully', summary);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getCompanies,
  getCompany,
  getCompanyBenefits,
  getCompanySalarySummary
};
