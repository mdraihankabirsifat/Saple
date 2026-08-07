const express = require('express');
const companyController = require('../controllers/company.controller');

const router = express.Router();

router.get('/', companyController.getCompanies);
router.get('/filter-options', companyController.getCompanyFilterOptions);
router.get('/:companyId/benefits', companyController.getCompanyBenefits);
router.get('/:companyId/salary-summary', companyController.getCompanySalarySummary);
router.get('/:companyId', companyController.getCompany);

module.exports = router;
