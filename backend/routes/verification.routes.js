const express = require('express');
const authenticate = require('../middleware/authenticate');
const verificationController = require('../controllers/verification.controller');

const router = express.Router();
router.post('/:companyId/verifications', authenticate, verificationController.requestVerification);
module.exports = router;
