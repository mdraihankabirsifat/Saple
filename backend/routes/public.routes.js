const express = require('express');
const announcementController = require('../controllers/announcement.controller');
const jobController = require('../controllers/job.controller');

const router = express.Router();

// Public, read-only endpoints. The announcement query applies its schedule in
// SQL, and the overview counts are derived aggregates over public views only.
router.get('/announcements', announcementController.listActive);
router.get('/stats/overview', jobController.getOverviewCounts);

module.exports = router;
