const browseService = require('../services/browse.service');
const premiumService = require('../services/premium.service');
const { sendSuccess } = require('../utils/apiResponse');

async function getSalaries(request, response, next) {
  try {
    return sendSuccess(response, 200, 'Approved salary insights retrieved successfully',
      await browseService.getPublicSalaryInsights(request.query));
  } catch (error) { return next(error); }
}

async function getReviews(request, response, next) {
  try {
    return sendSuccess(response, 200, 'Approved reviews retrieved successfully',
      await browseService.getPublicReviews(request.query));
  } catch (error) { return next(error); }
}

async function getInterviews(request, response, next) {
  try {
    return sendSuccess(response, 200, 'Approved interview experiences retrieved successfully',
      await premiumService.gateInterviews(await browseService.getPublicInterviews(request.query), request.user?.userId));
  } catch (error) { return next(error); }
}

module.exports = { getSalaries, getReviews, getInterviews };
