const securityConfig = require('../config/security');

// Applies the same explicit headers to every response, including API JSON,
// static HTML, 404s and errors. Nothing in Saple opts out.
function securityHeaders(request, response, next) {
  const headers = securityConfig.buildSecurityHeaders(request);

  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }

  // Private API answers must never be stored by a shared or browser cache.
  if (request.path.startsWith('/api/')) {
    response.setHeader('Cache-Control', 'no-store');
  }

  return next();
}

module.exports = securityHeaders;
