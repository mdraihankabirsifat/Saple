const express = require('express');
const authenticate = require('../middleware/authenticate');
const reportController = require('../controllers/report.controller');
const router = express.Router();
router.post('/:submissionId/reports', authenticate, reportController.submit);
module.exports = router;
