const express = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', authenticate, authController.getCurrentUser);
router.patch('/me', authenticate, authController.updateProfile);
router.patch('/me/password', authenticate, authController.changePassword);

module.exports = router;
