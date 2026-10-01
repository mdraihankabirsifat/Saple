const express = require('express');
const aiController = require('../controllers/ai.controller');
const { createRateLimit } = require('../middleware/rateLimit');
const { optionalAuthenticate } = require('../middleware/authenticate');

const router = express.Router();

// The guide is public, so its limit is deliberately conservative: it is the
// only endpoint that can cost the owner money at an external provider.
const guideRateLimit = createRateLimit({
  limit: 15,
  windowMs: 10 * 60 * 1000,
  message: 'The Saple Guide is busy. Please wait a moment and ask again.'
});

// A signed-in caller is identified (optionally) so the server can answer
// Premium and trial members with the Premium model in the same guide.
router.get('/status', optionalAuthenticate, aiController.getStatus);
router.post('/messages', optionalAuthenticate, guideRateLimit, aiController.ask);

module.exports = router;
module.exports.guideRateLimit = guideRateLimit;
