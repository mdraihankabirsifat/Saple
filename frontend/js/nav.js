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
// The footer brand column also carries what the Jobs page used to say in its
// own isolated paragraph: applications stay inside this project.
const SITE_DISCLAIMER = 'Saple is not affiliated with, endorsed by, or an official login or careers service for any company listed here. Company data is contributed and moderated within this academic project, and job applications made through Saple are handled inside Saple only.';

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
  { label: 'FAQ', destination: 'faq.html' },
  { label: 'About', destination: 'about.html' },
  { label: 'Contact', destination: 'contact.html' },
  { label: 'Privacy', destination: 'privacy.html' },
  { label: 'Terms', destination: 'terms.html' },
  { label: 'Security', destination: 'security.html' }
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
  'login.html': 'Sign in with your Saple account only. Saple is an independent BUET CSE academic project and never asks for a company, Google, Microsoft or email-provider password.',
  'register.html': 'You are creating a Saple account only. Saple is an independent BUET CSE academic project, not a company careers or login service, and never asks for a company, Google, Microsoft or email-provider password.',
  'forgot-password.html': 'This resets a Saple account only. Saple emails a single-use link and never asks for your password, or for a company, Google, Microsoft or email-provider password.',
  'reset-password.html': 'You are choosing a new password for your Saple account only. Never reuse a company, Google, Microsoft or email-provider password here.',
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

  // On the two-column account pages the notice sits inside the form card,
  // directly above the form. Prepending it to .auth-layout would make it a
  // third grid item and push the form below the fold.
  const authForm = main.querySelector('.auth-card .auth-form');
  if (authForm) {
    authForm.before(notice);
    return;
  }
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

