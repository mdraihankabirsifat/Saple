const express = require('express');
const adminController = require('../controllers/admin.controller');
const verificationController = require('../controllers/verification.controller');
const reportController = require('../controllers/report.controller');
const representativeController = require('../controllers/representative.controller');
const announcementController = require('../controllers/announcement.controller');
const jobController = require('../controllers/job.controller');
const applicationController = require('../controllers/application.controller');
const premiumController = require('../controllers/premium.controller');
const mlModerationController = require('../controllers/ml-moderation.controller');
const controlController = require('../controllers/admin-control.controller');

const router = express.Router();

router.get('/summary', controlController.summary);
router.get('/submissions', controlController.submissions);
router.get('/submissions/:submissionId/screening', controlController.screening);
router.get('/verifications/table', controlController.verifications);
router.get('/reports/table', controlController.reports);
router.get('/users', controlController.users);
router.get('/users/:userId', controlController.user);
router.patch('/users/:userId/status', controlController.userStatus);
router.get('/subscriptions', controlController.subscriptions);
router.get('/subscriptions/:userId', controlController.subscription);
router.post('/subscriptions/:userId/grant', controlController.grant);
router.post('/subscriptions/:userId/extend', controlController.grant);
router.post('/subscriptions/:userId/revoke', controlController.revoke);

// This router is mounted behind authenticate + requireAdmin, so every route
// here already has an administrator identity. Administrators are ordinary
// accounts with the ADMIN role: nothing below assumes a particular account.
router.get('/submissions/pending', adminController.getPendingSubmissions);
router.get('/ml/health', adminController.getMlHealth);
router.get('/ml/screenings/pending', mlModerationController.queue);
router.patch('/ml/screenings/:screeningId/decision', mlModerationController.decide);
router.get('/submissions/:submissionId/moderation-history', adminController.getModerationHistory);
router.patch('/submissions/:submissionId/status', adminController.updateSubmissionStatus);
router.get('/submissions/:submissionId', adminController.getSubmission);

router.get('/verifications/pending', verificationController.getPending);
router.get('/verifications', verificationController.listScoped);
router.get('/verifications/:verificationId', verificationController.getOne);
router.patch('/verifications/:verificationId/status', verificationController.updateStatus);

router.get('/reports', reportController.list);
router.get('/reports/:reportId', reportController.getOne);
router.patch('/reports/:reportId/status', reportController.updateStatus);

// Representative oversight: approve, reject and revoke company scopes.
router.get('/representative-assignments', representativeController.listAssignments);
router.get('/representative-assignments/:assignmentId', representativeController.getAssignment);
router.get(
  '/representative-assignments/:assignmentId/history',
  representativeController.getAssignmentHistory
);
router.patch('/representative-assignments/:assignmentId/decision', representativeController.decideAssignment);

// Announcements are admin-managed and plain text only.
router.get('/announcements', announcementController.listAll);
router.post('/announcements', announcementController.create);
router.put('/announcements/:announcementId', announcementController.update);
router.patch('/announcements/:announcementId/active', announcementController.setActive);

// Jobs and applications oversight across every company.
router.get('/jobs', jobController.listManaged);
router.get('/jobs/:jobId', jobController.getManaged);
router.patch('/jobs/:jobId/status', jobController.updateStatus);
router.get('/applications', applicationController.listScoped);
router.get('/applications/:applicationId', applicationController.getScoped);

// Premium: overview, promo codes and the talent list.
router.get('/premium/overview', premiumController.adminOverview);
router.get('/premium/promo-codes', premiumController.adminPromoCodes);
router.post('/premium/promo-codes', premiumController.adminCreatePromoCode);
router.patch('/premium/promo-codes/:promoCodeId/active', premiumController.adminSetPromoActive);
router.get('/talent', premiumController.talent);

module.exports = router;
