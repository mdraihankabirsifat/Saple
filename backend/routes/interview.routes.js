const express = require('express');
const authenticate = require('../middleware/authenticate');
const interviewController = require('../controllers/interview.controller');
const router = express.Router();
router.get('/:companyId/interviews', interviewController.list);
router.post('/:companyId/interviews', authenticate, interviewController.submit);
module.exports = router;
