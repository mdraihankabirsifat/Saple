const express = require('express');
const authenticate = require('../middleware/authenticate');
const controller = require('../controllers/message.controller');
const router = express.Router();
router.use(authenticate);
router.get('/:userId/profile', controller.profile);
module.exports = router;
