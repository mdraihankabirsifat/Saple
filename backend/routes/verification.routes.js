const express = require('express');
const authenticate = require('../middleware/authenticate');
const verificationController = require('../controllers/verification.controller');
const { createRateLimit, accountOrAddressKey } = require('../middleware/rateLimit');

const router = express.Router();

const verificationRateLimit = createRateLimit({
  limit: 10,
  windowMs: 24 * 60 * 60 * 1000,
  message: 'Too many verification requests from this account. Please try again tomorrow.',
  keyFor: accountOrAddressKey
});

router.post(
  '/:companyId/verifications',
  authenticate,
  verificationRateLimit,
  verificationController.requestVerification
);

module.exports = router;
module.exports.verificationRateLimit = verificationRateLimit;
