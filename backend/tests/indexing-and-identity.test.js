const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const securityHeaders = require('../middleware/securityHeaders');
const siteController = require('../controllers/site.controller');
const { PUBLIC_PAGES, PRIVATE_PAGES, isPrivatePath, NOINDEX_VALUE } = require('../config/pages');

// Account flows and workspaces must not be indexed, in the HTML and in the
// response header, while the public directory stays findable. Saple must also
// never ask for anyone else's credentials, which is the pattern a phishing
// classifier looks for.

const frontend = path.resolve(__dirname, '../../frontend');
const read = (file) => fs.readFileSync(path.join(frontend, file), 'utf8').replace(/\r\n/g, '\n');
const htmlFiles = () => fs.readdirSync(frontend).filter((name) => name.endsWith('.html'));

function capture(handler) {
  let body = '';
  const response = {
    type: () => response,
    status: () => response,
    send: (text) => { body = text; return response; }
  };
  handler({ get: () => 'saple.example', secure: true, headers: {} }, response);
  return body;
}

function respond(pathname) {
  const headers = {};
  const request = { path: pathname, get: () => 'saple.example', secure: true, headers: {} };
  const response = { setHeader: (name, value) => { headers[name] = value; } };
  securityHeaders(request, response, () => {});
  return headers;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

test('every HTML page is classified exactly once as public or private', () => {
  const publicFiles = PUBLIC_PAGES.map((page) => page.file);
  const privateFiles = PRIVATE_PAGES.map((page) => page.replace(/^\//, ''));

  for (const file of htmlFiles()) {
    const classified = publicFiles.includes(file) || privateFiles.includes(file);
    assert.ok(classified, `${file} is neither public nor private; classify it in config/pages.js`);
    assert.equal(publicFiles.includes(file) && privateFiles.includes(file), false, `${file} is classified twice`);
  }
  // Nothing may be listed that does not exist.
  for (const file of [...publicFiles, ...privateFiles]) {
    assert.ok(fs.existsSync(path.join(frontend, file)), `${file} is classified but missing`);
  }
});

// ---------------------------------------------------------------------------
// Private pages
// ---------------------------------------------------------------------------

test('every private page carries a noindex robots meta tag', () => {
  for (const page of PRIVATE_PAGES) {
    const html = read(page.replace(/^\//, ''));
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/, page);
  }
});

test('every private path also answers with an X-Robots-Tag header', () => {
  for (const page of [...PRIVATE_PAGES, '/api/auth/me', '/api/companies']) {
    assert.equal(respond(page)['X-Robots-Tag'], NOINDEX_VALUE, page);
  }
  // Case and trailing-slash variants are covered too.
  assert.equal(respond('/Profile.html')['X-Robots-Tag'], NOINDEX_VALUE);
  assert.equal(isPrivatePath('/admin.html/'), true);
});

test('robots.txt disallows every private path and points at the sitemap', () => {
  const body = capture(siteController.getRobots);

  for (const page of PRIVATE_PAGES) assert.match(body, new RegExp(`Disallow: ${page}`), page);
  assert.match(body, /Disallow: \/api\//);
  assert.match(body, /Sitemap: https:\/\/saple\.example\/sitemap\.xml/);
});

// ---------------------------------------------------------------------------
// Public pages
// ---------------------------------------------------------------------------

test('public pages stay indexable in HTML, header and sitemap', () => {
  const sitemap = capture(siteController.getSitemap);

  for (const page of PUBLIC_PAGES) {
    assert.doesNotMatch(read(page.file), /<meta name="robots"[^>]*noindex/, page.file);
    assert.equal(respond(page.path)['X-Robots-Tag'], undefined, page.path);
    assert.match(sitemap, new RegExp(`<loc>https://saple\\.example${page.path.replace(/\./g, '\\.')}</loc>`), page.path);
  }
  // The sitemap lists public pages only.
  for (const page of PRIVATE_PAGES) assert.doesNotMatch(sitemap, new RegExp(page.replace(/\./g, '\\.')), page);
});

// ---------------------------------------------------------------------------
// No deceptive credential requests
// ---------------------------------------------------------------------------

test('no page asks for a password belonging to anyone but Saple', () => {
  const forbidden = /(google|gmail|microsoft|outlook|office\s?365|company|corporate|work|supabase|render|groq|openai)[^.\n]{0,40}password/i;

  for (const file of htmlFiles()) {
    const html = read(file);
    for (const line of html.split('\n')) {
      // "never asks for a company, Google, Microsoft or email-provider
      // password" is a safety notice, not a request.
      if (/never|not\s+asks|no\s+other|only|cannot/i.test(line)) continue;
      assert.doesNotMatch(line, forbidden, `${file}: ${line.trim().slice(0, 110)}`);
    }
  }
});

test('password inputs exist only on the three Saple credential pages', () => {
  const allowed = new Set(['login.html', 'register.html', 'reset-password.html']);

  for (const file of htmlFiles()) {
    const inputs = (read(file).match(/<input[^>]*type="password"/g) || []).length;
    if (allowed.has(file)) {
      assert.ok(inputs > 0, `${file} should collect a Saple password`);
    } else {
      assert.equal(inputs, 0, `${file} must not contain a password field`);
    }
  }
});

test('the profile page offers an emailed reset instead of a password form', () => {
  const html = read('profile.html');

  assert.doesNotMatch(html, /type="password"/);
  assert.doesNotMatch(html, /current-password|Change password/i);
  assert.match(html, /Password and sign-in/);
  assert.match(html, /href="forgot-password\.html"/);
  assert.match(html, /single-use/i);
  assert.doesNotMatch(read('js/profile.js'), /password/i);
});

test('every credential page states the academic identity beside the form', () => {
  const nav = read('js/nav.js');

  for (const page of ['login.html', 'register.html', 'forgot-password.html', 'reset-password.html']) {
    const notice = nav.match(new RegExp(`'${page.replace('.', '\\.')}': '([^']+)'`))[1];
    assert.match(notice, /Saple account/, page);
    assert.match(notice, /BUET CSE academic project|never asks/, page);
  }
  // The notice is rendered inside the form card, not only in the footer.
  assert.match(nav, /main\.querySelector\('\.auth-card \.auth-form'\)/);
});
