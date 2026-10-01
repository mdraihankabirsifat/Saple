const express = require('express');
const applicationController = require('../controllers/application.controller');
const notificationController = require('../controllers/notification.controller');
const representativeController = require('../controllers/representative.controller');
const authenticate = require('../middleware/authenticate');
const imageController = require('../controllers/image.controller');
const professionalProfile = require('../controllers/professional-profile.controller');
const premiumController = require('../controllers/premium.controller');
const requirePremium = require('../middleware/requirePremium');
const { imageUpload } = require('../middleware/imageUpload');
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

router.put('/avatar', imageUpload('avatar', 2 * 1024 * 1024), imageController.putAvatar);
router.delete('/avatar', imageController.deleteAvatar);

const profileWriteLimit = createRateLimit({ limit: 60, windowMs: 60000,
  keyFor: accountOrAddressKey, message: 'Too many profile changes. Please wait a minute.' });
router.get('/professional-profile', professionalProfile.own);

// Who viewed my profile: the count is for everyone, identities are Premium.
router.get('/profile-view-summary', premiumController.viewSummary);
router.get('/profile-viewers', requirePremium, premiumController.viewers);
router.post('/education', profileWriteLimit, professionalProfile.addEducation);
router.patch('/education/:recordId', profileWriteLimit, professionalProfile.editEducation);
router.delete('/education/:recordId', profileWriteLimit, professionalProfile.removeEducation);
router.post('/experience', profileWriteLimit, professionalProfile.addExperience);
router.patch('/experience/:recordId', profileWriteLimit, professionalProfile.editExperience);
router.delete('/experience/:recordId', profileWriteLimit, professionalProfile.removeExperience);
router.post('/skills', profileWriteLimit, professionalProfile.addSkill);
router.delete('/skills/:skillId', profileWriteLimit, professionalProfile.removeSkill);

router.get('/applications', applicationController.listOwn);
router.get('/applications/:applicationId', applicationController.getOwn);
router.get('/applications/:applicationId/resume', applicationController.getOwnResume);
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
