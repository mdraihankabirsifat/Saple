const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '../../frontend');
const read = (file) => fs.readFileSync(path.join(frontend, file), 'utf8').replace(/\r\n/g, '\n');

test('signed-in account actions live under one accessible avatar menu', () => {
  const nav = read('js/nav.js');
  assert.match(nav, /setAttribute\('aria-label', 'Open account menu'\)/);
  assert.match(nav, /setAttribute\('aria-haspopup', 'menu'\)/);
  assert.match(nav, /setAttribute\('aria-expanded', 'false'\)/);
  assert.match(nav, /dropdown\.setAttribute\('role', 'menu'\)/);
  // One container, reused when /api/auth/me refreshes the account.
  assert.match(nav, /let menu = navigationActions\.querySelector\('\[data-account-menu\]'\);/);
  assert.match(nav, /menu\.replaceChildren\(button, dropdown\)/);
  // A failed photo falls back to the initial: never a broken image.
  assert.match(nav, /image\.addEventListener\('error', showInitial, \{ once: true \}\)/);
  // Items and their eligibility.
  assert.match(nav, /menuLink\('profile\.html', 'Profile'\)/);
  assert.match(nav, /menuLink\('premium\.html', 'Subscription'\)/);
  assert.match(nav, /if \(!workspace\) items\.push\(menuLink\('my-applications\.html', 'My applications'\)\)/);
  assert.match(nav, /if \(currentUser\?\.userType === 'EMPLOYEE'\) items\.push\(menuLink\('employee-verification\.html', 'Verification'\)\)/);
  assert.match(nav, /const canContribute = verificationRefreshed\s*&& Array\.isArray\(currentUser\?\.verifiedScopes\) && currentUser\.verifiedScopes\.length > 0;/);
  assert.match(nav, /if \(workspace\) items\.push\(menuLink\(workspace\.href, workspace\.label, 'account-menu-workspace'\)\)/);
  // Sign out reuses the existing logout and cannot be double-clicked.
  assert.match(nav, /signOutButton\.textContent = 'Signing out…';/);
  assert.match(nav, /await auth\.logout\(\);/);
  // Subscription state is fetched once, not on every open, and respects admin access.
  assert.match(nav, /premiumMenuRequest \|\|= import\(apiModuleUrl\.href\)/);
  assert.match(nav, /access\.administratorAccess/);
  assert.match(nav, /label: \{ admin: 'Admin access', trial: 'PRO', premium: 'Active', upgrade: 'Upgrade' \}/);
  // Outside click and Escape close it; Escape returns focus to the avatar.
  assert.match(nav, /if \(menu && !menu\.contains\(event\.target\)\) setAccountMenuOpen\(menu, false\);/);
  assert.match(nav, /setAccountMenuOpen\(menu, false, \{ focus: 'button' \}\)/);
  // The old header Contribute dropdown is gone from every page.
  for (const page of fs.readdirSync(frontend).filter((name) => name.endsWith('.html'))) {
    assert.doesNotMatch(read(page), /class="contribute-menu"/, page);
  }
  const css = read('css/premium.css');
  assert.match(css, /\.account-dropdown \{[\s\S]*?width: min\(290px, calc\(100vw - 24px\)\);/);
  assert.match(css, /\.nav-compact \.account-dropdown \{ position: static;/);
});

test('the hero live layer uses real data, stays optional and respects reduced motion', () => {
  const html = read('index.html');
  const script = read('js/home-hero.js');
  const css = read('css/premium.css');
  assert.match(html, /<div class="hero-intel" data-hero-intel hidden>/);
  assert.match(html, /<svg class="hero-graph" data-hero-graph[^>]*aria-hidden="true"/);
  assert.match(html, /<script type="module" src="js\/home-hero\.js"><\/script>/);
  // The original hero artwork stays.
  assert.match(html, /<div class="home-hero-background" aria-hidden="true"><\/div>/);
  // One request for the cards, one for the graph; failure leaves the hero alone.
  assert.match(script, /apiRequest\('\/api\/home\/recommendations', \{ auth: 'optional' \}\)/);
  assert.match(script, /apiRequest\('\/api\/stats\/activity'\)/);
  assert.match(script, /if \(!hasCards && !hasGraph\) return;/);
  assert.doesNotMatch(script, /Math\.random|innerHTML|setInterval\(\s*\(\)\s*=>\s*renderGraph/);
  // "For you" only when the server ranked the items for this account.
  assert.match(script, /label: personal \? 'Jobs for you' : 'Trending job'/);
  // Free visitors only ever see the preview text.
  assert.match(script, /item\.questionsLocked \? `“\$\{item\.questionsPreview/);
  // Rotation pauses when hidden or hovered, and never runs under reduced motion.
  assert.match(script, /if \(document\.hidden \|\| layer\.matches\(':hover, :focus-within'\)\) return;/);
  assert.match(script, /if \(pool\.length > nodes\.length && !reduceMotion\.matches\)/);
  // Visible cards prefer distinct titles, so one role never fills the layer.
  assert.match(script, /if \(!titles\.has\(card\.title\)\) return \{ card, index \};/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n  \.hero-intel,\n  \.intel-card \{ transition: none; \}\n  \.hero-graph,\n  \.intel-card \{ animation: none !important; \}/);
  assert.match(css, /@media \(max-width: 1100px\) \{\n  \.hero-intel \{ display: none; \}/);
  assert.match(read('sw.js'), /'js\/home-hero\.js'/);
});
