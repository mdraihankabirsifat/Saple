// Explicit security headers for Saple. Written directly instead of pulling in
// Helmet so every directive is visible, testable and tied to what the site
// actually loads: first-party HTML, CSS, JavaScript, SVG and JSON only.

const MAX_JSON_BODY_BYTES = 64 * 1024;
const HSTS_MAX_AGE_SECONDS = 15552000; // 180 days.

// Saple loads no third-party scripts, styles, fonts, frames or images.
// 'self' everywhere is not a placeholder: it is the whole runtime surface.
const CONTENT_SECURITY_POLICY = Object.freeze({
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'manifest-src': ["'self'"],
  'worker-src': ["'self'"],
  'media-src': ["'none'"],
  'object-src': ["'none'"],
  'frame-src': ["'none'"],
  'child-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'"],
  'base-uri': ["'self'"]
});

// Features Saple never uses. Denying them keeps a compromised page from asking.
const PERMISSIONS_POLICY = Object.freeze([
  'accelerometer=()',
  'autoplay=()',
  'camera=()',
  'display-capture=()',
  'encrypted-media=()',
  'fullscreen=(self)',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'usb=()',
  'xr-spatial-tracking=()'
].join(', '));

function buildContentSecurityPolicy({ upgradeInsecureRequests = false } = {}) {
  const directives = Object.entries(CONTENT_SECURITY_POLICY)
    .map(([name, values]) => `${name} ${values.join(' ')}`);

  if (upgradeInsecureRequests) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

function isHttpsRequest(request) {
  // Render terminates TLS at its proxy, so trust proxy plus request.protocol
  // is the only honest signal available inside the container.
  return request.protocol === 'https' || request.secure === true;
}

function buildSecurityHeaders(request, { enableHsts = true } = {}) {
  const https = isHttpsRequest(request);
  const headers = {
    'Content-Security-Policy': buildContentSecurityPolicy({ upgradeInsecureRequests: https }),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': PERMISSIONS_POLICY,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'Origin-Agent-Cluster': '?1'
  };

  // HSTS only over real HTTPS: sending it over plain HTTP local development
  // would pin localhost to a scheme the static dev server does not speak.
  if (https && enableHsts) {
    headers['Strict-Transport-Security'] = `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`;
  }

  return headers;
}

module.exports = {
  CONTENT_SECURITY_POLICY,
  PERMISSIONS_POLICY,
  HSTS_MAX_AGE_SECONDS,
  MAX_JSON_BODY_BYTES,
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  isHttpsRequest
};
