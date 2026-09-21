const express = require('express');
const authenticate = require('../middleware/authenticate');
const reportController = require('../controllers/report.controller');
const { createRateLimit, accountOrAddressKey } = require('../middleware/rateLimit');

const router = express.Router();

// A report is once per account and submission (database unique key); this
// limit stops one account from flooding the moderation queue across many.
const reportRateLimit = createRateLimit({
  limit: 20,
  windowMs: 60 * 60 * 1000,
  message: 'Too many reports from this account. Please try again later.',
  keyFor: accountOrAddressKey
});

router.post('/:submissionId/reports', authenticate, reportRateLimit, reportController.submit);

module.exports = router;
module.exports.reportRateLimit = reportRateLimit;
