const express = require('express');
const authenticate = require('../middleware/authenticate');
const requirePremium = require('../middleware/requirePremium');
const controller = require('../controllers/resume.controller');
const { createRateLimit, accountOrAddressKey } = require('../middleware/rateLimit');

const generateLimit = createRateLimit({
  limit: 6, windowMs: 10 * 60 * 1000, keyFor: accountOrAddressKey,
  message: 'Too many resume requests. Please wait a few minutes.'
});
const pdfLimit = createRateLimit({
  limit: 20, windowMs: 10 * 60 * 1000, keyFor: accountOrAddressKey,
  message: 'Too many PDF downloads. Please wait a few minutes.'
});

const router = express.Router();

// Every signed-in member can generate, read and copy a resume; the daily
// allowance is enforced on the server. The official PDF export is Premium.
router.get('/status', authenticate, controller.status);
router.post('/generate', authenticate, generateLimit, controller.generate);
router.post('/pdf', authenticate, requirePremium, pdfLimit, controller.pdf);

module.exports = router;
module.exports.limits = { generateLimit, pdfLimit };
