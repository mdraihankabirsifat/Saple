const { sendFailure } = require('../utils/apiResponse');

function createPasswordResetRateLimit({ limit = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const requests = new Map();

  return function passwordResetRateLimit(request, response, next) {
    const now = Date.now();
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const key = `${request.ip || request.socket?.remoteAddress || 'unknown'}:${email}`;
    const recent = (requests.get(key) || []).filter((timestamp) => now - timestamp < windowMs);

    if (recent.length >= limit) {
      return sendFailure(response, 429, 'Too many password-reset requests. Please try again later.');
    }

    recent.push(now);
    requests.set(key, recent);

    if (requests.size > 1000) {
      for (const [storedKey, timestamps] of requests) {
        if (!timestamps.some((timestamp) => now - timestamp < windowMs)) requests.delete(storedKey);
      }
    }

    return next();
  };
}

module.exports = createPasswordResetRateLimit();
module.exports.createPasswordResetRateLimit = createPasswordResetRateLimit;
