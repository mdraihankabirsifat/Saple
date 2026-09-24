import { clearSession, getCurrentUser, isAuthenticated } from './auth.js';

// Server-checked page guard.
//
// A token in sessionStorage proves nothing: it can be expired, revoked by a
// password change or a sign-out elsewhere, or belong to a suspended account.
// Every page that shows account data therefore asks the backend who this
// browser is, through GET /api/auth/me, before it requests anything private.
//
// This is a usability guard, not the security boundary. The backend's
// authenticate and role middleware decide what an account may actually read
// or change, and they run on every request whatever the browser believes.

// Only Saple's own pages may be used as a returnTo, so a crafted link can
// never send a visitor to another origin after signing in.
const RETURN_PAGES = new Set([
  'admin.html',
  'representative.html',
  'profile.html',
  'my-applications.html',
  'employee-verification.html',
  'submit-salary.html',
  'submit-review.html',
  'interview-experience.html',
  'job-details.html',
  'index.html'
]);

export function signInHref(returnTo) {
  const page = String(returnTo || '').split('/').pop();
  return RETURN_PAGES.has(page)
    ? `login.html?returnTo=${encodeURIComponent(page)}`
    : 'login.html';
}

export function currentPageName() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

/**
 * Confirms the session with the backend before any private request.
 *
 * Returns the account the server reports, or null when the page must not
 * continue. An unauthenticated visitor is sent to the sign-in page; a signed-in
 * account without the required role is handed to onDenied so the page can show
 * its own access-denied state.
 */
export async function requireSession({ returnTo = currentPageName(), roles = null, onDenied, onError } = {}) {
  const redirectToSignIn = () => window.location.replace(signInHref(returnTo));

  if (!isAuthenticated()) {
    redirectToSignIn();
    return null;
  }

  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    // The server rejected the token: it is expired, revoked or suspended.
    if (error.kind === 'AUTH' || error.status === 401) {
      clearSession();
      redirectToSignIn();
      return null;
    }
    // Anything else (offline, server error) is the page's to report.
    if (onError) onError(error);
    return null;
  }

  if (roles && !roles.includes(user.accountRole)) {
    if (onDenied) onDenied(user);
    return null;
  }

  return user;
}
