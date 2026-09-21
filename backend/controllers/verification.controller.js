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

// Company-scoped equivalents used by the representative workspace. The scope
// check lives in the service, so an out-of-scope company ID fails there.
async function listScoped(request, response, next) {
  try {
    const result = await verificationService.getScopedVerifications(request.user, request.query);
    return sendSuccess(response, 200, 'Verification requests retrieved successfully', result);
  } catch (error) { return next(error); }
}
async function getScoped(request, response, next) {
  try {
    const result = await verificationService.getScopedVerification(request.user, request.params.verificationId);
    return sendSuccess(response, 200, 'Verification request retrieved successfully', result);
  } catch (error) { return next(error); }
}
async function decideScoped(request, response, next) {
  try {
    const result = await verificationService.decideScopedVerification(
      request.user, request.params.verificationId, request.body
    );
    return sendSuccess(response, 200, 'Verification decision recorded successfully', result);
  } catch (error) { return next(error); }
}

module.exports = {
  requestVerification, getPending, getOne, updateStatus,
  listScoped, getScoped, decideScoped
};
