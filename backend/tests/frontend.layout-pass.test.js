const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Regression guards for the header, account-page, guide, footer, hero and
// browse-layout pass. Each test names the defect it keeps from coming back.

const frontend = path.resolve(__dirname, '../../frontend');
const read = (file) => fs.readFileSync(path.join(frontend, file), 'utf8').replace(/\r\n/g, '\n');
const htmlFiles = () => fs.readdirSync(frontend).filter((name) => name.endsWith('.html'));
const BROWSE_PAGES = ['companies.html', 'salaries.html', 'reviews.html', 'interviews.html', 'jobs.html'];
const AUTH_PAGES = ['login.html', 'register.html', 'forgot-password.html', 'reset-password.html'];

test('no page shows a brand tagline beside the logo', () => {
  const nav = read('js/nav.js');
  const css = read('css/common.css');

  // The wordmark keeps its identity in a title attribute only.
  assert.doesNotMatch(nav, /className = 'brand-tagline'/);
  assert.match(nav, /brand\.querySelector\('\.brand-tagline'\)\?\.remove\(\)/);
  assert.match(nav, /brand\.setAttribute\('title', SITE_IDENTITY\)/);
  assert.doesNotMatch(css, /\.brand-tagline/);
  for (const page of htmlFiles()) assert.doesNotMatch(read(page), /brand-tagline/, page);

  // The academic disclosure is kept where it belongs.
  assert.match(read('index.html'), /class="hero-badge">Independent BUET CSE academic project/);
  assert.match(read('about.html'), /BUET/);
  assert.match(nav, /SITE_IDENTITY = 'Saple - an independent BUET CSE academic project/);
});

test('the desktop navigation never wraps; it switches to the menu button instead', () => {
  const css = read('css/common.css');
  const nav = read('js/nav.js');
  const theme = read('js/theme.js');

  // No rule anywhere lets the link or action groups wrap onto a second row.
  assert.doesNotMatch(css, /\.nav-links,\s*\n\s*\.nav-actions \{\s*\n\s*flex-wrap: wrap/);
  assert.doesNotMatch(css, /\.nav-actions \{[^}]*flex-wrap: wrap/);
  assert.doesNotMatch(css, /@media \(max-width: 1200px\) and \(min-width: 1051px\)/);
  assert.match(css, /\.nav-links,\n\.nav-actions \{\n  flex-wrap: nowrap;/);
  // Labels never break inside themselves.
  assert.match(css, /\.nav-links a,\n\.nav-text-link,\n\.nav-account-name,\n\.nav-actions \.button,\n\.contribute-menu summary \{\n  white-space: nowrap;/);
  // The header gets a wider container than page content.
  assert.match(css, /\.site-header \.navbar \{\n  width: min\(1600px, calc\(100% - 2rem\)\);/);

  // Compact mode is measured, set before first paint, and drives the menu.
  assert.match(nav, /function fitNavigation\(\)/);
  assert.match(nav, /links\.scrollWidth \+ actions\.scrollWidth \+ gap/);
  assert.match(nav, /root\.classList\.toggle\('nav-compact', !fits\)/);
  assert.match(nav, /new MutationObserver\(requestNavigationFit\)/);
  assert.match(theme, /classList\.add\('nav-compact'\)/);
  assert.match(css, /\.nav-compact \.nav-toggle \{\n  display: grid;/);
  assert.match(css, /\.nav-compact \.nav-menu \{[\s\S]*?display: none;/);
  // Keyboard behaviour and aria-current survive.
  assert.match(nav, /setAttribute\('aria-current', 'page'\)/);
  assert.match(nav, /navigationToggle\?\.focus\(\)/);
});

test('theme.js still runs when matchMedia is unavailable', () => {
  const classes = new Set();
  const window = { addEventListener: () => {} };
  const context = {
    window,
    localStorage: { getItem: () => null },
    document: {
      documentElement: { dataset: {}, classList: { add: (name) => classes.add(name) } },
      querySelector: () => null
    }
  };
  assert.doesNotThrow(() => vm.runInNewContext(read('js/theme.js'), context));
  assert.equal(classes.has('nav-compact'), false);
  assert.equal(context.document.documentElement.dataset.theme, 'light');
});

test('the account safety notice is placed inside the form card, never as a third grid item', () => {
  const nav = read('js/nav.js');
  const body = nav.slice(nav.indexOf('function renderAccountSurfaceNotice'), nav.indexOf('function renderPublicNavigation'));

  assert.match(body, /main\.querySelector\('\.auth-card \.auth-form'\)/);
  assert.match(body, /authForm\.before\(notice\)/);
  assert.doesNotMatch(body, /querySelector\('\.auth-layout'\)/);

  for (const page of AUTH_PAGES) {
    const html = read(page);
    const layout = html.slice(html.indexOf('<div class="auth-layout'), html.indexOf('</main>'));
    // Exactly the intro and the card are direct children of the layout.
    const direct = layout.match(/\n {6}<section class="[^"]+"/g) || [];
    assert.equal(direct.length, 2, page);
    assert.match(html, /<section class="auth-card card"[\s\S]*?<form id="[^"]+" class="auth-form"/, page);
  }

  // Truthful: Saple accounts only, never third-party passwords.
  for (const page of AUTH_PAGES) {
    const line = nav.match(new RegExp(`'${page.replace('.', '\\.')}': '([^']+)'`))[1];
    assert.match(line, /Saple account/, page);
    assert.match(line, /company, Google, Microsoft or email-provider password/, page);
  }

  const css = read('css/auth.css');
  assert.match(css, /\.auth-main \{\n  padding-block: clamp\(1\.5rem, 4vw, 3rem\);/);
  // Tablets and phones: form first, then the supporting information.
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?\.auth-card \{ order: -1;/);
  assert.match(css, /\.register-main \.auth-card \{ order: -1;/);
});

test('the Saple Guide opens above its launcher with one scrolling region', () => {
  const script = read('js/assistant.js');
  const css = read('css/common.css');

  assert.match(script, /container\.append\(buildPanel\(\), launcher\)/);
  assert.doesNotMatch(script, /container\.append\(launcher, buildPanel\(\)\)/);

  assert.match(css, /\.guide-panel \{[^}]*width: min\(420px, calc\(100vw - 32px\)\);[^}]*max-height: min\(650px, calc\(100dvh - 110px\)\);[^}]*display: flex;[^}]*flex-direction: column;[^}]*overflow: hidden;/);
  assert.match(css, /\.guide-head \{\n  flex: none;/);
  assert.match(css, /\.guide-transcript \{[^}]*flex: 1 1 auto;[^}]*min-height: 0;[^}]*overflow-y: auto;/);
  assert.match(css, /\.guide-form \{[^}]*flex: none;[^}]*grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.guide-send \{[^}]*min-width: 4\.75rem;[^}]*white-space: nowrap;/);
  assert.match(script, /className: 'button button-primary button-small guide-send', text: 'Send'/);

  // A short disclosure plus an expandable Privacy section.
  assert.match(script, /className: 'guide-disclosure'/);
  assert.match(script, /el\('details', \{ className: 'guide-privacy-details' \}, \[\n\s*el\('summary', \{ text: 'Privacy' \}\)/);
  // Small screens: a bottom sheet; it steps aside for the filter drawer.
  assert.match(css, /@media \(max-width: 600px\) \{\n  \.guide-root\.is-open \{\n    left: 0;\n    right: 0;\n    bottom: 0;/);
  assert.match(css, /\.filters-open \.guide-root \{\n  display: none;/);

  // Safety properties are unchanged.
  assert.match(script, /trapFocus\(panel, \{ onEscape: closePanel \}\)/);
  assert.match(script, /launcher\.focus\(\)/);
  assert.match(script, /\.textContent = result\.answer/);
  assert.doesNotMatch(script, /innerHTML|AI_API_KEY|apiKey/);
});

test('one shared footer is rendered on every page from nav.js', () => {
  const nav = read('js/nav.js');

  for (const page of htmlFiles()) {
    const html = read(page);
    const footers = html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/g) || [];
    assert.equal(footers.length, 1, page);
    // Pages carry only a fallback line, so markup and renderer cannot both add content.
    assert.match(footers[0], /class="footer-fallback container"/, page);
    assert.doesNotMatch(footers[0], /footer-main|footer-column|footer-bottom/, page);
    assert.match(html, /<script src="js\/nav\.js" defer><\/script>/, page);
  }

  assert.match(nav, /footer\.replaceChildren\(columns, landscape, bottom\)/);
  assert.match(nav, /footerLinkColumn\('footer-explore-heading', 'Explore', footerExplore\)/);
  assert.match(nav, /footerLinkColumn\('footer-account-heading', 'Account & contribute', footerAccount\)/);
  assert.match(nav, /footerLinkColumn\('footer-help-heading', 'Help', informationPages\)/);
  for (const destination of [
    'companies.html', 'salaries.html', 'reviews.html', 'interviews.html', 'jobs.html',
    'login.html', 'register.html', 'my-applications.html', 'submit-salary.html', 'submit-review.html',
    'interview-experience.html', 'representative.html',
    'faq.html', 'about.html', 'contact.html', 'privacy.html', 'terms.html', 'security.html'
  ]) {
    assert.match(nav, new RegExp(`destination: '${destination.replace('.', '\\.')}'`), destination);
  }
  assert.match(nav, /https:\/\/github\.com\/mdraihankabirsifat\/Saple/);
  assert.match(nav, /© 2026 Saple\. BUET CSE Database Project\./);
  assert.match(nav, /dataset\.backToTop = ''/);
  // The landscape is an original inline SVG built in code, marked decorative.
  assert.match(nav, /createElementNS\(SVG_NS, name\)/);
  assert.match(nav, /'aria-hidden': 'true'/);
  // The old information fragment is gone.
  assert.doesNotMatch(nav, /footer-information|renderFooterInformationLinks/);

  const css = read('css/common.css');
  assert.match(css, /\.footer-main \{[^}]*grid-template-columns: minmax\(0, 1\.6fr\) repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(max-width: 1050px\) \{\n  \.footer-main \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /@media \(max-width: 600px\) \{\n  \.footer-main \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.doesNotMatch(css, /\.footer-information/);
});

test('the Jobs disclaimer lives in the footer brand column, not under the results', () => {
  assert.doesNotMatch(read('jobs.html'), /job-disclaimer/);
  assert.doesNotMatch(read('css/jobs.css'), /job-disclaimer/);
  assert.match(read('js/nav.js'), /job applications made through Saple are handled inside Saple only/);
});

test('the homepage tree has no signal layer', () => {
  const home = read('index.html');
  const css = read('css/home.css');

  assert.doesNotMatch(home, /signal-link|signal-node|scene-layer-front|৳|★|✓/);
  assert.doesNotMatch(css, /signal-link|signal-node|node-pop/);
  // The tree itself, its motion and its reduced-motion fallback remain.
  for (const part of ['tree-seed', 'tree-shoot', 'tree-trunk', 'tree-branch', 'leaf-cluster', 'scene-layer-back', 'scene-layer-mid']) {
    assert.match(home, new RegExp(part), part);
  }
  assert.match(home, /<figcaption class="sr-only">\s*A seed sprouts, grows a trunk and branches, and opens into a leafy young tree\.\s*<\/figcaption>/);
  assert.doesNotMatch(home, /career signals/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n  \.tree-seed,\n  \.tree-shoot,\n  \.tree-trunk,\n  \.tree-branch,\n  \.leaf-cluster \{/);
});

test('all five browse pages share the sticky sidebar and drawer system', () => {
  const css = read('css/common.css');
  const controls = read('js/browse-controls.js');

  for (const page of BROWSE_PAGES) {
    const html = read(page);
    assert.match(html, /class="container browse-shell"/, page);
    assert.match(html, /browse-grid"/, page);
    assert.match(html, /browse-sidebar card"[^>]*data-filter-panel/, page);
    assert.match(html, /class="button button-secondary filter-drawer-toggle" type="button" data-filter-toggle/, page);
    assert.match(html, /data-filter-count hidden>0<\/span>/, page);
    assert.match(html, /data-filter-close>Close<\/button>/, page);
    assert.match(html, /name="sort"|id="company-sort"/, page);
    assert.match(html, /type="reset">Clear<\/button>/, page);
  }

  assert.match(css, /\.browse-shell \{\n  width: min\(1640px, calc\(100% - 2\.5rem\)\);/);
  assert.match(css, /\.browse-sidebar \{\n  position: sticky;\n  top: calc\(var\(--header-height\) \+ 16px\);\n  max-height: calc\(100dvh - var\(--header-height\) - 32px\);/);
  assert.match(css, /\.browse-grid > \.browse-sidebar \{\n    display: none;/);

  // Drawer: a modal dialog, Escape and focus return, active count.
  assert.match(controls, /dialog\.showModal\(\)/);
  assert.match(controls, /if \(mobile\.matches\) toggle\?\.focus\(\)/);
  assert.match(controls, /document\.body\.classList\.add\('filters-open'\)/);
  // Apply resets to page 1; Clear rebuilds the address bar from defaults.
  assert.match(controls, /state = \{ filters: readForm\(\), page: 1 \};\n    drawer\.close\(\);\n    run\(1, \{ push: true \}\);/);
  assert.match(controls, /writeForm\(\{\}\);/);
  // Only known filter names are read from, and written to, the address bar.
  assert.match(controls, /for \(const name of fields\) \{\n      const value = params\.get\(name\);/);
  assert.doesNotMatch(controls, /innerHTML/);

  for (const script of ['js/salaries.js', 'js/reviews.js', 'js/interviews.js', 'js/jobs.js']) {
    const source = read(script);
    assert.match(source, /createBrowseController\(\{/, script);
    assert.match(source, /renderEmptyState\(results/, script);
    assert.match(source, /renderErrorState\(results, error, \(\) => controller\.reload\(\)\)/, script);
    assert.match(source, /renderPagination\(paginationHost/, script);
  }
  assert.match(read('js/companies.js'), /mountFilterDrawer\(\{/);
});

test('the paging helper clamps pages and describes ranges', async () => {
  const { paginateList, describeRange } = await import('../../frontend/js/browse-controls.js');
  const items = Array.from({ length: 23 }, (_, index) => index);

  const last = paginateList(items, 9, 10);
  assert.equal(last.pagination.page, 3);
  assert.deepEqual(last.items, [20, 21, 22]);
  assert.equal(paginateList([], 4, 10).pagination.totalPages, 1);

  const noun = { singular: 'review', plural: 'reviews' };
  assert.equal(describeRange({ page: 2, pageSize: 10, total: 23 }, noun), 'Showing 11–20 of 23 reviews.');
  assert.equal(describeRange({ page: 1, pageSize: 10, total: 1 }, noun), 'Showing 1 review.');
  assert.equal(describeRange({ page: 1, pageSize: 10, total: 0 }, noun), 'No reviews found.');
});

test('the service worker caches the new shared module and every listed file exists', () => {
  const sw = read('sw.js');
  assert.match(sw, /'js\/browse-controls\.js'/);
  const assets = sw.slice(sw.indexOf('const ASSETS'), sw.indexOf('].map'));
  for (const file of assets.match(/'[^']+'/g).map((item) => item.slice(1, -1))) {
    assert.ok(fs.existsSync(path.join(frontend, file)), `${file} is listed but missing`);
  }
});
