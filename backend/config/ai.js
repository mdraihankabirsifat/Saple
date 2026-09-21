// Configuration for the optional Saple Guide.
//
// Saple calls exactly one OpenAI-compatible chat-completions endpoint, chosen
// by the owner through environment variables. The base URL is read from
// configuration and never from a request, so this is not a URL relay: a caller
// cannot make Saple fetch a destination of their choosing.

const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 30000;
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_OUTPUT_TOKENS = 400;

function readBoolean(name, defaultValue) {
  const rawValue = process.env[name]?.trim().toLowerCase();
  if (!rawValue) return defaultValue;
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function readInteger(name, defaultValue, minimum, maximum) {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return defaultValue;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

// The provider endpoint must be an ordinary HTTPS URL with no embedded
// credentials. Rejecting credentials here keeps a key out of logs and history.
function normalizeProviderUrl(rawValue) {
  let url;
  try {
    url = new URL(rawValue);
  } catch (error) {
    throw new Error('AI_API_BASE_URL must be a valid HTTPS URL');
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('AI_API_BASE_URL must be an HTTPS URL without credentials or a fragment');
  }

  return url.toString().replace(/\/+$/, '');
}

function isEnabled() {
  return readBoolean('AI_ENABLED', false);
}

// Returns null instead of throwing when the guide is simply switched off, so a
// missing AI configuration can never take the rest of the site down.
function getAiConfig() {
  if (!isEnabled()) return null;

  const apiKey = process.env.AI_API_KEY?.trim();
  const baseUrl = process.env.AI_API_BASE_URL?.trim();
  const model = process.env.AI_MODEL?.trim();
  const missing = [
    !apiKey && 'AI_API_KEY',
    !baseUrl && 'AI_API_BASE_URL',
    !model && 'AI_MODEL'
  ].filter(Boolean);

  if (missing.length > 0) {
    // Names only. Values are never logged, returned or included in errors.
    const error = new Error(`Missing required AI configuration: ${missing.join(', ')}`);
    error.sapleCode = 'AI_NOT_CONFIGURED';
    throw error;
  }

  if (model.length > 120) throw new Error('AI_MODEL must not exceed 120 characters');

  return {
    apiKey,
    baseUrl: normalizeProviderUrl(baseUrl),
    model,
    timeoutMs: readInteger('AI_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS),
    maxOutputTokens: readInteger('AI_MAX_OUTPUT_TOKENS', DEFAULT_MAX_OUTPUT_TOKENS, 64, 1500)
  };
}

// Safe to expose publicly: it says whether the guide can call a provider, and
// nothing about which provider, which model or which key.
function getPublicStatus() {
  if (!isEnabled()) return { aiEnabled: false, reason: 'DISABLED' };
  try {
    getAiConfig();
    return { aiEnabled: true, reason: null };
  } catch (error) {
    return { aiEnabled: false, reason: 'NOT_CONFIGURED' };
  }
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  isEnabled,
  getAiConfig,
  getPublicStatus,
  normalizeProviderUrl
};
