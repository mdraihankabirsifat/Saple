const express = require('express');
const adminController = require('../controllers/admin.controller');
const verificationController = require('../controllers/verification.controller');
const reportController = require('../controllers/report.controller');

const router = express.Router();

router.get('/submissions/pending', adminController.getPendingSubmissions);
router.get('/submissions/:submissionId/moderation-history', adminController.getModerationHistory);
router.patch('/submissions/:submissionId/status', adminController.updateSubmissionStatus);
router.get('/submissions/:submissionId', adminController.getSubmission);
router.get('/verifications/pending', verificationController.getPending);
router.get('/verifications/:verificationId', verificationController.getOne);
router.patch('/verifications/:verificationId/status', verificationController.updateStatus);
router.get('/reports', reportController.list);
router.get('/reports/:reportId', reportController.getOne);
router.patch('/reports/:reportId/status', reportController.updateStatus);

module.exports = router;
