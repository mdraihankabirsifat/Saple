const applicationService = require('../services/application.service');
const { sendSuccess } = require('../utils/apiResponse');

async function apply(request, response, next) {
  try {
    const result = await applicationService.applyToJob(request.user, request.params.jobId, request.body, request.file || null);
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

// The resume PDF itself, streamed only to someone allowed to read it. It is
// never cached, never sniffed as another type and never linked publicly.
function sendResume(response, resume, disposition) {
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `${disposition}; filename="${resume.fileName}"`);
  response.setHeader('Content-Length', String(resume.data.length));
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'private, no-store');
  return response.status(200).end(resume.data);
}

async function getOwnResume(request, response, next) {
  try {
    const disposition = applicationService.resumeDisposition(request.query.disposition);
    const resume = await applicationService.getOwnResume(request.user, request.params.applicationId);
    return sendResume(response, resume, disposition);
  } catch (error) { return next(error); }
}

async function getScopedResume(request, response, next) {
  try {
    const disposition = applicationService.resumeDisposition(request.query.disposition);
    const resume = await applicationService.getScopedResume(request.user, request.params.applicationId);
    return sendResume(response, resume, disposition);
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

module.exports = { apply, listOwn, getOwn, withdrawOwn, listScoped, getScoped, decide, getOwnResume, getScopedResume };
