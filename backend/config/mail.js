function readInteger(name, defaultValue, minimum, maximum) {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) return defaultValue;

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function readBoolean(name, defaultValue) {
  const rawValue = process.env[name]?.trim().toLowerCase();

  if (!rawValue) return defaultValue;
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function getPasswordResetTokenTtlMinutes() {
  return readInteger('PASSWORD_RESET_TOKEN_TTL_MINUTES', 15, 1, 1440);
}

function getFrontendUrl() {
  const rawUrl = process.env.FRONTEND_URL?.trim();

  if (!rawUrl) throw new Error('FRONTEND_URL is required for password recovery');

  let url;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new Error('FRONTEND_URL must be a valid HTTP or HTTPS URL');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('FRONTEND_URL must be a valid HTTP or HTTPS URL without credentials');
  }

  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.toString();
}

function getSmtpConfig() {
  const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
  const missing = required.filter((name) => !process.env[name]?.trim());

  if (missing.length > 0) {
    throw new Error(`Missing required SMTP configuration: ${missing.join(', ')}`);
  }

  return {
    host: process.env.SMTP_HOST.trim(),
    port: readInteger('SMTP_PORT', 587, 1, 65535),
    secure: readBoolean('SMTP_SECURE', false),
    user: process.env.SMTP_USER.trim(),
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM.trim()
  };
}

module.exports = {
  getFrontendUrl,
  getPasswordResetTokenTtlMinutes,
  getSmtpConfig
};
