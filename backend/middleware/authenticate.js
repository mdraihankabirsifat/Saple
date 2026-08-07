const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth');
const { sendFailure } = require('../utils/apiResponse');

function authenticate(request, response, next) {
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

    if (!Number.isSafeInteger(payload.userId) || payload.userId <= 0 || typeof payload.role !== 'string') {
      return sendFailure(response, 401, 'Invalid or expired authentication token');
    }

    request.user = {
      userId: payload.userId,
      role: payload.role
    };

    return next();
  } catch (error) {
    return sendFailure(response, 401, 'Invalid or expired authentication token');
  }
}

module.exports = authenticate;
