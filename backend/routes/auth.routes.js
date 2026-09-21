const express = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const passwordResetRateLimit = require('../middleware/passwordResetRateLimit');
const { createPasswordResetRateLimit } = passwordResetRateLimit;
const { createRateLimit, defaultKey } = require('../middleware/rateLimit');

// Conservative per-endpoint limits. They are per process: a multi-instance
// deployment would need a shared store (see docs/security-and-safe-deployment.md).
const registerRateLimit = createRateLimit({
  limit: 10,
  windowMs: 60 * 60 * 1000,
  message: 'Too many accounts created from this network. Please try again later.'
});

// Keyed by address and normalized email, so one person cannot lock another out
// from a shared campus network and one address cannot be guessed at endlessly.
const loginRateLimit = createRateLimit({
  limit: 20,
  windowMs: 15 * 60 * 1000,
  message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
  keyFor: (request) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    return `${defaultKey(request)}:${email}`;
  }
});

const router = express.Router();

router.post('/register', registerRateLimit, authController.register);
router.post('/login', loginRateLimit, authController.login);
router.post('/logout', authenticate, authController.logout);
router.post('/forgot-password', passwordResetRateLimit, authController.forgotPassword);
router.post('/reset-password', createPasswordResetRateLimit({ limit: 10 }), authController.resetPassword);
router.get('/me', authenticate, authController.getCurrentUser);
router.get('/me/submissions', authenticate, authController.getOwnSubmissions);
router.get('/me/submissions/:submissionId', authenticate, authController.getOwnSubmission);
router.patch('/me', authenticate, authController.updateProfile);
router.patch('/me/password', authenticate, authController.changePassword);

module.exports = router;
module.exports.registerRateLimit = registerRateLimit;
module.exports.loginRateLimit = loginRateLimit;
