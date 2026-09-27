const express = require('express');
const authenticate = require('../middleware/authenticate');
const { createRateLimit, accountOrAddressKey } = require('../middleware/rateLimit');
const controller = require('../controllers/message.controller');
const database = require('../config/database');
const { sendFailure } = require('../utils/apiResponse');
const router = express.Router();
const sendLimit = createRateLimit({ limit: 60, windowMs: 60000, keyFor: accountOrAddressKey,
  message: 'Too many messages. Please wait a minute.' });
router.use(authenticate);
router.use((request, response, next) => database.getSource() === 'local'
  ? sendFailure(response, 503, 'Messaging requires the online database') : next());
router.get('/conversations', controller.conversations);
router.get('/unread-count', controller.unreadCount);
router.get('/company/:companyId/contacts', controller.contacts);
router.get('/with/:userId', controller.history);
router.post('/with/:userId', sendLimit, controller.send);
router.patch('/:messageId', controller.edit);
router.delete('/:messageId', controller.remove);
module.exports = router;
