// The one place that knows which payment gateway is active. Premium code asks
// for a session or a validation and never talks to a provider directly.
const paymentConfig = require('../config/payment');
const sslcommerz = require('./providers/sslcommerz.provider');

function unavailable() {
  const error = new Error('Online payment is not available yet. Please try again later.');
  error.statusCode = 503;
  error.sapleCode = 'PAYMENTS_NOT_CONFIGURED';
  return error;
}

function activeConfig() {
  if (paymentConfig.gatewayName() !== 'sslcommerz') throw unavailable();
  const config = paymentConfig.getSslcommerzConfig();
  if (!config) throw unavailable();
  return config;
}

function isConfigured() {
  try { return Boolean(activeConfig()); } catch (error) { return false; }
}

// Gateway URLs point at Saple's own public API origin.
function callbackUrls(config, publicId) {
  const base = `${config.publicOrigin}/api/premium/payments/${encodeURIComponent(publicId)}/return`;
  return {
    successUrl: `${base}?result=success`,
    failUrl: `${base}?result=fail`,
    cancelUrl: `${base}?result=cancel`,
    ipnUrl: `${config.publicOrigin}/api/webhooks/payments/sslcommerz`
  };
}

async function createSession({ publicId, amount, customerName, customerEmail, planName }) {
  const config = activeConfig();
  return sslcommerz.createSession(config, {
    tranId: publicId,
    amount,
    customerName,
    customerEmail,
    productName: `Saple ${planName}`,
    ...callbackUrls(config, publicId)
  });
}

async function validateTransaction(valId) {
  return sslcommerz.validateTransaction(activeConfig(), valId);
}

module.exports = { isConfigured, callbackUrls, createSession, validateTransaction };
