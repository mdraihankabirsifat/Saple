import { clearSession, getToken } from './auth.js';
import { isCacheable, cacheKey, savePublicData, readPublicData, removePublicData, showOfflineNotice, markLive } from './offline-cache.js';

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];
const LOCAL_OVERRIDE_KEY = 'saple.api-base-url';
const REQUEST_TIMEOUT_MS = 12000;

// Every failure the user interface has to tell apart. The message is what a
// reader sees; the kind is what the page branches on.
const FAILURE = Object.freeze({
  NETWORK: 'We could not reach the Saple API. Check that the backend is running and that you are online.',
  TIMEOUT: 'The Saple API took too long to answer. It may be waking up from sleep.',
  CORS: 'The browser blocked this request because the page and the API are on different origins. Open Saple through the backend at http://localhost:3000, or add this origin to CORS_ORIGINS.',
  INVALID_RESPONSE: 'The Saple API returned an invalid response. This usually means a web page was returned where JSON was expected.',
  SERVER: 'The Saple API had an internal problem. Please try again in a moment.',
  DATABASE: 'The Saple database is unavailable right now. Public pages may show saved data instead.',
  AUTH: 'Please sign in to continue.',
  FORBIDDEN: 'You do not have access to this part of Saple.',
  NOT_FOUND: 'That item is no longer available.',
  CONFLICT: 'That action conflicts with the current state. Refresh and try again.',
  RATE_LIMITED: 'Too many requests from this device. Please wait a moment and try again.',
  VALIDATION: 'Some of the information provided was not accepted.',
  OFFLINE: 'Saple is offline. Saved public pages may still be available.'
});

class SapleApiError extends Error {
  constructor(kind, message, { status = null, retryable = false } = {}) {
    super(message);
    this.name = 'SapleApiError';
    this.kind = kind;
    this.status = status;
    this.retryable = retryable;
  }
}

function normalizeApiBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    // Only plain HTTP(S) origins. Credentials, paths, queries and fragments
    // are all rejected rather than silently stripped from an unknown source.
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch (error) {
    return null;
  }
}

function isLocalHostname(hostname) {
  return LOCAL_HOSTNAMES.includes(hostname);
}

// A developer override is honoured only where it cannot be used to point a
// real visitor at someone else's server: on a local development host, or when
// it names the page's own origin.
function resolveApiBaseUrl(location = window.location, override = readConfiguredOverride()) {
  const candidate = normalizeApiBaseUrl(override);
  const pageIsLocal = isLocalHostname(location.hostname);

  if (candidate && (pageIsLocal || candidate === location.origin)) return candidate;

  // A page opened from a local static server (Live Server on 5500 or 5501, or
  // any other port) talks to the Express backend on port 3000. A page already
  // served by Express stays same-origin.
  if (pageIsLocal && location.port !== '3000') {
    return `http://${location.hostname}:3000`;
  }

  return location.origin;
}

function readConfiguredOverride() {
  if (typeof window === 'undefined') return null;
  if (typeof window.SAPLE_API_BASE_URL === 'string') return window.SAPLE_API_BASE_URL;
  try {
    return window.localStorage?.getItem(LOCAL_OVERRIDE_KEY) ?? null;
  } catch (error) {
    return null;
  }
}

const API_BASE_URL = resolveApiBaseUrl();
const IS_LOCAL_DEVELOPMENT = isLocalHostname(window.location.hostname);

