const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth');
const userRepository = require('../repositories/user.repository');
const representativeRepository = require('../repositories/representative.repository');
const { sendFailure } = require('../utils/apiResponse');

const ACCOUNT_ROLES = Object.freeze(['USER', 'ADMIN', 'COMPANY_REPRESENTATIVE']);

async function authenticate(request, response, next) {
  const authorization = request.get('Authorization');

  if (!authorization) {
    return sendFailure(response, 401, 'Authentication is required');
  }

  const [scheme, token, extra] = authorization.trim().split(/\s+/);

  if (scheme !== 'Bearer' || !token || extra) {
    return sendFailure(response, 401, 'A valid Bearer token is required');
  }

  let secret;

  try {
    secret = authConfig.getJwtSecret();
  } catch (error) {
    return next(error);
  }

  try {
    const payload = jwt.verify(token, secret, {
      algorithms: [authConfig.JWT_ALGORITHM],
      issuer: authConfig.JWT_ISSUER,
      audience: authConfig.JWT_AUDIENCE
    });

    if (
      !Number.isSafeInteger(payload.userId)
      || payload.userId <= 0
      || !Number.isSafeInteger(payload.tokenVersion)
      || payload.tokenVersion < 0
      || !ACCOUNT_ROLES.includes(payload.role)
    ) {
      return sendFailure(response, 401, 'Invalid or expired authentication token');
    }

    // The JWT role claim is never trusted on its own. Status, token version,
    // role and company scopes are all reloaded from PostgreSQL per request.
    const account = await userRepository.findAuthorizationById(payload.userId);
    if (!account || account.accountStatus !== 'ACTIVE') {
      return sendFailure(response, 401, 'Authenticated account is unavailable');
    }
    if (account.tokenVersion !== payload.tokenVersion) {
      return sendFailure(response, 401, 'Authentication token has been revoked');
    }

    const representativeScopes = account.accountRole === 'COMPANY_REPRESENTATIVE'
      ? await representativeRepository.findActiveScopesByUserId(payload.userId)
      : [];

    request.user = {
      userId: payload.userId,
      role: account.accountRole,
      representativeScopes,
      representativeCompanyIds: representativeScopes.map((scope) => scope.companyId)
    };

    return next();
  } catch (error) {
    if (!['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) {
      return next(error);
    }
    return sendFailure(response, 401, 'Invalid or expired authentication token');
  }
}

module.exports = authenticate;
module.exports.ACCOUNT_ROLES = ACCOUNT_ROLES;
