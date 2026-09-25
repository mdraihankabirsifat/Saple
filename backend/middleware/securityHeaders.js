const securityConfig = require('../config/security');
const { NOINDEX_VALUE, isPrivatePath } = require('../config/pages');

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

  // Account flows, workspaces and the API are never indexed. The pages repeat
  // this in a robots meta tag; the header covers anything that reaches a
  // crawler without the HTML being parsed.
  if (isPrivatePath(request.path)) {
    response.setHeader('X-Robots-Tag', NOINDEX_VALUE);
  }

  return next();
}

module.exports = securityHeaders;
