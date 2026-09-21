const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '../../frontend');
const read = (file) => fs.readFileSync(path.join(frontend, file), 'utf8');
const htmlFiles = () => fs.readdirSync(frontend).filter((name) => name.endsWith('.html'));

const NEW_PAGES = ['jobs.html', 'job-details.html', 'my-applications.html', 'representative.html'];
const POLICY_PAGES = ['privacy.html', 'terms.html', 'security.html', 'contact.html'];

// ---------------------------------------------------------------------------
// The pages exist and are wired the same way as the rest of the site
// ---------------------------------------------------------------------------

test('the new pages exist and load the shared shell', () => {
  for (const page of [...NEW_PAGES, ...POLICY_PAGES]) {
    const html = read(page);
    assert.match(html, /<script src="js\/nav\.js" defer><\/script>/, page);
    assert.match(html, /css\/common\.css/, page);
    assert.match(html, /class="site-footer"/, page);
    // theme.js runs before the stylesheet so a page never flashes the wrong theme.
    assert.ok(html.indexOf('js/theme.js') < html.indexOf('css/common.css'), page);
  }
});

test('private pages ask search engines to stay away and public ones do not', () => {
  for (const page of ['my-applications.html', 'representative.html']) {
    assert.match(read(page), /<meta name="robots" content="noindex, nofollow">/, page);
  }
  for (const page of ['jobs.html', 'job-details.html', ...POLICY_PAGES]) {
    assert.doesNotMatch(read(page), /noindex/, page);
  }
});

// ---------------------------------------------------------------------------
// Accessibility hooks
// ---------------------------------------------------------------------------

