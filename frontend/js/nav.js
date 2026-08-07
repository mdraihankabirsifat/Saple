const navigationToggle = document.querySelector('[data-nav-toggle]');
const navigationMenu = document.querySelector('[data-nav-menu]');
const contributionMenu = document.querySelector('.contribute-menu');
const authModuleUrl = new URL('./auth.js', document.currentScript.src);
const browseDestinations = {
  Companies: 'companies.html',
  Salaries: 'salaries.html',
  Reviews: 'reviews.html',
  Interviews: 'interviews.html'
};

document.querySelectorAll('.nav-links a').forEach((link) => {
  const destination = browseDestinations[link.textContent.trim()];
  if (destination) link.href = destination;
});

function updateContributionVisibility(user) {
  const verified = Array.isArray(user?.verifiedCompanies) && user.verifiedCompanies.length > 0;
  contributionMenu?.classList.toggle('is-available', verified);
  document.querySelectorAll('[data-verified-contributor]').forEach((element) => {
    element.hidden = !verified;
  });
  document.querySelectorAll(
    '.site-footer a[href="submit-salary.html"], .site-footer a[href="submit-review.html"], .site-footer a[href="interview-experience.html"]'
  ).forEach((link) => { link.hidden = !verified; });
}

updateContributionVisibility(null);

function closeNavigation() {
  if (!navigationToggle || !navigationMenu) {
    return;
  }

  navigationToggle.setAttribute('aria-expanded', 'false');
  navigationMenu.classList.remove('is-open');
}

if (navigationToggle && navigationMenu) {
  navigationToggle.addEventListener('click', () => {
    const shouldOpen = navigationToggle.getAttribute('aria-expanded') !== 'true';
    navigationToggle.setAttribute('aria-expanded', String(shouldOpen));
    navigationMenu.classList.toggle('is-open', shouldOpen);
  });

  navigationMenu.addEventListener('click', (event) => {
    if (event.target.closest('a') && window.matchMedia('(max-width: 900px)').matches) {
      closeNavigation();
    }
  });

  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 900px)').matches) {
      closeNavigation();
    }
  });
}

document.addEventListener('click', (event) => {
  if (contributionMenu?.open && !contributionMenu.contains(event.target)) {
    contributionMenu.open = false;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') {
    return;
  }

  closeNavigation();

  if (contributionMenu?.open) {
    contributionMenu.open = false;
    contributionMenu.querySelector('summary')?.focus();
  }
});

async function updateAuthenticationNavigation() {
  const navigationActions = document.querySelector('.nav-actions');

  if (!navigationActions) {
    return;
  }

  const auth = await import(authModuleUrl.href);

  if (!auth.isAuthenticated()) {
    return;
  }

  let user = auth.getStoredUser();

  const renderAuthenticatedState = (currentUser, verificationRefreshed = false) => {
    const contribution = navigationActions.querySelector('.contribute-menu');
    const accountName = document.createElement('a');
    const signOutButton = document.createElement('button');
    const firstName = currentUser?.fullName?.trim().split(/\s+/)[0] || 'Account';

    accountName.className = 'nav-account-name';
    accountName.textContent = firstName;
    accountName.title = currentUser?.email || 'Signed-in account';
    accountName.href = currentUser?.accountRole === 'ADMIN' ? 'admin.html' : 'profile.html';
    accountName.setAttribute(
      'aria-label',
      currentUser?.accountRole === 'ADMIN'
        ? `${firstName} administrator dashboard`
        : `${firstName} profile`
    );

    signOutButton.className = 'nav-text-link nav-sign-out';
    signOutButton.type = 'button';
    signOutButton.textContent = 'Sign out';
    signOutButton.addEventListener('click', () => {
      auth.clearSession();
      window.location.assign('index.html');
    });

    let verificationLink = navigationActions.querySelector('[data-verification-link]');
    if (currentUser?.userType === 'EMPLOYEE' && !verificationLink) {
      verificationLink = document.createElement('a');
      verificationLink.href = 'employee-verification.html';
      verificationLink.textContent = 'Verification';
      verificationLink.className = 'nav-text-link';
      verificationLink.dataset.verificationLink = '';
      navigationActions.insertBefore(verificationLink, contribution || null);
    }

    navigationActions.querySelector('a[href="login.html"]')?.remove();
    navigationActions.querySelector('a[href="register.html"]')?.remove();
    navigationActions.querySelector('.nav-account-name')?.remove();
    navigationActions.querySelector('.nav-sign-out')?.remove();
    navigationActions.insertBefore(accountName, contribution || null);
    navigationActions.insertBefore(signOutButton, contribution || null);

    if (currentUser?.userType !== 'EMPLOYEE') verificationLink?.remove();
    updateContributionVisibility(verificationRefreshed ? currentUser : null);
  };

  if (user) {
    renderAuthenticatedState(user);
  }

  try {
    user = await auth.getCurrentUser();

    renderAuthenticatedState(user, true);
  } catch (error) {
    if (error.status === 401) {
      window.location.reload();
    }
  }
}

updateAuthenticationNavigation().catch((error) => {
  console.error('Unable to update authentication navigation:', error);
});
