const express = require('express');
const homeController = require('../controllers/home.controller');
const { optionalAuthenticate } = require('../middleware/authenticate');
const { createRateLimit, accountOrAddressKey } = require('../middleware/rateLimit');

const router = express.Router();

const recommendationLimit = createRateLimit({
  limit: 60,
  windowMs: 60 * 1000,
  message: 'Too many homepage requests. Please try again in a minute.',
  keyFor: accountOrAddressKey
});

// Homepage hero data. A signed-in visitor is identified (optionally) so the
// items can be ranked for them; every /api response is already sent with
// Cache-Control: no-store, so one member's ranking is never cached for another.
router.get('/home/recommendations', optionalAuthenticate, recommendationLimit, homeController.recommendations);
router.get('/stats/activity', homeController.activity);

module.exports = router;
