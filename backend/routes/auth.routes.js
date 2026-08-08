const express = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const passwordResetRateLimit = require('../middleware/passwordResetRateLimit');
const { createPasswordResetRateLimit } = passwordResetRateLimit;

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', passwordResetRateLimit, authController.forgotPassword);
router.post('/reset-password', createPasswordResetRateLimit({ limit: 10 }), authController.resetPassword);
router.get('/me', authenticate, authController.getCurrentUser);
router.patch('/me', authenticate, authController.updateProfile);
router.patch('/me/password', authenticate, authController.changePassword);

module.exports = router;