function classifyHttpFailure(status, body) {
  if (status === 401) return new SapleApiError('AUTH', body?.message || FAILURE.AUTH, { status });
  if (status === 403) return new SapleApiError('FORBIDDEN', body?.message || FAILURE.FORBIDDEN, { status });
  if (status === 404) return new SapleApiError('NOT_FOUND', body?.message || FAILURE.NOT_FOUND, { status });
  if (status === 409 || status === 410) {
    return new SapleApiError('CONFLICT', body?.message || FAILURE.CONFLICT, { status });
  }
  if (status === 429) {
    return new SapleApiError('RATE_LIMITED', body?.message || FAILURE.RATE_LIMITED, { status, retryable: true });
  }
  if (status >= 400 && status < 500) {
    return new SapleApiError('VALIDATION', body?.message || FAILURE.VALIDATION, { status });
  }
  // A 5xx from the database health endpoint, or any database failure, is worth
  // naming separately so the page can suggest the right next step.
  const isDatabase = typeof body?.message === 'string' && /database/i.test(body.message);
  return new SapleApiError(
    isDatabase ? 'DATABASE' : 'SERVER',
    body?.message || (isDatabase ? FAILURE.DATABASE : FAILURE.SERVER),
    { status, retryable: true }
  );
}

async function apiRequest(path, options = {}) {
  const {
    method = 'GET',
    body,
    auth = false,
    headers: customHeaders = {}
  } = options;
  const headers = {
    Accept: 'application/json',
    ...customHeaders
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (auth) {
    const token = getToken();

    if (!token) {
      throw new SapleApiError('AUTH', FAILURE.AUTH, { status: 401 });
    }

    headers.Authorization = `Bearer ${token}`;
  }

  const cacheable = isCacheable(path, method, auth, customHeaders);
  const key = cacheable ? cacheKey(API_BASE_URL, path) : null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  function offlineResult() {
    if (!cacheable) return null;
    const saved = readPublicData(key);
    showOfflineNotice(key, saved?.savedAt);
    return saved;
  }

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      signal: controller.signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  } catch (error) {
    const saved = offlineResult();
    if (saved) return saved.data;

    if (error.name === 'AbortError') {
      throw new SapleApiError('TIMEOUT', FAILURE.TIMEOUT, { retryable: true });
    }

    // A browser reports a blocked cross-origin response and a dead server the
    // same way, so the distinction is drawn from what we know about the page.
    const crossOrigin = API_BASE_URL !== window.location.origin;
    throw crossOrigin
      ? new SapleApiError('CORS', FAILURE.CORS, { retryable: true })
      : new SapleApiError('NETWORK', navigator.onLine === false ? FAILURE.OFFLINE : FAILURE.NETWORK, { retryable: true });
  } finally {
    clearTimeout(timeout);
  }

  if (response.status >= 500) {
    const saved = offlineResult();
    if (saved) return saved.data;
  }

  // Status and Content-Type are both checked before any parsing, so an HTML
  // error page from a proxy or a static server is named for what it is.
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const saved = response.ok ? offlineResult() : null;
    if (saved) return saved.data;
    throw new SapleApiError('INVALID_RESPONSE', FAILURE.INVALID_RESPONSE, {
      status: response.status,
      retryable: true
    });
  }

  let responseBody;

  try {
    responseBody = await response.json();
  } catch (error) {
    const saved = response.ok ? offlineResult() : null;
    if (saved) return saved.data;
    throw new SapleApiError('INVALID_RESPONSE', FAILURE.INVALID_RESPONSE, {
      status: response.status,
      retryable: true
    });
  }

  if (!response.ok || !responseBody.success) {
    // An explicit deletion or access denial must never revive stale content.
    if (cacheable && [401, 403, 404, 410].includes(response.status)) removePublicData(key);
    if (auth && response.status === 401) {
      clearSession();
    }

    throw classifyHttpFailure(response.status, responseBody);
  }

  if (cacheable) { savePublicData(key, responseBody.data); markLive(key); }
  return responseBody.data;
}

function fetchApi(path) {
  return apiRequest(path);
}

export {
  API_BASE_URL,
  FAILURE,
  IS_LOCAL_DEVELOPMENT,
  LOCAL_OVERRIDE_KEY,
  SapleApiError,
  apiRequest,
  fetchApi,
  normalizeApiBaseUrl,
  resolveApiBaseUrl
};
