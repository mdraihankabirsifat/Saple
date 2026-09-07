import { clearSession, getToken } from './auth.js';

function normalizeApiBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch (error) {
    return null;
  }
}

function resolveApiBaseUrl(location = window.location, override = window.SAPLE_API_BASE_URL) {
  const configuredOverride = normalizeApiBaseUrl(override);
  if (configuredOverride) return configuredOverride;

  const isSeparateLocalFrontend = (
    ['localhost', '127.0.0.1'].includes(location.hostname)
    && location.port === '5500'
  );

  if (isSeparateLocalFrontend) {
    return `http://${location.hostname}:3000`;
  }

  return location.origin;
}

const API_BASE_URL = resolveApiBaseUrl();

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
      const authenticationError = new Error('Please sign in to continue.');
      authenticationError.status = 401;
      throw authenticationError;
    }

    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  } catch (error) {
    throw new Error('Unable to connect to the Saple API. Make sure the backend is running.');
  }

  let responseBody;

  try {
    responseBody = await response.json();
  } catch (error) {
    throw new Error('The Saple API returned an invalid response.');
  }

  if (!response.ok || !responseBody.success) {
    if (auth && response.status === 401) {
      clearSession();
    }

    const apiError = new Error(responseBody.message || 'The request could not be completed.');
    apiError.status = response.status;
    throw apiError;
  }

  return responseBody.data;
}

function fetchApi(path) {
  return apiRequest(path);
}

export {
  API_BASE_URL,
  apiRequest,
  fetchApi,
  normalizeApiBaseUrl,
  resolveApiBaseUrl
};
