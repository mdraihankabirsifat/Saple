const premiumService = require('../services/premium.service');
const aiService = require('../services/ai.service');
const { sendSuccess } = require('../utils/apiResponse');

function handle(work) {
  return async (request, response, next) => {
    try { return await work(request, response); } catch (error) { return next(error); }
  };
}

const plans = handle(async (req, res) => sendSuccess(res, 200, 'Premium plans retrieved',
  { ...await premiumService.listPlans(), premiumAiAvailable: aiService.isPremiumModelConfigured() }));

const status = handle(async (req, res) => sendSuccess(res, 200, 'Premium status retrieved',
  await premiumService.getPremiumAccess(req.user.userId)));

const startTrial = handle(async (req, res) => sendSuccess(res, 201, 'Your 24-hour Premium trial has started',
  await premiumService.startTrial(req.user.userId)));

const quote = handle(async (req, res) => sendSuccess(res, 200, 'Price calculated',
  await premiumService.quote(req.user.userId, req.body)));

const checkout = handle(async (req, res) => sendSuccess(res, 201, 'Checkout started',
  await premiumService.checkout(req.user.userId, req.body)));

const payment = handle(async (req, res) => sendSuccess(res, 200, 'Payment retrieved',
  await premiumService.getOwnPayment(req.user.userId, req.params.publicId)));

// The gateway sends the browser back here (usually as a form POST). This is
// only a redirect to the result page; payment is proven by validation alone.
const paymentReturn = handle(async (req, res) => {
  const body = { ...(req.query || {}), ...(req.body || {}) };
  const location = await premiumService.handleReturn(req.params.publicId, String(req.query.result || ''), body);
  return res.redirect(303, location);
});

// Server-to-server IPN from SSLCommerz. No JWT: authenticity comes from
// validating val_id with SSLCommerz using Saple's own store credentials.
const sslcommerzIpn = handle(async (req, res) => sendSuccess(res, 200, 'Received',
  await premiumService.handleIpn(req.body)));

const viewSummary = handle(async (req, res) => sendSuccess(res, 200, 'Profile view summary retrieved',
  await premiumService.getViewSummary(req.user.userId)));

const viewers = handle(async (req, res) => sendSuccess(res, 200, 'Profile viewers retrieved',
  await premiumService.getViewers(req.user.userId, req.query)));

const talent = handle(async (req, res) => sendSuccess(res, 200, 'Talent retrieved',
  await premiumService.listTalent(req.user, req.query)));

const adminOverview = handle(async (req, res) => sendSuccess(res, 200, 'Premium overview retrieved',
  await premiumService.getOverview()));

const adminPromoCodes = handle(async (req, res) => sendSuccess(res, 200, 'Promo codes retrieved',
  { promoCodes: await premiumService.listPromoCodes() }));

const adminCreatePromoCode = handle(async (req, res) => sendSuccess(res, 201, 'Promo code created',
  await premiumService.createPromoCode(req.user, req.body)));

const adminSetPromoActive = handle(async (req, res) => sendSuccess(res, 200, 'Promo code updated',
  await premiumService.setPromoCodeActive(req.params.promoCodeId, req.body)));

module.exports = {
  plans, status, startTrial, quote, checkout, payment, paymentReturn, sslcommerzIpn,
  viewSummary, viewers, talent,
  adminOverview, adminPromoCodes, adminCreatePromoCode, adminSetPromoActive
};
