const express = require('express');
const authenticate = require('../middleware/authenticate');
const controller = require('../controllers/premium.controller');
const { createRateLimit, accountOrAddressKey } = require('../middleware/rateLimit');

const limit = (count, windowMinutes, message) => createRateLimit({
  limit: count, windowMs: windowMinutes * 60 * 1000, keyFor: accountOrAddressKey, message
});

const trialLimit = limit(5, 60, 'Too many trial requests. Please wait a while.');
const quoteLimit = limit(30, 10, 'Too many price checks. Please wait a few minutes.');
const checkoutLimit = limit(10, 60, 'Too many checkout attempts. Please wait a while.');
const pollLimit = limit(60, 10, 'Too many status checks. Please wait a few minutes.');
const returnLimit = limit(30, 10, 'Too many payment returns. Please wait a few minutes.');

const router = express.Router();

router.get('/plans', controller.plans);

// The gateway returns the browser here, often as a cross-site form POST, so
// this route takes no JWT and simply redirects to the result page.
router.all('/payments/:publicId/return', returnLimit, controller.paymentReturn);

router.get('/status', authenticate, controller.status);
router.post('/trial/start', authenticate, trialLimit, controller.startTrial);
router.post('/quote', authenticate, quoteLimit, controller.quote);
router.post('/checkout', authenticate, checkoutLimit, controller.checkout);
router.get('/payments/:publicId', authenticate, pollLimit, controller.payment);

// Premium AI now lives in the Saple Guide (/api/assistant), which picks the
// Premium model from the member's entitlement; resumes are at /api/resume.

const webhookRouter = express.Router();
const ipnLimit = createRateLimit({ limit: 120, windowMs: 60 * 1000, message: 'Too many notifications.' });
webhookRouter.post('/payments/sslcommerz', ipnLimit, controller.sslcommerzIpn);

module.exports = router;
module.exports.webhookRouter = webhookRouter;
module.exports.limits = { trialLimit, quoteLimit, checkoutLimit, pollLimit, returnLimit, ipnLimit };
