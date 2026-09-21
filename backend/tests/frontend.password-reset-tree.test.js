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

test('the homepage hero is a self-contained local visual with no embedded media', () => {
  const home = readFrontend('index.html');
  const css = readFrontend('css/home.css');

  assert.match(home, /<figure class="hero-visual" data-hero-visual>/);
  assert.match(home, /<svg class="saple-scene"[^>]+role="img"/);
  for (const part of ['tree-seed', 'tree-shoot', 'tree-trunk', 'tree-branch', 'leaf-cluster']) {
    assert.match(home, new RegExp(part), part);
  }

  // The scene is described for assistive technology rather than hidden, and
  // nothing about it is fetched, framed or embedded.
  assert.match(home, /aria-label="Illustration of a sapling growing from a seed into a leafy young tree"/);
  assert.doesNotMatch(home, /<canvas|<video|<audio|<iframe|<embed|<object/i);
  assert.doesNotMatch(home, /https?:\/\/(?!github\.com)/);
  assert.doesNotMatch(css, /\.hero-panel|\.feature-list/);
});

test('the homepage states what Saple is and what it is not, above the fold', () => {
  const home = readFrontend('index.html');

  assert.match(home, /Independent BUET CSE academic project/);
  assert.match(home, /not affiliated with, endorsed by, or an official login or careers service/);

  // The primary and secondary calls to action the redesign requires.
  assert.match(home, /href="companies\.html">Explore companies<\/a>/);
  assert.match(home, /href="jobs\.html">Browse jobs<\/a>/);
  assert.match(home, /Learn how verification works/);

  // Trust model, audiences and the policy pages are all linked from here.
  assert.match(home, /Verified Salary Range/);
  assert.match(home, /Community Salary Range/);
  assert.match(home, /Approved-only publication/);
  for (const page of ['privacy.html', 'terms.html', 'security.html', 'contact.html', 'about.html', 'faq.html']) {
    assert.match(home, new RegExp(`href="${page.replace('.', '\\.')}"`), page);
  }

  // Counters start empty and are filled from a real endpoint, never seeded
  // with invented numbers in the markup.
  assert.match(home, /data-count="companyCount"/);
  assert.match(home, /data-count="openJobCount"/);
  assert.doesNotMatch(home, /class="snapshot-value"[^>]*>\s*\d/);

  // A skip link and one main landmark, on a page this long.
  assert.match(home, /class="skip-link" href="#main-content"/);
  assert.match(home, /<main id="main-content">/);
});

test('hero motion is short, runs once, and stops when it is unwelcome or unseen', () => {
  const css = readFrontend('css/home.css');
  const script = readFrontend('js/home.js');

  for (const frames of ['seed-appear', 'draw-shoot', 'draw-trunk', 'draw-branch', 'reveal-leaves']) {
    assert.match(css, new RegExp(`@keyframes ${frames}`), frames);
  }
  assert.match(css, /\.leaves-5[^\n]+2\.72s/);
  assert.doesNotMatch(css, /infinite/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]+animation: none/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]+\.hero-grid[\s\S]+grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.hero-visual[\s\S]+width: min\(100%, 470px\)/);

  // The parallax loop yields to reduced motion, to a hidden tab and to the
  // figure leaving the viewport, and it writes a custom property rather than
  // an inline style attribute, so the strict CSP needs no exception.
  assert.match(script, /prefersReducedMotion\(\)/);
  assert.match(script, /visibilitychange/);
  assert.match(script, /IntersectionObserver/);
  assert.match(script, /cancelAnimationFrame/);
  assert.match(script, /setProperty\('--shift-x'/);
});

test('password recovery FAQ now describes temporary single-use email links', () => {
  const faq = readFrontend('faq.html');

  assert.match(faq, /temporary,\s+single-use reset link/);
  assert.match(faq, /defaults to 15 minutes/);
  assert.match(faq, /never emails the existing password/);
  assert.doesNotMatch(faq, /forgot-password flow is not operational/);
});