test('every page reaches its main content by keyboard', () => {
  const nav = read('js/nav.js');

  // Pages that do not carry a skip link get one injected, so a page cannot be
  // added without it.
  assert.match(nav, /function ensureSkipLink\(\)/);
  assert.match(nav, /skip\.className = 'skip-link'/);
  assert.match(nav, /if \(!main\.id\) main\.id = 'main-content'/);
  assert.match(read('css/common.css'), /\.skip-link \{[\s\S]*?position: fixed/);
  assert.match(read('css/common.css'), /\.skip-link:focus-visible \{\s*top:/);

  for (const page of NEW_PAGES) {
    assert.match(read(page), /<main[^>]*>/, page);
  }
});

test('asynchronous regions announce themselves and controls carry labels', () => {
  for (const page of ['jobs.html', 'job-details.html', 'my-applications.html', 'representative.html']) {
    const html = read(page);
    assert.match(html, /role="status" aria-live="polite"/, page);
  }

  const jobs = read('jobs.html');
  // Every filter control is labelled, not placeholder-only.
  const controls = [...jobs.matchAll(/<(?:input|select)[^>]*id="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(controls.length >= 6);
  for (const id of controls) {
    if (id.endsWith('-options')) continue;
    assert.match(jobs, new RegExp(`<label for="${id}">`), id);
  }
});

test('the representative workspace uses a real tab pattern', () => {
  const html = read('representative.html');
  const script = read('js/representative.js');

  assert.match(html, /role="tablist"/);
  assert.equal((html.match(/role="tab"/g) || []).length, 3);
  assert.equal((html.match(/role="tabpanel"/g) || []).length, 3);
  assert.match(html, /aria-controls="panel-verifications"/);
  assert.match(html, /aria-labelledby="tab-verifications"/);

  // Arrow keys, Home and End move between tabs, and only the active tab is
  // in the tab order.
  assert.match(script, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/);
  assert.match(script, /setAttribute\('tabindex', isActive \? '0' : '-1'\)/);
  assert.match(script, /setAttribute\('aria-selected', String\(isActive\)\)/);
});

test('status is never carried by colour alone', () => {
  const css = read('css/common.css');

  // Each badge tone adds its own glyph through ::before.
  assert.match(css, /\.status-badge::before \{[\s\S]*?content: "●"/);
  assert.match(css, /\.status-positive::before \{\s*content: "✓";/);
  assert.match(css, /\.status-negative::before \{\s*content: "✕";/);
  assert.match(css, /\.status-progress::before \{\s*content: "◐";/);

  // The announcement bar names its severity in words as well.
  assert.match(read('js/announcements.js'), /labels = \{ INFO: 'Notice', WARNING: 'Important', CRITICAL: 'Urgent' \}/);
  // Unread notifications say "Unread", not just a coloured row.
  assert.match(read('js/notifications.js'), /className: 'notification-flag', text: 'Unread'/);
});

test('interactive targets stay large enough to hit on a phone', () => {
  const css = read('css/common.css');
  const home = read('css/home.css');

  assert.match(css, /\.pagination-page,\s*\n\.pagination-step \{[\s\S]*?min-width: 44px;\s*\n\s*min-height: 44px/);
  assert.match(home, /\.role-chip \{[\s\S]*?min-height: 44px/);
  assert.match(read('css/workspace.css'), /\.tab \{[\s\S]*?min-height: 44px/);
});

test('motion is reduced or removed when the visitor asks for that', () => {
  const css = read('css/common.css');

  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?animation-duration: 1ms !important/);
  assert.match(css, /transition-duration: 1ms !important/);
  assert.match(read('js/ui.js'), /export function prefersReducedMotion\(\)/);
  // Counters print instead of animating rather than being skipped entirely.
  assert.match(read('js/ui.js'), /if \(prefersReducedMotion\(\) \|\| target <= 0\)/);
});

// ---------------------------------------------------------------------------
// Rendering safety
// ---------------------------------------------------------------------------

test('no frontend script turns a string into markup', () => {
  const scripts = fs.readdirSync(path.join(frontend, 'js'));
  assert.ok(scripts.length >= 20);

  for (const file of [...scripts.map((name) => `js/${name}`), 'sw.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /\.innerHTML\s*=/, file);
    assert.doesNotMatch(source, /insertAdjacentHTML|document\.write|\.outerHTML\s*=/, file);
    assert.doesNotMatch(source, /\beval\(|new Function\(/, file);
  }

  // The shared helper only ever produces nodes and text.
  const ui = read('js/ui.js');
  assert.match(ui, /node\.textContent = String\(text\)/);
  assert.match(ui, /document\.createTextNode\(child\)/);
});

test('no page or script loads a third-party script, style, font or image', () => {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|html|css)$/.test(entry.name)) files.push(full);
    }
  };
  walk(frontend);

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const name = path.relative(frontend, file);

    assert.doesNotMatch(source, /<script[^>]+src="https?:/i, name);
    assert.doesNotMatch(source, /<link[^>]+href="https?:/i, name);
    assert.doesNotMatch(source, /<iframe|<embed|<object|<video|<audio/i, name);
    assert.doesNotMatch(source, /@import\s+url\(["']?https?:/i, name);
    assert.doesNotMatch(source, /cdn\.|unpkg|jsdelivr|googleapis|gstatic|fontawesome/i, name);

    // The only absolute links left are ordinary hrefs to the repository.
    const absolute = [...source.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((match) => match[0]);
    for (const url of absolute) {
      const allowed = url.startsWith('https://github.com/')
        || url.startsWith('http://localhost')
        || url.startsWith('http://127.0.0.1')
        // The local backend origin is built from a template literal.
        || url.startsWith('http://${')
        || url.startsWith('https://${')
        || url.startsWith('http://www.w3.org')
        || url.startsWith('https://www.w3.org');
      assert.ok(allowed, `${name}: ${url}`);
    }
  }
});

test('the strict CSP is satisfiable: no inline style, script or handler anywhere', () => {
  for (const page of htmlFiles()) {
    const html = read(page);
    assert.doesNotMatch(html, /\sstyle="/, page);
    assert.doesNotMatch(html, /<style[\s>]/, page);
    assert.doesNotMatch(html, /\son[a-z]+="/, page);
    // Scripts are always external files, never inline blocks.
    const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)];
    assert.equal(inline.length, 0, `${page} has an inline script`);
  }
});

// ---------------------------------------------------------------------------
// Job and application flows
// ---------------------------------------------------------------------------

test('the job board shows loading, empty and error states rather than a blank panel', () => {
  const script = read('js/jobs.js');

  assert.match(script, /renderSkeletons\(results, 4, 'job'\)/);
  assert.match(script, /renderEmptyState\(results, \{/);
  assert.match(script, /renderErrorState\(results, error, \(\) => controller\.reload\(\)\)/);
  assert.match(script, /renderPagination\(paginationHost/);
  // Filters survive a reload and can be shared: the shared browse controller
  // mirrors them in the address bar.
  assert.match(script, /createBrowseController\(\{/);
  assert.match(read('js/browse-controls.js'), /window\.history\[push \? 'pushState' : 'replaceState'\]/);
});

test('an error state always offers a retry and explains what to do', () => {
  const ui = read('js/ui.js');

  assert.match(ui, /text: 'Retry'/);
  assert.match(ui, /const RECOVERY_HINTS = \{/);
  for (const kind of ['NETWORK', 'TIMEOUT', 'CORS', 'INVALID_RESPONSE', 'SERVER', 'DATABASE', 'AUTH']) {
    assert.match(ui, new RegExp(`${kind}:`), kind);
  }
  // Technical detail is shown only on a local development host.
  assert.match(ui, /\['localhost', '127\.0\.0\.1'\]\.includes\(window\.location\.hostname\)/);
  assert.match(ui, /isLocal && error\?\.status/);
});

test('the application form states the upload policy and confirms before withdrawing', () => {
  const details = read('js/job-details.js');
  const applications = read('js/my-applications.js');

  assert.match(details, /Saple does not accept file uploads/);
  assert.match(details, /do not include identity documents/i);
  assert.match(details, /minlength: '30', maxlength: '4000'/);

  assert.match(applications, /window\.confirm\(/);
  assert.match(applications, /canWithdraw/);
  // A withdrawn or decided application offers no withdraw control at all.
  assert.match(applications, /if \(application\.canWithdraw\)/);
});

test('privileged state changes confirm first and say what will happen', () => {
  const representative = read('js/representative.js');
  const oversight = read('js/admin-oversight.js');

  assert.ok((representative.match(/window\.confirm\(/g) || []).length >= 3);
  assert.match(representative, /Open applicants will be notified\. Existing applications and history are kept\./);
  assert.match(oversight, /loses access to this company immediately/);
  assert.match(oversight, /Applicants are notified and every application is kept/);
});

test('the representative workspace explains a closed door without guessing why', () => {
  const script = read('js/representative.js');

  assert.match(script, /error\.kind === 'FORBIDDEN'/);
  assert.match(script, /No active company assignment/);
  assert.match(script, /error\.kind === 'AUTH'/);
  // The page never decides the reason itself; the server already did.
  assert.match(script, /the server has already decided/);
});

// ---------------------------------------------------------------------------
// The Saple Guide in the browser
// ---------------------------------------------------------------------------

test('the guide is labelled, discloses its privacy position and can be closed by keyboard', () => {
  const script = read('js/assistant.js');

  assert.match(script, /Saple Guide \(AI-assisted\)/);
  assert.match(script, /status\?\.privacyNotice/);
  assert.match(script, /role: 'dialog'/);
  assert.match(script, /trapFocus\(panel, \{ onEscape: closePanel \}\)/);
  assert.match(script, /aria-live': 'polite'/);
  assert.match(script, /Clear conversation/);
  // History stays in memory for the visit; nothing is written to storage.
  assert.doesNotMatch(script, /localStorage|sessionStorage|indexedDB/);
});

test('the guide button does not sit on top of the notification controls', () => {
  const css = read('css/common.css');

  // The launcher is pinned bottom-right; the bell lives in the header.
  const guideRoot = css.match(/\.guide-root \{[^}]*\}/)[0];
  assert.match(guideRoot, /position: fixed/);
  assert.match(guideRoot, /bottom: 16px/);
  assert.match(guideRoot, /right: 16px/);
  assert.match(css, /\.notification-bell \{\s*\n\s*position: relative/);
  assert.match(css, /\.guide-panel \{[\s\S]*?width: min\(420px, calc\(100vw - 32px\)\)/);
});

test('admin oversight starts only after its tab state is declared', () => {
  const source = read('js/admin-oversight.js');
  // Calling startOversight() before these const declarations threw a
  // ReferenceError, so the oversight tabs never loaded.
  const start = source.lastIndexOf('if (root && tabList) startOversight();');
  assert.ok(start > source.indexOf('const LOADERS = {'), 'start runs after LOADERS');
  assert.ok(start > source.indexOf('const loaded = new Set();'), 'start runs after loaded');
  assert.equal(source.split('startOversight();').length - 1, 1, 'started exactly once');
});
