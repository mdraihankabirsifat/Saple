import { getCurrentUser, isAuthenticated } from './auth.js';

function addAction(container, href, label) {
  const link = document.createElement('a');
  link.href = href;
  link.className = 'button button-secondary';
  link.textContent = label;
  container.append(document.createElement('br'), link);
}

async function requireContributionAccess(returnTo) {
  const accessState = document.querySelector('#contribution-access');
  const contributionLayout = document.querySelector('[data-contribution-layout]');
  contributionLayout.hidden = true;

  if (!isAuthenticated()) {
    accessState.hidden = false;
    accessState.className = 'access-state card';
    accessState.innerHTML = '<h2>Employee verification required</h2><p>Only verified current or former employees can contribute workplace data.</p>';
    addAction(accessState, `login.html?returnTo=${encodeURIComponent(returnTo)}`, 'Sign in');
    return null;
  }

  try {
    const user = await getCurrentUser();
    const verifiedCompanies = Array.isArray(user.verifiedCompanies) ? user.verifiedCompanies : [];
    if (verifiedCompanies.length === 0) {
      accessState.hidden = false;
      accessState.className = 'access-state card';
      accessState.innerHTML = '<h2>Employee verification required</h2><p>Only verified current or former employees can contribute workplace data.</p>';
      if (user.userType === 'EMPLOYEE') {
        addAction(accessState, 'employee-verification.html', 'Request verification');
      }
      return null;
    }
    accessState.hidden = true;
    contributionLayout.hidden = false;
    return { user, verifiedCompanies };
  } catch (error) {
    accessState.hidden = false;
    accessState.className = 'access-state card';
    accessState.textContent = error.message;
    return null;
  }
}

export { requireContributionAccess };
