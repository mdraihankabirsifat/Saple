const homeService = require('../services/home.service');
const { sendSuccess } = require('../utils/apiResponse');

async function recommendations(request, response, next) {
  try {
    return sendSuccess(response, 200, 'Homepage recommendations retrieved',
      await homeService.getRecommendations(request.user || null));
  } catch (error) { return next(error); }
}

async function activity(request, response, next) {
  try {
    return sendSuccess(response, 200, 'Activity retrieved', await homeService.getActivitySeries());
  } catch (error) { return next(error); }
}

module.exports = { recommendations, activity };
