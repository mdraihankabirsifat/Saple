const verificationRepository = require('../repositories/verification.repository');
const { sendFailure } = require('../utils/apiResponse');

async function requireVerifiedEmployee(request, response, next) {
  const companyId = Number(request.params.companyId);
  if (!/^\d+$/.test(String(request.params.companyId)) || !Number.isSafeInteger(companyId) || companyId <= 0) {
    return sendFailure(response, 400, 'Invalid company ID');
  }

  const roleId = Number(request.body?.roleId);
  if (!/^\d+$/.test(String(request.body?.roleId)) || !Number.isSafeInteger(roleId) || roleId <= 0) {
    return sendFailure(response, 400, 'Invalid role ID');
  }

  try {
    const verification = await verificationRepository.findActiveVerifiedEmployment(
      request.user.userId,
      companyId,
      roleId
    );
    if (!verification) {
      return sendFailure(
        response,
        403,
        'Employee verification is required for this company and designation'
      );
    }
    request.verifiedEmployment = verification;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = requireVerifiedEmployee;
