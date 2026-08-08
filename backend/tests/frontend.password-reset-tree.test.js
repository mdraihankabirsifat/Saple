const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontendDirectory = path.resolve(__dirname, '../../frontend');
const readFrontend = (relativePath) => fs.readFileSync(path.join(frontendDirectory, relativePath), 'utf8');

test('login links to an enabled forgot-password page with accessible submission states', () => {
  const login = readFrontend('login.html');
  const forgot = readFrontend('forgot-password.html');
  const script = readFrontend('js/forgot-password.js');

  assert.match(login, /<a class="link-button" href="forgot-password\.html">Forgot password\?<\/a>/);
  assert.doesNotMatch(login, /Password recovery is not connected yet/);
  assert.match(forgot, /type="email"[^>]+autocomplete="email"[^>]+required/);
  assert.match(forgot, /role="status" aria-live="polite"/);
  assert.match(script, /isSubmitting/);
  assert.match(script, /submitButton\.disabled = true/);
  assert.match(script, /\/api\/auth\/forgot-password/);
});

test('reset page keeps the token only in memory and validates matching passwords', () => {
  const page = readFrontend('reset-password.html');
  const script = readFrontend('js/reset-password.js');

  assert.match(page, /autocomplete="new-password"/);
  assert.equal((page.match(/class="password-toggle"/g) || []).length, 2);
  assert.match(script, /URLSearchParams\(window\.location\.search\)\.get\('token'\)/);
  assert.match(script, /history\.replaceState/);
  assert.match(script, /passwords do not match|Passwords do not match/i);
  assert.match(script, /\/api\/auth\/reset-password/);
  assert.doesNotMatch(script, /localStorage|sessionStorage|console\./);
});

test('homepage permanently replaces the context card with a decorative inline tree', () => {
  const home = readFrontend('index.html');
  const css = readFrontend('css/home.css');

  assert.doesNotMatch(home, /Research with context|Useful signals, clearly explained|class="hero-panel"/);
  assert.match(home, /<figure class="hero-tree" aria-hidden="true">/);
  assert.match(home, /<svg class="saple-tree"[^>]+role="presentation" focusable="false">/);
  assert.match(home, /tree-seed/);
  assert.match(home, /tree-shoot/);
  assert.match(home, /tree-trunk/);
  assert.match(home, /tree-branch/);
  assert.match(home, /leaf-cluster/);
  assert.doesNotMatch(home, /canvas|video|iframe|Skip/i);
  assert.doesNotMatch(css, /\.hero-panel|\.feature-list/);
});

test('tree growth runs once, finishes within four seconds, and has responsive reduced-motion fallbacks', () => {
  const css = readFrontend('css/home.css');

  assert.match(css, /@keyframes seed-appear/);
  assert.match(css, /@keyframes draw-shoot/);
  assert.match(css, /@keyframes draw-trunk/);
  assert.match(css, /@keyframes draw-branch/);
  assert.match(css, /@keyframes reveal-leaves/);
  assert.match(css, /\.leaves-5[^\n]+2\.72s/);
  assert.doesNotMatch(css, /infinite/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]+\.hero-grid[\s\S]+grid-template-columns: 1fr/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]+animation: none/);
  assert.match(css, /\.hero-tree[\s\S]+width: min\(100%, 470px\)/);
});

test('password recovery FAQ now describes temporary single-use email links', () => {
  const faq = readFrontend('faq.html');

  assert.match(faq, /temporary,\s+single-use reset link/);
  assert.match(faq, /defaults to 15 minutes/);
  assert.match(faq, /never emails the existing password/);
  assert.doesNotMatch(faq, /forgot-password flow is not operational/);
});
