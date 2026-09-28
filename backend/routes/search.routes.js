const express = require('express');
const authenticate = require('../middleware/authenticate');
const { createRateLimit, accountOrAddressKey } = require('../middleware/rateLimit');
const controller = require('../controllers/search.controller');

const router = express.Router();
const limit = createRateLimit({ limit: 60, windowMs: 60000, keyFor: accountOrAddressKey,
  message: 'Too many searches. Please wait a minute.' });
router.get('/', authenticate, limit, controller.all);
module.exports = { router, limit };
