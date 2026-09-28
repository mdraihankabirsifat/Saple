const service = require('../services/search.service');
const { sendSuccess } = require('../utils/apiResponse');

async function people(request, response, next) {
  try {
    return sendSuccess(response, 200, 'People retrieved', {
      users: await service.people(request.query.q, request.user.userId)
    });
  } catch (error) { return next(error); }
}

async function all(request, response, next) {
  try {
    return sendSuccess(response, 200, 'Search results retrieved',
      await service.all(request.query.q, request.user.userId));
  } catch (error) { return next(error); }
}

module.exports = { people, all };
