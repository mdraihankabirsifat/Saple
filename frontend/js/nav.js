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

  const signInLink = navigationActions.querySelector('a[href="login.html"]');
  const registerLink = navigationActions.querySelector('a[href="register.html"]');

  if (!signInLink || !registerLink) {
    return;
  }

  const auth = await import(authModuleUrl.href);

  if (!auth.isAuthenticated()) {
    return;
  }

  let user = auth.getStoredUser();

  const renderAuthenticatedState = (currentUser) => {
    const accountName = document.createElement('span');
    const signOutButton = document.createElement('button');
    const firstName = currentUser?.fullName?.trim().split(/\s+/)[0] || 'Account';

    accountName.className = 'nav-account-name';
    accountName.textContent = firstName;
    accountName.title = currentUser?.email || 'Signed-in account';

    signOutButton.className = 'nav-text-link nav-sign-out';
    signOutButton.type = 'button';
    signOutButton.textContent = 'Sign out';
    signOutButton.addEventListener('click', () => {
      auth.clearSession();
      window.location.assign('index.html');
    });

    signInLink.replaceWith(accountName);
    registerLink.replaceWith(signOutButton);
  };

  if (user) {
    renderAuthenticatedState(user);
  }

  try {
    user = await auth.getCurrentUser();

    if (!document.querySelector('.nav-account-name')) {
      renderAuthenticatedState(user);
    } else {
      const accountName = document.querySelector('.nav-account-name');
      accountName.textContent = user.fullName?.trim().split(/\s+/)[0] || 'Account';
      accountName.title = user.email;
    }
  } catch (error) {
    if (error.status === 401) {
      window.location.reload();
    }
  }
}

updateAuthenticationNavigation().catch((error) => {
  console.error('Unable to update authentication navigation:', error);
});
