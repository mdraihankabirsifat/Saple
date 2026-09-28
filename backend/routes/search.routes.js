const express = require('express');
const { optionalAuthenticate } = require('../middleware/authenticate');
const { createRateLimit, accountOrAddressKey } = require('../middleware/rateLimit');
const controller = require('../controllers/search.controller');

const router = express.Router();
const limit = createRateLimit({ limit: 60, windowMs: 60000, keyFor: accountOrAddressKey,
  message: 'Too many searches. Please wait a minute.' });
// Public: any visitor can find members and companies. A signed-in visitor is
// identified only so their own account is left out of the results.
router.get('/', optionalAuthenticate, limit, controller.all);
module.exports = { router, limit };
