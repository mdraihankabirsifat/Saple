const navigationToggle = document.querySelector('[data-nav-toggle]');
const navigationMenu = document.querySelector('[data-nav-menu]');
const contributionMenu = document.querySelector('.contribute-menu');
const authModuleUrl = new URL('./auth.js', document.currentScript.src);

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

  const renderAuthenticatedState = (currentUser) => {
    const contribution = navigationActions.querySelector('.contribute-menu');
    const accountName = document.createElement(currentUser?.accountRole === 'ADMIN' ? 'a' : 'span');
    const signOutButton = document.createElement('button');
    const firstName = currentUser?.fullName?.trim().split(/\s+/)[0] || 'Account';

    accountName.className = 'nav-account-name';
    accountName.textContent = firstName;
    accountName.title = currentUser?.email || 'Signed-in account';
    if (currentUser?.accountRole === 'ADMIN') {
      accountName.href = 'admin.html';
      accountName.setAttribute('aria-label', `${firstName} administrator dashboard`);
    }

    signOutButton.className = 'nav-text-link nav-sign-out';
    signOutButton.type = 'button';
    signOutButton.textContent = 'Sign out';
    signOutButton.addEventListener('click', () => {
      auth.clearSession();
      window.location.assign('index.html');
    });

    if (currentUser?.userType === 'EMPLOYEE' && !document.querySelector('[data-verification-link]')) {
      const options = document.querySelector('.contribute-options');
      if (options) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = 'employee-verification.html';
        link.textContent = 'Request employee verification';
        link.dataset.verificationLink = '';
        item.append(link);
        options.append(item);
      }
    }

    navigationActions.querySelector('a[href="login.html"]')?.remove();
    navigationActions.querySelector('a[href="register.html"]')?.remove();
    navigationActions.querySelector('.nav-account-name')?.remove();
    navigationActions.querySelector('.nav-sign-out')?.remove();
    navigationActions.insertBefore(accountName, contribution || null);
    navigationActions.insertBefore(signOutButton, contribution || null);

    const verificationLink = document.querySelector('[data-verification-link]');
    if (currentUser?.userType !== 'EMPLOYEE') verificationLink?.closest('li')?.remove();
  };

  if (user) {
    renderAuthenticatedState(user);
  }

  try {
    user = await auth.getCurrentUser();

    renderAuthenticatedState(user);
  } catch (error) {
    if (error.status === 401) {
      window.location.reload();
    }
  }
}

updateAuthenticationNavigation().catch((error) => {
  console.error('Unable to update authentication navigation:', error);
});
