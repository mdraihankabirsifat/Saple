const TOKEN_KEY = 'saple.auth.token';
const USER_KEY = 'saple.auth.user';

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function getStoredUser() {
  const value = sessionStorage.getItem(USER_KEY);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    sessionStorage.removeItem(USER_KEY);
    return null;
  }
}

function setSession(token, user) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

function setStoredUser(user) {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

function isAuthenticated() {
  return Boolean(getToken());
}

async function getCurrentUser() {
  if (!getToken()) {
    return null;
  }

  const { apiRequest } = await import('./api.js');
  const data = await apiRequest('/api/auth/me', { auth: true });
  setStoredUser(data.user);
  return data.user;
}

export {
  getToken,
  getStoredUser,
  setSession,
  setStoredUser,
  clearSession,
  isAuthenticated,
  getCurrentUser
};
