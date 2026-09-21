const navigationToggle = document.querySelector('[data-nav-toggle]');
const navigationMenu = document.querySelector('[data-nav-menu]');
const contributionMenu = document.querySelector('.contribute-menu');
const moduleBase = document.currentScript.src;
const authModuleUrl = new URL('./auth.js', moduleBase);
const offlineModuleUrl = new URL('./offline-cache.js', moduleBase);
const notificationsModuleUrl = new URL('./notifications.js', moduleBase);
const announcementsModuleUrl = new URL('./announcements.js', moduleBase);
const assistantModuleUrl = new URL('./assistant.js', moduleBase);

// Saple identifies itself the same way on every page. These two sentences are
// injected here rather than copied into 20 HTML files so they cannot drift.
const SITE_IDENTITY = 'Saple - an independent BUET CSE academic project for company and career insights.';
const SITE_DISCLAIMER = 'Saple is not affiliated with, endorsed by, or an official login or careers service for any company listed here. Company data shown is contributed and moderated within this academic project.';

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register(new URL('../sw.js', moduleBase).href).catch(() => {});
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data === 'SAPLE_OFFLINE_PAGE') import(offlineModuleUrl.href).then((offline) => offline.showOfflineNotice()).catch(() => {});
  });
  navigator.serviceWorker.controller?.postMessage('SAPLE_OFFLINE_STATUS');
}
window.addEventListener('offline', () => import(offlineModuleUrl.href).then((offline) => offline.showOfflineNotice()).catch(() => {}));
if (!navigator.onLine) import(offlineModuleUrl.href).then((offline) => offline.showOfflineNotice()).catch(() => {});

const themeToggle = document.createElement('button');
themeToggle.type = 'button';
themeToggle.className = 'theme-toggle';
themeToggle.dataset.themeToggle = '';
themeToggle.setAttribute('aria-label', 'Dark mode');
themeToggle.setAttribute('aria-pressed', String(document.documentElement.dataset.theme === 'dark'));
const themeIcon = document.createElement('span');
themeIcon.className = 'theme-icon';
themeIcon.setAttribute('aria-hidden', 'true');
themeToggle.append(themeIcon);
themeToggle.title = 'Toggle light / dark mode';
themeToggle.addEventListener('click', () => window.SapleTheme?.toggle());
document.querySelector('.navbar')?.insertBefore(themeToggle, navigationToggle);

// Track the actual header height when authenticated actions or mobile menus change.
const siteHeader = document.querySelector('.site-header');
if (siteHeader && typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => document.documentElement.style.setProperty('--header-height', `${siteHeader.offsetHeight}px`)).observe(siteHeader);
}

const publicNavigation = [
  { label: 'Home', destination: 'index.html', pages: ['index.html'] },
  { label: 'Companies', destination: 'companies.html', pages: ['companies.html', 'company-details.html'] },
  { label: 'Salaries', destination: 'salaries.html', pages: ['salaries.html', 'submit-salary.html'] },
  { label: 'Reviews', destination: 'reviews.html', pages: ['reviews.html', 'submit-review.html'] },
  { label: 'Interviews', destination: 'interviews.html', pages: ['interviews.html', 'interview-experience.html'] },
  { label: 'Jobs', destination: 'jobs.html', pages: ['jobs.html', 'job-details.html', 'my-applications.html'] },
  { label: 'FAQ', destination: 'faq.html', pages: ['faq.html'] },
  { label: 'About', destination: 'about.html', pages: ['about.html'] }
];

const informationPages = [
  { label: 'About', destination: 'about.html' },
  { label: 'FAQ', destination: 'faq.html' },
  { label: 'Privacy', destination: 'privacy.html' },
  { label: 'Terms', destination: 'terms.html' },
  { label: 'Security', destination: 'security.html' },
  { label: 'Contact', destination: 'contact.html' }
];

function currentPageName() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

