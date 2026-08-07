const express = require('express');
const adminController = require('../controllers/admin.controller');

const router = express.Router();

router.get('/submissions/pending', adminController.getPendingSubmissions);
router.get('/submissions/:submissionId/moderation-history', adminController.getModerationHistory);
router.patch('/submissions/:submissionId/status', adminController.updateSubmissionStatus);
router.get('/submissions/:submissionId', adminController.getSubmission);

module.exports = router;
