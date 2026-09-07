const LOCAL_DEVELOPMENT_ORIGINS = Object.freeze([
  'http://localhost:5500',
  'http://127.0.0.1:5500'
]);

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

module.exports = {
  LOCAL_DEVELOPMENT_ORIGINS,
  createCorsOptionsDelegate,
  getAllowedCorsOrigins,
  isRenderEnvironment,
  normalizeHttpOrigin
};
