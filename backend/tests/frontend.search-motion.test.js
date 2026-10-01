const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '../../frontend');
const read = (file) => fs.readFileSync(path.join(frontend, file), 'utf8').replace(/\r\n/g, '\n');

test('the navbar search is mounted for signed-out visitors too', () => {
  const nav = read('js/nav.js');
  const signedOut = nav.slice(nav.indexOf('if (!auth.isAuthenticated()) {'), nav.indexOf('let user = auth.getStoredUser();'));
  assert.match(signedOut, /search\.mountGlobalSearch\(navigationActions,\s*navigationActions\.querySelector\('a\[href="login\.html"\]'\)\)/);
  // Signed-in visitors get it before the notification bell and the avatar.
  assert.match(nav, /search\.value\.mountGlobalSearch\(navigationActions, accountMenu\)/);
  assert.match(nav, /notifications\.value\.mountNotificationBell\(navigationActions, accountMenu\)/);
});

test('one search module serves the navbar and the homepage, safely', () => {
  const search = read('js/global-search.js');
  // The token is sent only when there is one; anonymous search is allowed.
  assert.match(search, /apiRequest\(`\/api\/search\?\$\{params\}`, \{ auth: isAuthenticated\(\) \}\)/);
  assert.match(search, /const MIN_LENGTH = 2;/);
  assert.match(search, /const DEBOUNCE_MS = 280;/);
  assert.match(search, /event\.key === 'ArrowDown' \|\| event\.key === 'ArrowUp'/);
  assert.match(search, /event\.key === 'Escape'/);
  assert.match(search, /event\.key === 'Enter' && selected >= 0/);
  assert.match(search, /if \(!host\.contains\(event\.target\)\) close\(\)/);
  // Stale responses never overwrite newer ones.
  assert.match(search, /if \(current !== sequence\) return;/);
  assert.doesNotMatch(search, /innerHTML|insertAdjacentHTML|document\.write/);
  // Results link to the public pages and show only public fields.
  assert.match(search, /user-profile\.html\?id=\$\{encodeURIComponent\(user\.userId\)\}/);
  assert.match(search, /company-details\.html\?id=\$\{encodeURIComponent\(company\.companyId\)\}/);
  assert.doesNotMatch(search, /\.email/);
  // Only one dropdown implementation.
  assert.equal((search.match(/function attachDropdown/g) || []).length, 1);
  assert.equal((search.match(/^  attachDropdown\(\{/gm) || []).length, 2);
});

test('the hero search recommends companies live and still submits as before', () => {
  const index = read('index.html');
  const home = read('js/home.js');
  const search = read('js/global-search.js');
  assert.match(index, /<form class="hero-search" action="companies\.html" method="get" role="search"/);
  assert.match(index, /<input id="hero-search-input" name="search" type="search"/);
  assert.match(index, /<button class="button button-primary" type="submit">Search<\/button>/);
  assert.match(home, /import \{ mountHeroSearch \} from '\.\/global-search\.js';/);
  assert.match(home, /mountHeroSearch\(document\.querySelector\('\.hero-search'\)\);/);
  assert.match(search, /searchRequest\(query, 'companies'\)/);
  // No static suggestions: nothing is requested below two characters.
  assert.match(search, /if \(!queryReady\(\)\) \{ close\(\);/);
});

test('a public profile is read-only when signed out', () => {
  const profile = read('js/user-profile.js');
  assert.doesNotMatch(profile, /location\.replace\(`login\.html/);
  assert.match(profile, /apiRequest\(`\/api\/users\/\$\{raw\}\/profile`, \{ auth: signedIn \}\)/);
  assert.match(profile, /text: 'Sign in to message', attrs: \{ href: signInToMessage \}/);
  assert.match(profile, /if \(!own && signedIn\) action\.addEventListener/);
  // Still noindex: public to visitors, not to search engines.
  assert.match(read('user-profile.html'), /<meta name="robots" content="noindex, nofollow">/);
});

test('motion is centralized, runs once and respects reduced motion', () => {
  const reveal = read('js/reveal.js');
  const nav = read('js/nav.js');
  const css = read('css/premium.css');

  assert.match(nav, /const revealModuleUrl = new URL\('\.\/reveal\.js', moduleBase\);/);
  assert.match(nav, /reveal\.mountReveal\(\)/);
  assert.match(reveal, /matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(reveal, /new IntersectionObserver/);
  assert.match(reveal, /observer\.unobserve\(element\);/);
  // Classes are removed once revealed, so hover effects work as before.
  assert.match(reveal, /classList\.remove\('reveal', 'is-revealed', 'reveal-enter'\)/);
  assert.doesNotMatch(reveal, /innerHTML|setAttribute\('style'/);
  // The old home-only reveal is gone; there is one system.
  assert.doesNotMatch(read('js/home.js'), /mountSectionReveal|dataset\.reveal/);

  // Only opacity and transform move, briefly, and never on a loop.
  // Entrance motion only: the homepage hero's slow ambient layer (section 23)
  // has its own reduced-motion rules, checked in frontend.account-hero.test.js.
  const motion = css.slice(css.indexOf('/* 21. Motion'), css.indexOf('/* 22. Account menu'));
  assert.match(motion, /@keyframes saple-enter \{\n  from \{ opacity: 0; transform: translateY\(12px\); \}/);
  assert.doesNotMatch(motion, /infinite|scale\(/);
  const reduced = motion.slice(motion.indexOf('@media (prefers-reduced-motion: reduce)'));
  for (const selector of ['.home-hero h1', '.reveal-enter', '.reveal.is-revealed', '.profile-card']) {
    assert.ok(reduced.includes(selector), selector);
  }
  assert.match(reduced, /opacity: 1 !important;/);

  // reveal.js is part of the cached public shell.
  const sw = read('sw.js');
  assert.match(sw, /'js\/reveal\.js'/);
});
