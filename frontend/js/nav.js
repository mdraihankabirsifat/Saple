const navigationToggle = document.querySelector('[data-nav-toggle]');
const navigationMenu = document.querySelector('[data-nav-menu]');
const moduleBase = document.currentScript.src;
const authModuleUrl = new URL('./auth.js', moduleBase);
const offlineModuleUrl = new URL('./offline-cache.js', moduleBase);
const notificationsModuleUrl = new URL('./notifications.js', moduleBase);
const announcementsModuleUrl = new URL('./announcements.js', moduleBase);
const assistantModuleUrl = new URL('./assistant.js', moduleBase);
const messagesModuleUrl = new URL('./messages.js', moduleBase);
const globalSearchModuleUrl = new URL('./global-search.js', moduleBase);
const revealModuleUrl = new URL('./reveal.js', moduleBase);

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
  { label: 'Contact', destination: 'contact.html', pages: ['contact.html'] },
  { label: 'About', destination: 'about.html', pages: ['about.html'] }
];

const informationPages = [
  { label: 'FAQ', destination: 'faq.html' },
  { label: 'Contact', destination: 'contact.html' },
  { label: 'About', destination: 'about.html' },
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

// Context notices remain beside flows where their scope affects a decision.
// Sign-in and registration identify Saple in their existing headings and copy.
const ACCOUNT_SURFACES = {
  'forgot-password.html': 'This resets a Saple account only. Saple emails a single-use link and never asks for your password, or for a company, Google, Microsoft or email-provider password.',
  'reset-password.html': 'You are setting a new password for your Saple account only. Saple is an independent BUET CSE academic project, and never asks for a company, Google, Microsoft or email-provider password.',
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

// The wordmark keeps an accessible identity in its title only. The academic
// disclosure remains in the About page and footer without taking header space.
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
  { label: 'Jobs', destination: 'jobs.html' },
  { label: 'Premium', destination: 'premium.html' }
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
import(revealModuleUrl.href)
  .then((reveal) => reveal.mountReveal())
  .catch(() => {});

// Page elements meant only for verified contributors. The header's Contribute
// entry lives in the account menu, which applies the same rule.
function updateContributionVisibility(user) {
  const verified = Array.isArray(user?.verifiedScopes) && user.verifiedScopes.length > 0;
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
  root.classList.remove('nav-compact', 'nav-condensed');
  const rowFits = () => {
    const gap = parseFloat(getComputedStyle(navigationMenu).columnGap) || 0;
    return links.scrollWidth + actions.scrollWidth + gap <= navigationMenu.clientWidth + 1;
  };
  let fits = rowFits();
  if (!fits) {
    // A signed-in row carries more controls. Before giving up the desktop
    // row, try it condensed: the search becomes a button that opens in place.
    root.classList.add('nav-condensed');
    fits = rowFits();
    if (!fits) root.classList.remove('nav-condensed');
  }
  root.classList.toggle('nav-compact', !fits);
  if (fits && wasCompact) closeNavigation();
}

let fitFrame = 0;
function requestNavigationFit() {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(fitNavigation);
}

// --- Mobile drawer ----------------------------------------------------------
// In compact mode the menu is a side drawer (styled in premium.css). The
// drawer gets its own close button and a backdrop, locks page scroll while
// open, keeps keyboard focus inside, and closes on Escape, the close button,
// a backdrop click or following a link. The desktop row is unaffected: the
// extra elements are hidden there.
const DRAWER_FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
let drawerBackdrop = null;

function buildDrawerChrome() {
  if (!navigationMenu || navigationMenu.querySelector('.nav-drawer-head')) return;

  const head = document.createElement('div');
  head.className = 'nav-drawer-head';
  const title = document.createElement('p');
  title.className = 'nav-drawer-title';
  title.textContent = 'Menu';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'nav-drawer-close';
  close.setAttribute('aria-label', 'Close menu');
  const glyph = document.createElement('span');
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = '\u00d7';
  close.append(glyph);
  close.addEventListener('click', () => closeNavigation({ restoreFocus: true }));
  head.append(title, close);
  navigationMenu.prepend(head);

  drawerBackdrop = document.createElement('div');
  drawerBackdrop.className = 'nav-backdrop';
  drawerBackdrop.setAttribute('aria-hidden', 'true');
  drawerBackdrop.addEventListener('click', () => closeNavigation({ restoreFocus: true }));
  siteHeader?.append(drawerBackdrop);
}

// Each link gets its position, which the stylesheet turns into a short
// staggered entrance. Set through the CSSOM, so no inline style attribute.
function indexDrawerItems() {
  navigationMenu?.querySelectorAll('.nav-links li').forEach((item, index) => {
    item.style.setProperty('--i', String(index));
  });
}

function isDrawerOpen() {
  return navigationToggle?.getAttribute('aria-expanded') === 'true';
}

function openNavigation() {
  if (!navigationToggle || !navigationMenu) return;
  navigationToggle.setAttribute('aria-expanded', 'true');
  navigationMenu.classList.add('is-open');
  if (isCompactNavigation()) {
    document.documentElement.classList.add('nav-drawer-open');
    // Focus moves into the drawer once it has started to slide in.
    requestAnimationFrame(() => {
      const first = navigationMenu.querySelector('.nav-links a') || navigationMenu.querySelector(DRAWER_FOCUSABLE);
      first?.focus({ preventScroll: true });
    });
  }
}

function closeNavigation({ restoreFocus = false } = {}) {
  if (!navigationToggle || !navigationMenu) {
    return;
  }

  const wasOpen = isDrawerOpen();
  navigationToggle.setAttribute('aria-expanded', 'false');
  navigationMenu.classList.remove('is-open');
  document.documentElement.classList.remove('nav-drawer-open');
  if (wasOpen && restoreFocus) navigationToggle?.focus();
}

// Tab and Shift+Tab stay inside the open drawer.
function trapDrawerFocus(event) {
  if (event.key !== 'Tab' || !isDrawerOpen() || !isCompactNavigation()) return;
  const focusable = [...navigationMenu.querySelectorAll(DRAWER_FOCUSABLE)]
    .filter((node) => node.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!navigationMenu.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

if (navigationToggle && navigationMenu) {
  buildDrawerChrome();
  indexDrawerItems();
  document.addEventListener('keydown', trapDrawerFocus);

  navigationToggle.addEventListener('click', () => {
    if (isDrawerOpen()) closeNavigation();
    else openNavigation();
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

// --- Disclosures ---------------------------------------------------------------
// [data-disclosure] wraps a toggle button and a panel. The panel animates open
// with grid-template-rows (premium.css), and aria-expanded is the only state:
// no class or inline style has to agree with it. A disclosure that holds
// filters opens by itself when the address already carries one of them, so an
// applied filter is never hidden from the person who applied it.
function setDisclosure(disclosure, open) {
  const toggle = disclosure.querySelector('[data-disclosure-toggle]');
  toggle?.setAttribute('aria-expanded', String(open));
  disclosure.classList.toggle('is-open', open);
}

document.querySelectorAll('[data-disclosure]').forEach((disclosure) => {
  const params = (disclosure.dataset.disclosureParams || '').split(/\s+/).filter(Boolean);
  const query = new URLSearchParams(window.location.search);
  setDisclosure(disclosure, params.some((name) => query.has(name)));
});

document.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-disclosure-toggle]');
  if (!toggle) return;
  const disclosure = toggle.closest('[data-disclosure]');
  if (disclosure) setDisclosure(disclosure, toggle.getAttribute('aria-expanded') !== 'true');
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') {
    return;
  }

  closeNavigation({ restoreFocus: navigationMenu?.classList.contains('is-open') });
});

// Workspace links are driven by the role the server reports for the current
// token, never by anything the browser stores on its own.
const WORKSPACE_LINKS = {
  ADMIN: { href: 'admin.html', label: 'Admin workspace' },
  COMPANY_REPRESENTATIVE: { href: 'representative.html', label: 'Company workspace' }
};

// --- Account menu ---------------------------------------------------------------
// Everything personal to the signed-in account sits under the avatar: profile,
// subscription, applications, contributing, verification, the role workspace and
// signing out. Which items appear follows the account the server reported; the
// backend still decides what every page and request may actually do.
const apiModuleUrl = new URL('./api.js', moduleBase);
const CONTRIBUTE_LINKS = [
  { href: 'submit-salary.html', label: 'Submit salary' },
  { href: 'submit-review.html', label: 'Write a review' },
  { href: 'interview-experience.html', label: 'Share interview experience' }
];
let premiumMenuState = null;
let premiumMenuRequest = null;

function accountInitial(user) {
  return user?.fullName?.trim()?.[0]?.toUpperCase() || 'S';
}

// The profile photo when there is one, the first letter otherwise, and the
// letter again if the photo fails to load: never a broken image.
function accountAvatar(user, className) {
  const avatar = document.createElement('span');
  avatar.className = className;
  avatar.setAttribute('aria-hidden', 'true');
  const showInitial = () => {
    avatar.replaceChildren(document.createTextNode(accountInitial(user)));
    avatar.classList.add('is-initial');
  };
  if (user?.avatarUrl) {
    const image = document.createElement('img');
    image.alt = '';
    image.decoding = 'async';
    image.addEventListener('error', showInitial, { once: true });
    image.src = user.avatarUrl;
    avatar.append(image);
  } else {
    showInitial();
  }
  return avatar;
}

function menuLink(href, label, extraClass = '') {
  const link = document.createElement('a');
  link.href = href;
  link.className = `account-menu-item ${extraClass}`.trim();
  link.setAttribute('role', 'menuitem');
  link.textContent = label;
  if (href === currentPageName()) link.setAttribute('aria-current', 'page');
  return link;
}

function menuSeparator() {
  const separator = document.createElement('div');
  separator.className = 'account-menu-separator';
  separator.setAttribute('role', 'separator');
  return separator;
}

// Subscription state is fetched once, the first time the menu opens, and reused.
function applyPremiumMenuState(menu) {
  if (!premiumMenuState) return;
  menu.querySelectorAll('[data-premium-menu-badge]').forEach((badge) => {
    badge.textContent = premiumMenuState.label;
    badge.dataset.state = premiumMenuState.state;
    badge.hidden = false;
  });
  const headerBadge = menu.querySelector('[data-premium-header-badge]');
  if (headerBadge) {
    headerBadge.hidden = !premiumMenuState.active;
    headerBadge.textContent = premiumMenuState.state === 'trial'
      ? 'PRO'
      : premiumMenuState.state === 'admin'
        ? 'Admin access'
        : 'Active';
  }
}

function loadPremiumMenuState(menu) {
  if (premiumMenuState) {
    applyPremiumMenuState(menu);
    return;
  }
  premiumMenuRequest ||= import(apiModuleUrl.href)
    .then(({ apiRequest }) => apiRequest('/api/premium/status', { auth: true }))
    .then((access) => {
      const state = access.administratorAccess
        ? 'admin'
        : access.hasPremium
          ? (access.source === 'TRIAL' ? 'trial' : 'premium')
          : 'upgrade';
      premiumMenuState = {
        state,
        active: state !== 'upgrade',
        label: { admin: 'Admin access', trial: 'PRO', premium: 'Active', upgrade: 'Upgrade' }[state]
      };
    })
    .catch(() => { premiumMenuRequest = null; });
  premiumMenuRequest.then(() => applyPremiumMenuState(document.querySelector('[data-account-menu]')));
}

function accountMenuItems(menu) {
  return [...menu.querySelectorAll('.account-dropdown [role="menuitem"]')]
    .filter((item) => !item.closest('[hidden]'));
}

function setAccountMenuOpen(menu, open, { focus = null } = {}) {
  const button = menu.querySelector('.account-menu-button');
  const dropdown = menu.querySelector('.account-dropdown');
  if (!button || !dropdown) return;
  button.setAttribute('aria-expanded', String(open));
  dropdown.hidden = !open;
  menu.classList.toggle('is-open', open);
  if (open) {
    loadPremiumMenuState(menu);
    if (focus === 'first') accountMenuItems(menu)[0]?.focus();
  } else if (focus === 'button') {
    button.focus();
  }
}

// Builds the avatar button and its dropdown into one container that is reused
// on every render, so refreshing the account from /api/auth/me never adds a
// second menu.
function renderAccountMenu(navigationActions, currentUser, { auth, workspace, canContribute }) {
  let menu = navigationActions.querySelector('[data-account-menu]');
  if (!menu) {
    menu = document.createElement('div');
    menu.className = 'account-menu';
    menu.dataset.accountMenu = '';
    navigationActions.append(menu);
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'account-menu-button';
  button.setAttribute('aria-label', 'Open account menu');
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'account-dropdown');
  button.title = currentUser?.fullName || 'Your account';
  // The first name shows beside the avatar only inside the mobile drawer.
  const buttonName = document.createElement('span');
  buttonName.className = 'account-menu-name';
  buttonName.textContent = currentUser?.fullName?.trim().split(/\s+/)[0] || 'Account';
  button.append(accountAvatar(currentUser, 'account-avatar'), buttonName);

  const dropdown = document.createElement('div');
  dropdown.id = 'account-dropdown';
  dropdown.className = 'account-dropdown';
  dropdown.setAttribute('role', 'menu');
  dropdown.setAttribute('aria-label', 'Account');
  dropdown.hidden = true;

  // Summary: photo, name (to the profile page) and email.
  const name = document.createElement('a');
  name.className = 'account-summary-name';
  name.href = 'profile.html';
  name.setAttribute('role', 'menuitem');
  name.textContent = currentUser?.fullName || 'Your account';
  const email = document.createElement('span');
  email.className = 'account-summary-email';
  email.textContent = currentUser?.email || '';
  const headerBadge = document.createElement('span');
  headerBadge.className = 'premium-badge account-summary-badge';
  headerBadge.dataset.premiumHeaderBadge = '';
  headerBadge.hidden = true;
  const summaryText = document.createElement('div');
  summaryText.className = 'account-summary-text';
  summaryText.append(name, email, headerBadge);
  const summary = document.createElement('div');
  summary.className = 'account-summary';
  summary.append(accountAvatar(currentUser, 'account-avatar account-avatar-large'), summaryText);

  // Order: profile, tools every member has, then items that depend on the
  // account's role or verification, then the role workspace.
  const items = [];
  items.push(menuLink('profile.html', 'Profile'));
  items.push(menuLink('resume-generator.html', 'Resume Generator'));
  const premium = menuLink('premium.html', 'Subscription');
  const premiumBadge = document.createElement('span');
  premiumBadge.className = 'account-menu-badge';
  premiumBadge.dataset.premiumMenuBadge = '';
  premiumBadge.hidden = true;
  premium.append(premiumBadge);
  items.push(premium);
  // Only job-seeker accounts apply to vacancies; workspaces replace this.
  if (!workspace) items.push(menuLink('my-applications.html', 'My applications'));
  if (currentUser?.userType === 'EMPLOYEE') items.push(menuLink('employee-verification.html', 'Verification'));

  if (canContribute) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'account-menu-item account-menu-toggle';
    toggle.setAttribute('role', 'menuitem');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'account-contribute');
    toggle.textContent = 'Contribute';
    const group = document.createElement('div');
    group.id = 'account-contribute';
    group.className = 'account-submenu';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Contribute');
    group.hidden = true;
    group.append(...CONTRIBUTE_LINKS.map((link) => menuLink(link.href, link.label, 'account-submenu-item')));
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      group.hidden = !open;
      if (open) group.querySelector('a')?.focus();
    });
    items.push(toggle, group);
  }
  if (workspace) items.push(menuLink(workspace.href, workspace.label, 'account-menu-workspace'));

  const signOutButton = document.createElement('button');
  signOutButton.type = 'button';
  signOutButton.className = 'account-menu-item account-sign-out';
  signOutButton.setAttribute('role', 'menuitem');
  signOutButton.textContent = 'Sign out';
  signOutButton.addEventListener('click', async () => {
    if (signOutButton.disabled) return;
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

  dropdown.append(summary, menuSeparator(), ...items, menuSeparator(), signOutButton);
  menu.replaceChildren(button, dropdown);
  applyPremiumMenuState(menu);

  button.addEventListener('click', (event) => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    // A keyboard press arrives as a click with no pointer detail.
    setAccountMenuOpen(menu, open, { focus: open && event.detail === 0 ? 'first' : null });
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setAccountMenuOpen(menu, true, { focus: 'first' });
    }
  });
  dropdown.addEventListener('keydown', (event) => {
    const entries = accountMenuItems(menu);
    const index = entries.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && entries.length) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? entries.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length;
      entries[next].focus();
    } else if (event.key === 'Tab') {
      setAccountMenuOpen(menu, false);
    }
  });
  dropdown.addEventListener('click', (event) => {
    if (event.target.closest('a')) setAccountMenuOpen(menu, false);
  });
  return menu;
}

