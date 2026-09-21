const { sendFailure } = require('../utils/apiResponse');

// Holding the role is not enough: at least one scope must still be ACTIVE in
// PostgreSQL, which authenticate() reloaded on this request.
function requireCompanyRepresentative(request, response, next) {
  if (request.user?.role !== 'COMPANY_REPRESENTATIVE') {
    return sendFailure(response, 403, 'Company representative access is required');
  }

  if (!request.user.representativeCompanyIds?.length) {
    return sendFailure(
      response,
      403,
      'No active company assignment is available for this account'
    );
  }

  return next();
}

module.exports = requireCompanyRepresentative;
