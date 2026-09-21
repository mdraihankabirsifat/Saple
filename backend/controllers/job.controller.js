const jobService = require('../services/job.service');
const { sendSuccess } = require('../utils/apiResponse');

async function listPublic(request, response, next) {
  try {
    const result = await jobService.listPublicJobs(request.query);
    return sendSuccess(response, 200, 'Open jobs retrieved successfully', result);
  } catch (error) { return next(error); }
}

async function getFilterOptions(request, response, next) {
  try {
    const options = await jobService.getPublicJobFilterOptions();
    return sendSuccess(response, 200, 'Job filter options retrieved successfully', options);
  } catch (error) { return next(error); }
}

async function getPublic(request, response, next) {
  try {
    const job = await jobService.getPublicJob(request.params.jobId);
    return sendSuccess(response, 200, 'Job posting retrieved successfully', job);
  } catch (error) { return next(error); }
}

async function listManaged(request, response, next) {
  try {
    const result = await jobService.listManagedJobs(request.user, request.query);
    return sendSuccess(response, 200, 'Job postings retrieved successfully', result);
  } catch (error) { return next(error); }
}

async function getManaged(request, response, next) {
  try {
    const job = await jobService.getManagedJob(request.user, request.params.jobId);
    return sendSuccess(response, 200, 'Job posting retrieved successfully', job);
  } catch (error) { return next(error); }
}

async function create(request, response, next) {
  try {
    const result = await jobService.createJob(request.user, request.params.companyId, request.body);
    return sendSuccess(response, 201, 'Job posting created successfully', result);
  } catch (error) { return next(error); }
}

async function update(request, response, next) {
  try {
    const result = await jobService.updateJob(request.user, request.params.jobId, request.body);
    return sendSuccess(response, 200, 'Job posting updated successfully', result);
  } catch (error) { return next(error); }
}

async function updateStatus(request, response, next) {
  try {
    const result = await jobService.changeJobStatus(request.user, request.params.jobId, request.body);
    return sendSuccess(response, 200, 'Job posting status updated successfully', result);
  } catch (error) { return next(error); }
}

async function getOverviewCounts(request, response, next) {
  try {
    const counts = await jobService.getPublicCounts();
    return sendSuccess(response, 200, 'Public Saple counts retrieved successfully', counts);
  } catch (error) { return next(error); }
}

module.exports = {
  listPublic, getFilterOptions, getPublic, listManaged, getManaged,
  create, update, updateStatus, getOverviewCounts
};
