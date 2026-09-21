// Exactly the static-server origins Saple documents for local development.
// Nothing here is a wildcard, and no production origin is implied.
const LOCAL_DEVELOPMENT_PORTS = Object.freeze([5500, 5501]);
const LOCAL_DEVELOPMENT_ORIGINS = Object.freeze(
  LOCAL_DEVELOPMENT_PORTS.flatMap((port) => [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`
  ])
);

function normalizeHttpOrigin(value, settingName = 'origin') {
  let url;

  try {
    url = new URL(value);
  } catch (error) {
    throw new Error(`${settingName} must contain valid HTTP or HTTPS origins`);
  }

  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    throw new Error(`${settingName} must contain valid HTTP or HTTPS origins without credentials or paths`);
  }

  return url.origin;
}

function getAllowedCorsOrigins(rawValue = process.env.CORS_ORIGINS) {
  const configuredOrigins = typeof rawValue === 'string' && rawValue.trim()
    ? rawValue.split(',').map((value) => normalizeHttpOrigin(value.trim(), 'CORS_ORIGINS'))
    : [];

  return new Set([...LOCAL_DEVELOPMENT_ORIGINS, ...configuredOrigins]);
}

function isRenderEnvironment() {
  return process.env.RENDER === 'true';
}

function createCorsOptionsDelegate(rawValue = process.env.CORS_ORIGINS) {
  const allowedOrigins = getAllowedCorsOrigins(rawValue);

  return function corsOptionsDelegate(request, callback) {
    const originHeader = request.get('Origin');

    if (!originHeader) {
      return callback(null, { origin: false });
    }

    let requestOrigin;
    let browserOrigin;

    try {
      requestOrigin = normalizeHttpOrigin(
        `${request.protocol}://${request.get('host')}`,
        'request origin'
      );
      browserOrigin = normalizeHttpOrigin(originHeader, 'Origin header');
    } catch (error) {
      return callback(null, { origin: false });
    }

    const isAllowed = browserOrigin === requestOrigin || allowedOrigins.has(browserOrigin);
    return callback(null, { origin: isAllowed ? browserOrigin : false });
  };
}

// Redirect and return-path safety: Saple only ever navigates to its own
// same-origin pages, so any candidate must be a plain relative app path.
const SAFE_INTERNAL_PATH = /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]*$/;

function isSafeInternalPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return false;
  // Reject protocol-relative //evil.test, backslash tricks, traversal and
  // anything carrying a scheme, query or fragment.
  if (value.startsWith('//') || value.includes('\\') || value.includes('..')) return false;
  if (value.includes('?') || value.includes('#') || value.includes(':')) return false;
  return SAFE_INTERNAL_PATH.test(value);
}

module.exports = {
  LOCAL_DEVELOPMENT_ORIGINS,
  LOCAL_DEVELOPMENT_PORTS,
  isSafeInternalPath,
  createCorsOptionsDelegate,
  getAllowedCorsOrigins,
  isRenderEnvironment,
  normalizeHttpOrigin
};
