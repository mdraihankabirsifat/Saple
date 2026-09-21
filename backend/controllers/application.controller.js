const applicationService = require('../services/application.service');
const { sendSuccess } = require('../utils/apiResponse');

async function apply(request, response, next) {
  try {
    const result = await applicationService.applyToJob(request.user, request.params.jobId, request.body);
    return sendSuccess(response, 201, 'Application submitted successfully', result);
  } catch (error) { return next(error); }
}

async function listOwn(request, response, next) {
  try {
    const result = await applicationService.listOwnApplications(request.user, request.query);
    return sendSuccess(response, 200, 'Your applications retrieved successfully', result);
  } catch (error) { return next(error); }
}

async function getOwn(request, response, next) {
  try {
    const application = await applicationService.getOwnApplication(request.user, request.params.applicationId);
    return sendSuccess(response, 200, 'Application retrieved successfully', application);
  } catch (error) { return next(error); }
}

async function withdrawOwn(request, response, next) {
  try {
    const result = await applicationService.withdrawOwnApplication(request.user, request.params.applicationId);
    return sendSuccess(response, 200, 'Application withdrawn successfully', result);
  } catch (error) { return next(error); }
}

async function listScoped(request, response, next) {
  try {
    const result = await applicationService.listScopedApplications(request.user, request.query);
    return sendSuccess(response, 200, 'Applications retrieved successfully', result);
  } catch (error) { return next(error); }
}

async function getScoped(request, response, next) {
  try {
    const application = await applicationService.getScopedApplication(request.user, request.params.applicationId);
    return sendSuccess(response, 200, 'Application retrieved successfully', application);
  } catch (error) { return next(error); }
}

async function decide(request, response, next) {
  try {
    const result = await applicationService.decideApplication(
      request.user, request.params.applicationId, request.body
    );
    return sendSuccess(response, 200, 'Application decision recorded successfully', result);
  } catch (error) { return next(error); }
}

module.exports = { apply, listOwn, getOwn, withdrawOwn, listScoped, getScoped, decide };
