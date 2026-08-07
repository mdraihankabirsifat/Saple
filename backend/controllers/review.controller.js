const reviewService = require('../services/review.service');
const { sendSuccess } = require('../utils/apiResponse');
async function submit(request, response, next) {
  try { return sendSuccess(response, 201, 'Review submitted for moderation', await reviewService.submitReview(request.user.userId, request.params.companyId, request.body)); }
  catch (error) { return next(error); }
}
async function list(request, response, next) {
  try { return sendSuccess(response, 200, 'Approved reviews retrieved successfully', await reviewService.getApprovedReviews(request.params.companyId)); }
  catch (error) { return next(error); }
}
module.exports = { submit, list };
