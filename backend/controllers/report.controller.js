const reportService = require('../services/report.service');
const { sendSuccess } = require('../utils/apiResponse');
async function submit(request, response, next) {
  try { return sendSuccess(response, 201, 'Report submitted for review', await reportService.submitReport(request.user.userId, request.params.submissionId, request.body)); }
  catch (error) { return next(error); }
}
async function list(request, response, next) {
  try { return sendSuccess(response, 200, 'Reports retrieved successfully', await reportService.getReports()); }
  catch (error) { return next(error); }
}
async function getOne(request, response, next) {
  try { return sendSuccess(response, 200, 'Report retrieved successfully', await reportService.getReport(request.params.reportId)); }
  catch (error) { return next(error); }
}
async function updateStatus(request, response, next) {
  try { return sendSuccess(response, 200, 'Report status updated successfully', await reportService.updateStatus(request.user.userId, request.params.reportId, request.body)); }
  catch (error) { return next(error); }
}
module.exports = { submit, list, getOne, updateStatus };
