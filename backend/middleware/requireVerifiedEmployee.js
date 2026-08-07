const verificationRepository = require('../repositories/verification.repository');
const { sendFailure } = require('../utils/apiResponse');

async function requireVerifiedEmployee(request, response, next) {
  const companyId = Number(request.params.companyId);
  if (!/^\d+$/.test(String(request.params.companyId)) || !Number.isSafeInteger(companyId) || companyId <= 0) {
    return sendFailure(response, 400, 'Invalid company ID');
  }

  try {
    const verification = await verificationRepository.findActiveVerifiedEmployment(
      request.user.userId,
      companyId
    );
    if (!verification) {
      return sendFailure(
        response,
        403,
        'Employee verification is required for this company'
      );
    }
    request.verifiedEmployment = verification;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = requireVerifiedEmployee;