// The wordmark keeps an accessible identity in its title only. The visible
// academic disclosure lives in the hero badge, the account notices, the About
// page and the footer, so it never takes header space from the navigation.
function renderBrandIdentity() {
  const brand = document.querySelector('.site-header .brand');
  if (!brand) return;
  brand.querySelector('.brand-tagline')?.remove();
  brand.setAttribute('title', SITE_IDENTITY);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgNode(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

// An original, decorative landscape: two rolling hills, a low campus and city
// skyline, and a row of saplings. Colours come from footer CSS classes, so the
// strip follows both themes and needs no inline style.
function buildFooterLandscape() {
  const svg = svgNode('svg', {
    class: 'footer-landscape-art',
    viewBox: '0 0 1440 120',
    preserveAspectRatio: 'xMidYMax slice',
    focusable: 'false',
    'aria-hidden': 'true'
  });

  const skyline = svgNode('g', { class: 'landscape-skyline' });
  const buildings = [
    [96, 58, 34], [138, 44, 26], [170, 66, 40], [520, 50, 30], [556, 36, 22], [584, 60, 46],
    [636, 46, 28], [930, 54, 36], [972, 40, 24], [1002, 62, 34], [1244, 48, 30], [1282, 34, 22], [1310, 56, 38]
  ];
  for (const [x, y, width] of buildings) {
    skyline.append(svgNode('rect', { x, y, width, height: 120 - y, rx: 2 }));
  }
  // A small arched gateway stands in for the campus, without copying any real building.
  skyline.append(svgNode('path', { d: 'M700 92 V60 Q730 36 760 60 V92 H748 V66 Q730 52 712 66 V92 Z' }));

  svg.append(
    skyline,
    svgNode('path', { class: 'landscape-hill landscape-hill-back', d: 'M0 88 C180 60 330 70 520 84 C720 98 900 58 1120 70 C1260 78 1360 86 1440 80 V120 H0 Z' }),
    svgNode('path', { class: 'landscape-hill landscape-hill-front', d: 'M0 104 C220 88 420 96 640 104 C860 112 1080 90 1280 96 C1360 99 1410 102 1440 100 V120 H0 Z' })
  );

  const saplings = svgNode('g', { class: 'landscape-saplings' });
  for (const [x, base, scale] of [[60, 104, 1], [250, 98, 0.8], [410, 100, 1.1], [820, 104, 0.9], [1090, 94, 1.05], [1390, 100, 0.85]]) {
    const plant = svgNode('g', { transform: `translate(${x} ${base}) scale(${scale})` });
    plant.append(
      svgNode('path', { class: 'sapling-stem', d: 'M0 0 V-26' }),
      svgNode('path', { class: 'sapling-leaf', d: 'M0 -18 C-12 -20 -16 -30 -14 -34 C-6 -32 0 -26 0 -18 Z' }),
      svgNode('path', { class: 'sapling-leaf', d: 'M0 -24 C12 -26 16 -36 14 -40 C6 -38 0 -32 0 -24 Z' })
    );
    saplings.append(plant);
  }
  svg.append(saplings);
  return svg;
}

function footerLinkColumn(id, heading, links, extraClass = '') {
  const pageName = currentPageName();
  const list = document.createElement('ul');
  for (const item of links) {
    const listItem = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.destination;
    link.textContent = item.label;
    if (item.destination === pageName) link.setAttribute('aria-current', 'page');
    if (item.data) link.dataset[item.data] = '';
    if (item.hidden) listItem.hidden = true;
    listItem.append(link);
    list.append(listItem);
  }
  const title = document.createElement('h2');
  title.id = id;
  title.textContent = heading;
  const column = document.createElement('nav');
  column.className = `footer-column ${extraClass}`.trim();
  column.dataset.footerColumn = '';
  column.setAttribute('aria-labelledby', id);
  column.append(title, list);
  return column;
}

const footerExplore = [
  { label: 'Companies', destination: 'companies.html' },
  { label: 'Salaries', destination: 'salaries.html' },
  { label: 'Reviews', destination: 'reviews.html' },
  { label: 'Interviews', destination: 'interviews.html' },
  { label: 'Jobs', destination: 'jobs.html' }
];

const footerAccount = [
  { label: 'Sign in', destination: 'login.html', data: 'footerSignedOut' },
  { label: 'Create account', destination: 'register.html', data: 'footerSignedOut' },
  { label: 'My applications', destination: 'my-applications.html' },
  { label: 'Submit salary', destination: 'submit-salary.html' },
  { label: 'Write a review', destination: 'submit-review.html' },
  { label: 'Share interview experience', destination: 'interview-experience.html' },
  { label: 'Representative workspace', destination: 'representative.html', data: 'footerRepresentative', hidden: true }
];

// One footer for every page. Each HTML file carries only a short fallback
// line inside <footer class="site-footer">; it is replaced here, so the page
// markup and this renderer can never both contribute visible content.
function renderSiteFooter() {
  const footer = document.querySelector('.site-footer');
  if (!footer || footer.dataset.footerRendered === 'true') return;

  const logo = document.createElement('a');
  logo.className = 'footer-logo';
  logo.href = 'index.html';
  logo.setAttribute('aria-label', 'Saple home');
  const mark = document.createElement('span');
  mark.className = 'footer-logo-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = 'S';
  const wordmark = document.createElement('span');
  wordmark.id = 'footer-brand-heading';
  wordmark.textContent = 'Saple';
  logo.append(mark, wordmark);

  const description = document.createElement('p');
  description.className = 'footer-description';
  description.textContent = 'Company profiles, salary ranges, workplace reviews, interview experiences and job postings, each shown with how far it can be trusted.';

  const identity = document.createElement('p');
  identity.className = 'site-identity';
  identity.textContent = SITE_IDENTITY;

  const disclaimer = document.createElement('p');
  disclaimer.className = 'site-disclaimer';
  disclaimer.textContent = SITE_DISCLAIMER;

  const repository = document.createElement('a');
  repository.className = 'footer-repository';
  repository.href = 'https://github.com/mdraihankabirsifat/Saple';
  repository.rel = 'noopener noreferrer';
  repository.textContent = 'Source code on GitHub';

  const brand = document.createElement('section');
  brand.className = 'footer-brand';
  brand.dataset.footerColumn = '';
  brand.setAttribute('aria-labelledby', 'footer-brand-heading');
  brand.append(logo, description, identity, disclaimer, repository);

  const columns = document.createElement('div');
  columns.className = 'footer-main container';
  columns.append(
    brand,
    footerLinkColumn('footer-explore-heading', 'Explore', footerExplore),
    footerLinkColumn('footer-account-heading', 'Account & contribute', footerAccount),
    footerLinkColumn('footer-help-heading', 'Help', informationPages)
  );

  const landscape = document.createElement('div');
  landscape.className = 'footer-landscape';
  landscape.append(buildFooterLandscape());

  const copyright = document.createElement('p');
  copyright.textContent = '© 2026 Saple. BUET CSE Database Project.';
  const projectLine = document.createElement('p');
  projectLine.textContent = 'Built for informed career decisions.';
  const backToTop = document.createElement('button');
  backToTop.type = 'button';
  backToTop.className = 'footer-back-to-top';
  backToTop.dataset.backToTop = '';
  backToTop.textContent = 'Back to top';
  backToTop.addEventListener('click', () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    // Move focus with the view so keyboard users land at the top as well.
    const target = document.querySelector('.site-header .brand');
    target?.focus({ preventScroll: true });
  });

  const bottomContent = document.createElement('div');
  bottomContent.className = 'footer-bottom-content container';
  bottomContent.append(copyright, projectLine, backToTop);
  const bottom = document.createElement('div');
  bottom.className = 'footer-bottom';
  bottom.append(bottomContent);

  footer.replaceChildren(columns, landscape, bottom);
  footer.dataset.footerRendered = 'true';
}

// The account column follows the signed-in state the server reported.
function updateFooterAccountLinks(user) {
  const footer = document.querySelector('.site-footer');
  if (!footer) return;
  footer.querySelectorAll('[data-footer-signed-out]').forEach((link) => {
    link.closest('li').hidden = Boolean(user);
  });
  const representative = footer.querySelector('[data-footer-representative]');
  if (representative) representative.closest('li').hidden = user?.accountRole !== 'COMPANY_REPRESENTATIVE';
}

ensureSkipLink();
renderAccountSurfaceNotice();
renderPublicNavigation();
renderBrandIdentity();
renderSiteFooter();

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
}

