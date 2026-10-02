const premiumService = require('../services/premium.service');
const { sendFailure } = require('../utils/apiResponse');

// Runs after authenticate(). Premium is decided by the database on every
// request (an active one-day trial or a paid period), never by the token.
async function requirePremium(request, response, next) {
  try {
    const access = await premiumService.getPremiumAccess(request.user?.userId);
    if (!await premiumService.hasPremiumFeatureAccess(request.user?.userId)) {
      return sendFailure(response, 403, 'This feature is part of Saple Premium.', { code: 'PREMIUM_REQUIRED' });
    }
    request.premium = access;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = requirePremium;
