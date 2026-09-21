import { getCurrentUser, isAuthenticated } from './auth.js';

function addAction(container, href, label) {
  const link = document.createElement('a');
  link.href = href;
  link.className = 'button button-secondary';
  link.textContent = label;
  container.append(document.createElement('br'), link);
}


// Built with createElement and textContent rather than innerHTML: nothing in
// Saple renders markup from a string, so there is no place for injected HTML
// to enter even when the text is fixed.
function renderVerificationRequired(accessState) {
  const heading = document.createElement('h2');
  const explanation = document.createElement('p');

  heading.textContent = 'Employee verification required';
  explanation.textContent =
    'Only verified current or former employees can contribute workplace data.';

  accessState.hidden = false;
  accessState.className = 'access-state card';
  accessState.replaceChildren(heading, explanation);
}

async function requireContributionAccess(returnTo) {
  const accessState = document.querySelector('#contribution-access');
  const contributionLayout = document.querySelector('[data-contribution-layout]');
  contributionLayout.hidden = true;

  if (!isAuthenticated()) {
    renderVerificationRequired(accessState);
    addAction(accessState, `login.html?returnTo=${encodeURIComponent(returnTo)}`, 'Sign in');
    return null;
  }

  try {
    const user = await getCurrentUser();
    const verifiedScopes = Array.isArray(user.verifiedScopes) ? user.verifiedScopes : [];
    if (verifiedScopes.length === 0) {
      renderVerificationRequired(accessState);
      if (user.userType === 'EMPLOYEE') {
        addAction(accessState, 'employee-verification.html', 'Request verification');
      }
      return null;
    }
    accessState.hidden = true;
    contributionLayout.hidden = false;
    return { user, verifiedScopes };
  } catch (error) {
    accessState.hidden = false;
    accessState.className = 'access-state card';
    accessState.textContent = error.message;
    return null;
  }
}

function populateVerifiedScopeSelects(companySelect, roleSelect, scopes) {
  const verifiedScopes = Array.isArray(scopes)
    ? scopes.filter((scope) => scope.companyId && scope.companyName && scope.roleId && scope.roleName)
    : [];
  const companies = new Map();
  verifiedScopes.forEach((scope) => companies.set(String(scope.companyId), scope.companyName));

  companySelect.replaceChildren(new Option('Select a verified company', ''));
  [...companies.entries()].sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, name]) => {
    companySelect.append(new Option(name, id));
  });

  const updateRoles = () => {
    const matching = verifiedScopes.filter(
      (scope) => String(scope.companyId) === companySelect.value
    );
    roleSelect.replaceChildren(new Option('Select a verified designation', ''));
    matching.sort((a, b) => a.roleName.localeCompare(b.roleName)).forEach((scope) => {
      roleSelect.append(new Option(scope.roleName, String(scope.roleId)));
    });
    roleSelect.disabled = matching.length === 0;
    if (matching.length === 1) roleSelect.value = String(matching[0].roleId);
  };

  companySelect.addEventListener('change', updateRoles);
  companySelect.disabled = companies.size === 0;
  if (companies.size === 1) companySelect.value = companies.keys().next().value;
  updateRoles();
}

export { populateVerifiedScopeSelects, requireContributionAccess };
