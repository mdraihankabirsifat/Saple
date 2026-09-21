const representativeService = require('../services/representative.service');
const { sendSuccess } = require('../utils/apiResponse');

async function requestAssignment(request, response, next) {
  try {
    const result = await representativeService.requestAssignment(request.user.userId, request.body);
    return sendSuccess(response, 201, 'Representative request submitted successfully', result);
  } catch (error) { return next(error); }
}

async function getOwnAssignments(request, response, next) {
  try {
    const assignments = await representativeService.getOwnAssignments(request.user.userId);
    return sendSuccess(response, 200, 'Your representative assignments retrieved successfully', assignments);
  } catch (error) { return next(error); }
}

async function getWorkspace(request, response, next) {
  try {
    return sendSuccess(response, 200, 'Representative workspace retrieved successfully', {
      scopes: request.user.representativeScopes
    });
  } catch (error) { return next(error); }
}

async function listAssignments(request, response, next) {
  try {
    const result = await representativeService.listAssignments(request.query);
    return sendSuccess(response, 200, 'Representative assignments retrieved successfully', result);
  } catch (error) { return next(error); }
}

async function getAssignment(request, response, next) {
  try {
    const assignment = await representativeService.getAssignment(request.params.assignmentId);
    return sendSuccess(response, 200, 'Representative assignment retrieved successfully', assignment);
  } catch (error) { return next(error); }
}

async function getAssignmentHistory(request, response, next) {
  try {
    const history = await representativeService.getAssignmentHistory(request.params.assignmentId);
    return sendSuccess(response, 200, 'Assignment history retrieved successfully', history);
  } catch (error) { return next(error); }
}

async function decideAssignment(request, response, next) {
  try {
    const result = await representativeService.decideAssignment(
      request.user.userId, request.params.assignmentId, request.body
    );
    return sendSuccess(response, 200, 'Representative decision recorded successfully', result);
  } catch (error) { return next(error); }
}

module.exports = {
  requestAssignment, getOwnAssignments, getWorkspace,
  listAssignments, getAssignment, getAssignmentHistory, decideAssignment
};
