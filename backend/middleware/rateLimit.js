const { sendFailure } = require('../utils/apiResponse');

// Fixed-window, per-process counter. Documented limitation: Render free tier
// runs one instance, so this is adequate there, but a multi-instance
// deployment needs a shared store. See docs/security-and-safe-deployment.md.
const MAX_TRACKED_KEYS = 5000;

function defaultKey(request) {
  return request.ip || request.socket?.remoteAddress || 'unknown';
}

function createRateLimit({
  limit = 30,
  windowMs = 15 * 60 * 1000,
  message = 'Too many requests. Please slow down and try again later.',
  keyFor = defaultKey
} = {}) {
  const requests = new Map();

  function rateLimit(request, response, next) {
    const now = Date.now();
    const key = keyFor(request);
    const recent = (requests.get(key) || []).filter((timestamp) => now - timestamp < windowMs);

    if (recent.length >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000));
      response.setHeader('Retry-After', String(retryAfterSeconds));
      return sendFailure(response, 429, message);
    }

    recent.push(now);
    requests.set(key, recent);

    if (requests.size > MAX_TRACKED_KEYS) {
      for (const [storedKey, timestamps] of requests) {
        if (!timestamps.some((timestamp) => now - timestamp < windowMs)) requests.delete(storedKey);
      }
    }

    return next();
  }

  rateLimit.reset = () => requests.clear();
  return rateLimit;
}

// Identify the signed-in account where one exists so a shared campus or office
// IP address cannot exhaust another student's allowance.
function accountOrAddressKey(request) {
  return request.user?.userId ? `user:${request.user.userId}` : `ip:${defaultKey(request)}`;
}

module.exports = { createRateLimit, accountOrAddressKey, defaultKey };