// Every page gets a keyboard skip link and one named main landmark, injected
// here so a page cannot be added without them.
function ensureSkipLink() {
  const main = document.querySelector('main');
  if (!main) return;
  if (!main.id) main.id = 'main-content';

  if (document.querySelector('.skip-link')) return;
  const skip = document.createElement('a');
  skip.className = 'skip-link';
  skip.href = `#${main.id}`;
  skip.textContent = 'Skip to main content';
  document.body.prepend(skip);
}

// Account and verification forms carry their own statement of whose site this
// is, next to the form, because that is where a look-alike page would lie.
const ACCOUNT_SURFACES = {
  'login.html': 'You are signing in to Saple with a Saple account. Saple is an independent BUET CSE academic project and never asks for a company, Google or Microsoft password.',
  'register.html': 'You are creating a Saple account. Saple is an independent BUET CSE academic project, not a company careers or login service.',
  'forgot-password.html': 'Saple emails a single-use reset link for your Saple account. It never asks for your password by email.',
  'reset-password.html': 'You are choosing a new password for your Saple account only. Saple is an independent BUET CSE academic project.',
  'employee-verification.html': 'Verification is reviewed inside Saple, an independent academic project. Never enter your company email password or any login credentials here.',
  'job-details.html': 'Applications go to the approved representatives of this company inside Saple. Saple is not the company\u2019s official careers site.',
  'representative.html': 'This workspace is part of Saple, an independent BUET CSE academic project. It is not an official system of any company.'
};

function renderAccountSurfaceNotice() {
  const message = ACCOUNT_SURFACES[currentPageName()];
  const main = document.querySelector('main');
  if (!message || !main || main.querySelector('[data-surface-notice]')) return;

  const notice = document.createElement('p');
  notice.className = 'surface-notice';
  notice.dataset.surfaceNotice = '';
  notice.textContent = message;
  const container = main.querySelector('.container') || main;
  container.prepend(notice);
}

function renderPublicNavigation() {
  const navigationList = document.querySelector('.nav-links');

  if (!navigationList) return;

  const pageName = currentPageName();
  navigationList.replaceChildren(...publicNavigation.map((item) => {
    const listItem = document.createElement('li');
    const link = document.createElement('a');

    link.href = item.destination;
    link.textContent = item.label;

    if (item.pages.includes(pageName)) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }

    listItem.append(link);
    return listItem;
  }));
}

// A short, permanent statement of what this site is, next to the wordmark.
function renderBrandIdentity() {
  const brand = document.querySelector('.site-header .brand');
  if (!brand || brand.querySelector('.brand-tagline')) return;

  const tagline = document.createElement('span');
  tagline.className = 'brand-tagline';
  tagline.textContent = 'Independent BUET CSE academic project';
  brand.append(tagline);
  brand.setAttribute('title', SITE_IDENTITY);
}

function renderFooterInformationLinks() {
  const footer = document.querySelector('.site-footer');
  const footerBottom = footer?.querySelector('.footer-bottom');

  if (!footer || !footerBottom || footer.querySelector('[data-footer-information]')) return;

  const wrapper = document.createElement('div');
  const navigation = document.createElement('nav');
  const list = document.createElement('ul');
  const pageName = currentPageName();

  wrapper.className = 'footer-information container';
  wrapper.dataset.footerInformation = '';
  navigation.setAttribute('aria-label', 'Project information');
  list.className = 'footer-information-links';

  informationPages.forEach((item) => {
    const listItem = document.createElement('li');
    const link = document.createElement('a');

    link.href = item.destination;
    link.textContent = item.label;
    if (item.destination === pageName) link.setAttribute('aria-current', 'page');
    listItem.append(link);
    list.append(listItem);
  });

  navigation.append(list);

  const identity = document.createElement('p');
  identity.className = 'site-identity';
  identity.textContent = SITE_IDENTITY;

  const disclaimer = document.createElement('p');
  disclaimer.className = 'site-disclaimer';
  disclaimer.textContent = SITE_DISCLAIMER;

  wrapper.append(navigation, identity, disclaimer);
  footer.insertBefore(wrapper, footerBottom);
}