document.addEventListener('click', (event) => {
  const menu = document.querySelector('[data-account-menu].is-open');
  if (menu && !menu.contains(event.target)) setAccountMenuOpen(menu, false);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const menu = document.querySelector('[data-account-menu].is-open');
  if (menu) setAccountMenuOpen(menu, false, { focus: 'button' });
});

async function updateAuthenticationNavigation() {
  const navigationActions = document.querySelector('.nav-actions');

  if (!navigationActions) {
    return;
  }

  const auth = await import(authModuleUrl.href);

  if (!auth.isAuthenticated()) {
    // Search is public; signed-out visitors get it before the sign-in links.
    import(globalSearchModuleUrl.href)
      .then((search) => search.mountGlobalSearch(navigationActions,
        navigationActions.querySelector('a[href="login.html"]')))
      .catch(() => {});
    return;
  }

  let user = auth.getStoredUser();

  const renderAuthenticatedState = (currentUser, verificationRefreshed = false) => {
    const workspace = WORKSPACE_LINKS[currentUser?.accountRole] || null;
    // Contributing follows the verified scopes the server just confirmed;
    // the submission endpoints enforce the same rule on every request.
    const canContribute = verificationRefreshed
      && Array.isArray(currentUser?.verifiedScopes) && currentUser.verifiedScopes.length > 0;

    navigationActions.querySelector('a[href="login.html"]')?.remove();
    navigationActions.querySelector('a[href="register.html"]')?.remove();

    const accountMenu = renderAccountMenu(navigationActions, currentUser, { auth, workspace, canContribute });
    updateContributionVisibility(verificationRefreshed ? currentUser : null);
    updateFooterAccountLinks(currentUser);

    // Search, then notifications, then the avatar, whichever module loads first.
    Promise.allSettled([import(globalSearchModuleUrl.href), import(notificationsModuleUrl.href)])
      .then(([search, notifications]) => {
        if (search.status === 'fulfilled') search.value.mountGlobalSearch(navigationActions, accountMenu);
        if (notifications.status === 'fulfilled') notifications.value.mountNotificationBell(navigationActions, accountMenu);
      });
    import(messagesModuleUrl.href).then((messages) => messages.mountMessages()).catch(() => {});
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
