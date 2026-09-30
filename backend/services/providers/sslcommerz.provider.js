// SSLCommerz adapter (API v4). Native fetch only, so it runs unchanged on
// Node and on Cloudflare Workers. The browser never sees store credentials:
// it only receives the gateway page URL for its own session.

const SESSION_PATH = '/gwprocess/v4/api.php';
const VALIDATION_PATH = '/validator/api/validationserverAPI.php';
const TIMEOUT_MS = 15000;

function gatewayError(status, code, message) {
  const error = new Error(message);
  error.statusCode = status;
  error.sapleCode = code;
  return error;
}

async function fetchJson(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    throw gatewayError(503, 'GATEWAY_UNAVAILABLE', 'The payment gateway could not be reached. Please try again.');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw gatewayError(503, 'GATEWAY_UNAVAILABLE', 'The payment gateway could not be reached. Please try again.');
  }
  try {
    return await response.json();
  } catch (error) {
    throw gatewayError(502, 'GATEWAY_BAD_RESPONSE', 'The payment gateway returned an unreadable answer.');
  }
}

// Creates a hosted checkout session. The payment's public id is the
// transaction id, so validation can always find the right payment row.
async function createSession(config, {
  tranId, amount, customerName, customerEmail, productName,
  successUrl, failUrl, cancelUrl, ipnUrl
}) {
  const body = new URLSearchParams({
    store_id: config.storeId,
    store_passwd: config.storePassword,
    total_amount: Number(amount).toFixed(2),
    currency: 'BDT',
    tran_id: tranId,
    success_url: successUrl,
    fail_url: failUrl,
    cancel_url: cancelUrl,
    ipn_url: ipnUrl,
    cus_name: customerName,
    cus_email: customerEmail,
    // SSLCommerz requires an address and phone; Saple does not collect
    // them, so neutral placeholders are sent instead of personal data.
    cus_add1: 'Dhaka',
    cus_city: 'Dhaka',
    cus_country: 'Bangladesh',
    cus_phone: '01700000000',
    shipping_method: 'NO',
    num_of_item: '1',
    product_name: productName,
    product_category: 'Subscription',
    product_profile: 'general'
  });

  const data = await fetchJson(`${config.baseUrl}${SESSION_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body
  });
  if (data?.status !== 'SUCCESS' || typeof data.GatewayPageURL !== 'string') {
    throw gatewayError(502, 'GATEWAY_SESSION_FAILED', 'The payment gateway could not start a checkout session.');
  }
  const pageUrl = new URL(data.GatewayPageURL);
  if (pageUrl.protocol !== 'https:') {
    throw gatewayError(502, 'GATEWAY_SESSION_FAILED', 'The payment gateway returned an unsafe checkout address.');
  }
  return { redirectUrl: pageUrl.toString(), sessionKey: typeof data.sessionkey === 'string' ? data.sessionkey : null };
}

// Asks SSLCommerz itself whether a transaction is valid. The browser's return
// and the IPN body are never trusted; only this server-to-server answer is.
async function validateTransaction(config, valId) {
  const query = new URLSearchParams({
    val_id: valId,
    store_id: config.storeId,
    store_passwd: config.storePassword,
    format: 'json'
  });
  const data = await fetchJson(`${config.baseUrl}${VALIDATION_PATH}?${query}`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });
  const amountText = data?.currency_type === 'BDT' && data?.currency_amount ? data.currency_amount : data?.amount;
  return {
    valid: data?.status === 'VALID' || data?.status === 'VALIDATED',
    status: typeof data?.status === 'string' ? data.status : null,
    tranId: typeof data?.tran_id === 'string' ? data.tran_id : null,
    valId: typeof data?.val_id === 'string' ? data.val_id : valId,
    amount: amountText !== undefined && amountText !== null && amountText !== '' ? Number(amountText) : null,
    currency: typeof (data?.currency_type || data?.currency) === 'string' ? (data.currency_type || data.currency) : null,
    bankTransactionId: typeof data?.bank_tran_id === 'string' ? data.bank_tran_id : null
  };
}

module.exports = { SESSION_PATH, VALIDATION_PATH, createSession, validateTransaction };