ensureSkipLink();
renderAccountSurfaceNotice();
renderPublicNavigation();
renderBrandIdentity();
renderFooterInformationLinks();

import(announcementsModuleUrl.href)
  .then((announcements) => announcements.renderAnnouncementBar())
  .catch(() => {});
import(assistantModuleUrl.href)
  .then((assistant) => assistant.mountAssistant())
  .catch(() => {});

function updateContributionVisibility(user) {
  const verified = Array.isArray(user?.verifiedScopes) && user.verifiedScopes.length > 0;
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
    if (event.target.closest('a') && window.matchMedia('(max-width: 1050px)').matches) {
      closeNavigation();
    }
  });

  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 1050px)').matches) {
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

  if (navigationMenu?.classList.contains('is-open')) navigationToggle?.focus();
  closeNavigation();

  if (contributionMenu?.open) {
    contributionMenu.open = false;
    contributionMenu.querySelector('summary')?.focus();
  }
});

// Workspace links are driven by the role the server reports for the current
// token, never by anything the browser stores on its own.
const WORKSPACE_LINKS = {
  ADMIN: { href: 'admin.html', label: 'Admin' },
  COMPANY_REPRESENTATIVE: { href: 'representative.html', label: 'Company workspace' }
};

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
    const workspace = WORKSPACE_LINKS[currentUser?.accountRole] || null;

    accountName.className = 'nav-account-name';
    accountName.textContent = firstName;
    accountName.title = currentUser?.email || 'Signed-in account';
    accountName.href = 'profile.html';
    accountName.setAttribute('aria-label', `${firstName} profile`);

    signOutButton.className = 'nav-text-link nav-sign-out';
    signOutButton.type = 'button';
    signOutButton.textContent = 'Sign out';
    signOutButton.addEventListener('click', async () => {
      signOutButton.disabled = true;
      signOutButton.textContent = 'Signing out…';
      try {
        await auth.logout();
      } catch (error) {
        console.warn('Server-side token revocation could not be confirmed.');
      } finally {
        window.location.assign('index.html');
      }
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
    navigationActions.querySelector('[data-workspace-link]')?.remove();
    navigationActions.querySelector('[data-applications-link]')?.remove();

    if (workspace) {
      const workspaceLink = document.createElement('a');
      workspaceLink.href = workspace.href;
      workspaceLink.textContent = workspace.label;
      workspaceLink.className = 'nav-text-link';
      workspaceLink.dataset.workspaceLink = '';
      navigationActions.insertBefore(workspaceLink, contribution || null);
    } else {
      const applicationsLink = document.createElement('a');
      applicationsLink.href = 'my-applications.html';
      applicationsLink.textContent = 'My applications';
      applicationsLink.className = 'nav-text-link';
      applicationsLink.dataset.applicationsLink = '';
      navigationActions.insertBefore(applicationsLink, contribution || null);
    }

    navigationActions.insertBefore(accountName, contribution || null);
    navigationActions.insertBefore(signOutButton, contribution || null);

    if (currentUser?.userType !== 'EMPLOYEE') verificationLink?.remove();
    updateContributionVisibility(verificationRefreshed ? currentUser : null);

    import(notificationsModuleUrl.href)
      .then((notifications) => notifications.mountNotificationBell(navigationActions, accountName))
      .catch(() => {});
  };

  if (user) {
    renderAuthenticatedState(user);
  }

  try {
    user = await auth.getCurrentUser();

    renderAuthenticatedState(user, true);
  } catch (error) {
    if (error.status === 401 || error.kind === 'AUTH') {
      window.location.reload();
    }
  }
}

updateAuthenticationNavigation().catch((error) => {
  console.error('Unable to update authentication navigation:', error);
});
