// Payment gateway configuration. Credentials come only from the environment
// (backend/.env locally, Cloudflare secrets in production) and are never
// returned, logged or included in an error message.

// SSLCommerz API v4 uses two hosts. Sandbox checkout sessions are created on
// sandbox-gw.sslcommerz.com and transactions are validated on
// sandbox.sslcommerz.com; live uses securepay.sslcommerz.com for both.
// SSLCOMMERZ_SESSION_BASE_URL and SSLCOMMERZ_VALIDATION_BASE_URL set each
// host; SSLCOMMERZ_BASE_URL, if set, is the fallback for either.
const DEFAULT_SSLCOMMERZ_SESSION_BASE_URL = 'https://sandbox-gw.sslcommerz.com';
const DEFAULT_SSLCOMMERZ_VALIDATION_BASE_URL = 'https://sandbox.sslcommerz.com';
const DEFAULT_SSLCOMMERZ_BASE_URL = DEFAULT_SSLCOMMERZ_VALIDATION_BASE_URL;

function httpsOrigin(rawValue, name) {
  let url;
  try {
    url = new URL(rawValue);
  } catch (error) {
    throw new Error(`${name} must be a valid URL`);
  }
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password) {
    throw new Error(`${name} must be an HTTPS URL without credentials`);
  }
  return url.origin;
}

function gatewayName() {
  return (process.env.PAYMENT_GATEWAY || 'sslcommerz').trim().toLowerCase();
}

// Null when payments are simply not configured yet, so the rest of Saple (and
// the free trial) keeps working without gateway credentials.
function getSslcommerzConfig() {
  const storeId = process.env.SSLCOMMERZ_STORE_ID?.trim();
  const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD?.trim();
  const publicOrigin = process.env.PUBLIC_API_ORIGIN?.trim();
  if (!storeId || !storePassword || !publicOrigin) return null;
  const shared = process.env.SSLCOMMERZ_BASE_URL?.trim();
  const sessionBaseUrl = httpsOrigin(
    process.env.SSLCOMMERZ_SESSION_BASE_URL?.trim() || shared || DEFAULT_SSLCOMMERZ_SESSION_BASE_URL,
    'SSLCOMMERZ_SESSION_BASE_URL'
  );
  const validationBaseUrl = httpsOrigin(
    process.env.SSLCOMMERZ_VALIDATION_BASE_URL?.trim() || shared || DEFAULT_SSLCOMMERZ_VALIDATION_BASE_URL,
    'SSLCOMMERZ_VALIDATION_BASE_URL'
  );
  const isSandbox = (origin) => /^sandbox[.-]/.test(new URL(origin).hostname);
  return {
    storeId,
    storePassword,
    sessionBaseUrl,
    validationBaseUrl,
    publicOrigin: httpsOrigin(publicOrigin, 'PUBLIC_API_ORIGIN'),
    // Only when both hosts are sandbox hosts; a mix is treated as live.
    sandbox: isSandbox(sessionBaseUrl) && isSandbox(validationBaseUrl)
  };
}

// Safe to show anyone: whether checkout can run, and whether it is sandbox.
function getPublicPaymentStatus() {
  try {
    const config = gatewayName() === 'sslcommerz' ? getSslcommerzConfig() : null;
    return { paymentsEnabled: Boolean(config), gateway: 'SSLCOMMERZ', sandbox: config ? config.sandbox : null };
  } catch (error) {
    return { paymentsEnabled: false, gateway: 'SSLCOMMERZ', sandbox: null };
  }
}

function readLimit(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 && value <= 1000 ? value : fallback;
}

function getPremiumAiLimits() {
  return {
    chatPerDay: readLimit('PREMIUM_AI_DAILY_CHAT_LIMIT', 30),
    // Resume generation is open to every signed-in member; Premium and trial
    // members get the larger daily allowance.
    resumePerDay: readLimit('PREMIUM_RESUME_DAILY_LIMIT', 10),
    freeResumePerDay: readLimit('RESUME_FREE_DAILY_LIMIT', 3)
  };
}

module.exports = {
  DEFAULT_SSLCOMMERZ_BASE_URL,
  DEFAULT_SSLCOMMERZ_SESSION_BASE_URL,
  DEFAULT_SSLCOMMERZ_VALIDATION_BASE_URL,
  gatewayName,
  getSslcommerzConfig,
  getPublicPaymentStatus,
  getPremiumAiLimits
};