updateContributionVisibility(null);

// The desktop bar is one row or nothing. When the full row (logo, every
// section link, the account controls and the theme toggle) does not fit the
// header, the page switches to the menu button instead of wrapping. theme.js
// sets the starting state in <head>, so phones never flash a desktop bar.
const COMPACT_NAVIGATION_WIDTH = 1050;

function isCompactNavigation() {
  return document.documentElement.classList.contains('nav-compact');
}

function fitNavigation() {
  const root = document.documentElement;
  const navbar = document.querySelector('.navbar');
  const links = navigationMenu?.querySelector('.nav-links');
  const actions = navigationMenu?.querySelector('.nav-actions');
  if (!navbar || !navigationMenu || !links || !actions) return;

  if (window.innerWidth <= COMPACT_NAVIGATION_WIDTH) {
    root.classList.add('nav-compact');
    return;
  }

  // Measure the full row in its desktop form. Class changes inside one task
  // are not painted, so this never flickers.
  const wasCompact = root.classList.contains('nav-compact');
  root.classList.remove('nav-compact');
  const menuStyle = getComputedStyle(navigationMenu);
  const gap = parseFloat(menuStyle.columnGap) || 0;
  const needed = links.scrollWidth + actions.scrollWidth + gap;
  const fits = needed <= navigationMenu.clientWidth + 1;
  root.classList.toggle('nav-compact', !fits);
  if (fits && wasCompact) closeNavigation();
}

let fitFrame = 0;
function requestNavigationFit() {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(fitNavigation);
}

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
    if (event.target.closest('a') && isCompactNavigation()) {
      closeNavigation();
    }
  });

  window.addEventListener('resize', requestNavigationFit);
  // Signed-in controls and the notification bell arrive after first paint;
  // re-measure whenever the action group changes.
  new MutationObserver(requestNavigationFit).observe(navigationMenu, { childList: true, subtree: true, characterData: true });
  document.fonts?.ready.then(requestNavigationFit).catch(() => {});
  fitNavigation();
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
    updateFooterAccountLinks(currentUser);

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
