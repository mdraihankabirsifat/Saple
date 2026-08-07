const verificationService = require('../services/verification.service');
const { sendSuccess } = require('../utils/apiResponse');

async function requestVerification(request, response, next) {
  try {
    const result = await verificationService.requestVerification(request.user.userId, request.params.companyId, request.body);
    return sendSuccess(response, 201, 'Verification request submitted successfully', result);
  } catch (error) { return next(error); }
}
async function getPending(request, response, next) {
  try { return sendSuccess(response, 200, 'Pending verifications retrieved successfully', await verificationService.getPendingVerifications()); }
  catch (error) { return next(error); }
}
async function getOne(request, response, next) {
  try { return sendSuccess(response, 200, 'Verification request retrieved successfully', await verificationService.getVerification(request.params.verificationId)); }
  catch (error) { return next(error); }
}
async function updateStatus(request, response, next) {
  try {
    const result = await verificationService.decideVerification(request.user.userId, request.params.verificationId, request.body);
    return sendSuccess(response, 200, 'Verification decision recorded successfully', result);
  } catch (error) { return next(error); }
}

module.exports = { requestVerification, getPending, getOne, updateStatus };
