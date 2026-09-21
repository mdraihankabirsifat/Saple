const express = require('express');
const applicationController = require('../controllers/application.controller');
const notificationController = require('../controllers/notification.controller');
const representativeController = require('../controllers/representative.controller');
const authenticate = require('../middleware/authenticate');
const { createRateLimit, accountOrAddressKey } = require('../middleware/rateLimit');

const router = express.Router();

// Asking to represent a company is a privileged request, so it is limited even
// though an administrator still has to approve it.
const representativeRequestRateLimit = createRateLimit({
  limit: 5,
  windowMs: 24 * 60 * 60 * 1000,
  message: 'Too many representative requests from this account. Please try again later.',
  keyFor: accountOrAddressKey
});

// Everything under /api/me belongs to the authenticated account only.
router.use(authenticate);

router.get('/applications', applicationController.listOwn);
router.get('/applications/:applicationId', applicationController.getOwn);
router.patch('/applications/:applicationId/withdraw', applicationController.withdrawOwn);

router.get('/notifications', notificationController.list);
router.get('/notifications/unread-count', notificationController.unreadCount);
router.patch('/notifications/read-all', notificationController.markAllRead);
router.patch('/notifications/:notificationId/read', notificationController.markRead);

router.get('/representative-assignments', representativeController.getOwnAssignments);
router.post(
  '/representative-assignments',
  representativeRequestRateLimit,
  representativeController.requestAssignment
);

module.exports = router;
