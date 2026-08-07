const express = require('express');
const jobRoleController = require('../controllers/job-role.controller');

const router = express.Router();

router.get('/', jobRoleController.getJobRoles);

module.exports = router;
