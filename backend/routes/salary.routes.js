const express = require('express');
const salaryController = require('../controllers/salary.controller');
const authenticate = require('../middleware/authenticate');
const requireVerifiedEmployee = require('../middleware/requireVerifiedEmployee');

const router = express.Router();

router.post('/:companyId/salaries', authenticate, requireVerifiedEmployee, salaryController.submitSalary);

module.exports = router;
