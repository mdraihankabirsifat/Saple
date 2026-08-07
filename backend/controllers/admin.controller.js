const adminService = require('../services/admin.service');
const { sendSuccess } = require('../utils/apiResponse');

async function getPendingSubmissions(request, response, next) {
  try {
    const submissions = await adminService.getPendingSubmissions();
    return sendSuccess(response, 200, 'Pending submissions retrieved successfully', submissions);
  } catch (error) {
    return next(error);
  }
}

async function getSubmission(request, response, next) {
  try {
    const submission = await adminService.getSubmission(request.params.submissionId);
    return sendSuccess(response, 200, 'Submission retrieved successfully', submission);
  } catch (error) {
    return next(error);
  }
}

async function updateSubmissionStatus(request, response, next) {
  try {
    const result = await adminService.moderateSubmission(
      request.user.userId,
      request.params.submissionId,
      request.body
    );
    return sendSuccess(response, 200, 'Submission moderation recorded successfully', result);
  } catch (error) {
    return next(error);
  }
}

async function getModerationHistory(request, response, next) {
  try {
    const history = await adminService.getModerationHistory(request.params.submissionId);
    return sendSuccess(response, 200, 'Moderation history retrieved successfully', history);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getPendingSubmissions,
  getSubmission,
  updateSubmissionStatus,
  getModerationHistory
};
