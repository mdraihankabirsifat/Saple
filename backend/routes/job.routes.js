const express = require('express');
const jobController = require('../controllers/job.controller');
const applicationController = require('../controllers/application.controller');
const authenticate = require('../middleware/authenticate');
const { createRateLimit, accountOrAddressKey } = require('../middleware/rateLimit');

const router = express.Router();

// Applications are write-heavy and personal, so they carry their own limit.
const applyRateLimit = createRateLimit({
  limit: 10,
  windowMs: 60 * 60 * 1000,
  message: 'Too many job applications from this account. Please try again later.',
  keyFor: accountOrAddressKey
});

// Public reads. The service only ever queries the published-jobs view.
router.get('/', jobController.listPublic);
router.get('/filter-options', jobController.getFilterOptions);
router.get('/:jobId', jobController.getPublic);

// Applying requires a signed-in job-seeker account; the applicant identity is
// taken from the token, never from the request body.
router.post('/:jobId/applications', authenticate, applyRateLimit, applicationController.apply);

module.exports = router;
module.exports.applyRateLimit = applyRateLimit;
