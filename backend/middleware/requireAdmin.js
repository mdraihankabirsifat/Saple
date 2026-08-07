const { sendFailure } = require('../utils/apiResponse');

function requireAdmin(request, response, next) {
  if (request.user?.role !== 'ADMIN') {
    return sendFailure(response, 403, 'Administrator access is required');
  }

  return next();
}

module.exports = requireAdmin;
