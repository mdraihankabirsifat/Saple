const interviewService = require('../services/interview.service');
const { sendSuccess } = require('../utils/apiResponse');
async function submit(request, response, next) {
  try { return sendSuccess(response, 201, 'Interview experience submitted for moderation', await interviewService.submitInterview(request.user.userId, request.params.companyId, request.body)); }
  catch (error) { return next(error); }
}
async function list(request, response, next) {
  try { return sendSuccess(response, 200, 'Approved interview experiences retrieved successfully', await interviewService.getApprovedInterviews(request.params.companyId)); }
  catch (error) { return next(error); }
}
module.exports = { submit, list };
