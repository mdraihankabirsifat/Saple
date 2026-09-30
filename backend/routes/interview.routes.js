const express = require('express');
const authenticate = require('../middleware/authenticate');
const { optionalAuthenticate } = require('../middleware/authenticate');
const requireVerifiedEmployee = require('../middleware/requireVerifiedEmployee');
const interviewController = require('../controllers/interview.controller');
const router = express.Router();
// Signed-in Premium members receive the full interview questions.
router.get('/:companyId/interviews', optionalAuthenticate, interviewController.list);
router.post('/:companyId/interviews', authenticate, requireVerifiedEmployee, interviewController.submit);
module.exports = router;
