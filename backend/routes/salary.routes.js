const express = require('express');
const salaryController = require('../controllers/salary.controller');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

router.post('/:companyId/salaries', authenticate, salaryController.submitSalary);

module.exports = router;
