const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontendDirectory = path.resolve(__dirname, '../../frontend');
const readFrontend = (relativePath) => fs.readFileSync(path.join(frontendDirectory, relativePath), 'utf8');

test('every frontend page loads the shared navigation and provides a footer target', () => {
  const htmlFiles = fs.readdirSync(frontendDirectory).filter((fileName) => fileName.endsWith('.html'));

  assert.ok(htmlFiles.includes('faq.html'));
  assert.ok(htmlFiles.includes('about.html'));

  htmlFiles.forEach((fileName) => {
    const html = readFrontend(fileName);
    assert.match(html, /<script src="js\/nav\.js" defer><\/script>/, `${fileName} must load shared navigation`);
    assert.match(html, /class="site-footer"/, `${fileName} must provide the shared footer target`);
  });
});

test('shared navigation defines every public link, route group, active state, and footer information link', () => {
  const script = readFrontend('js/nav.js');

  [
    ['Home', 'index.html'],
    ['Companies', 'companies.html'],
    ['Salaries', 'salaries.html'],
    ['Reviews', 'reviews.html'],
    ['Interviews', 'interviews.html'],
    ['Jobs', 'jobs.html'],
    ['FAQ', 'faq.html'],
    ['About', 'about.html']
  ].forEach(([label, destination]) => {
    assert.match(script, new RegExp(`label: '${label}', destination: '${destination}'`));
  });

  assert.match(script, /company-details\.html/);
  assert.match(script, /submit-salary\.html/);
  assert.match(script, /submit-review\.html/);
  assert.match(script, /interview-experience\.html/);
  assert.match(script, /classList\.add\('active'\)/);
  assert.match(script, /setAttribute\('aria-current', 'page'\)/);
  assert.match(script, /job-details\.html/);
  assert.match(script, /my-applications\.html/);

  // The footer now carries the full information set, including the policy
  // pages the Web Risk remediation added.
  for (const destination of [
    'about.html', 'faq.html', 'privacy.html', 'terms.html', 'security.html', 'contact.html'
  ]) {
    assert.match(script, new RegExp(`destination: '${destination.replace('.', '\\.')}'`), destination);
  }

  // Site identity and the affiliation disclaimer are injected once, here, so
  // they cannot drift between pages.
  assert.match(script, /independent BUET CSE academic project for company and career insights/);
  assert.match(script, /not affiliated with, endorsed by, or an official login or careers service/);
  assert.match(script, /className = 'site-identity'/);
  assert.match(script, /className = 'site-disclaimer'/);
});

test('auth-aware and verified-contributor navigation behavior remains connected', () => {
  const script = readFrontend('js/nav.js');

  assert.match(script, /import\(authModuleUrl\.href\)/);
  assert.match(script, /auth\.getCurrentUser\(\)/);
  // Workspace links follow the role the server reported for this token.
  assert.match(script, /const WORKSPACE_LINKS = \{/);
  assert.match(script, /ADMIN: \{ href: 'admin\.html'/);
  assert.match(script, /COMPANY_REPRESENTATIVE: \{ href: 'representative\.html'/);
  assert.match(script, /WORKSPACE_LINKS\[currentUser\?\.accountRole\]/);
  assert.match(script, /mountNotificationBell/);
  assert.match(script, /currentUser\?\.userType === 'EMPLOYEE'/);
  assert.match(script, /verifiedScopes/);
  assert.match(script, /updateContributionVisibility/);
});

test('FAQ shows fourteen uniquely identified questions and visible answers', () => {
  const html = readFrontend('faq.html');
  const faq = html.slice(html.indexOf('<section class="section"'), html.indexOf('</main>'));
  const questions = [...faq.matchAll(/<h2 id="([^"]+)" class="faq-question">/g)];
  const panels = [...faq.matchAll(/<div id="([^"]+)" class="faq-answer">/g)];

  assert.equal(questions.length, 14);
  assert.equal(panels.length, 14);
  assert.equal(new Set(questions.map((match) => match[1])).size, 14);
  assert.equal(new Set(panels.map((match) => match[1])).size, 14);
  assert.doesNotMatch(faq, /data-faq-button|aria-expanded|aria-controls|\bhidden>/);
  assert.doesNotMatch(html, /js\/faq\.js/);
});

test('Contact sits between FAQ and About and provides the developer details', () => {
  const nav = readFrontend('js/nav.js');
  const contact = readFrontend('contact.html');
  const publicLinks = nav.slice(nav.indexOf('const publicNavigation'), nav.indexOf('const informationPages'));
  assert.match(publicLinks, /label: 'FAQ'[\s\S]*label: 'Contact'[\s\S]*label: 'About'/);
  for (const detail of [
    'Md. Raihan Kabir Sifat',
    'Computer Science &amp; Engineering Undergraduate, BUET',
    'Dhaka, Bangladesh',
    'Bangladesh University of Engineering and Technology (BUET)',
    'Shahbagh, Dhaka-1000, Bangladesh',
    'academic database project'
  ]) assert.ok(contact.includes(detail), detail);
  assert.match(contact, /href="mailto:www\.raihankabireusc@gmail\.com"/);
  assert.match(contact, /frontend\/assets\/docs\/Md_Raihan_Kabir_Sifat_resume\.pdf/);
  assert.match(contact, /View Resume \(coming soon\)/);
});

test('every supplied page image is mapped to its intended hero', () => {
  const css = readFrontend('css/premium.css');
  for (const [page, className, image] of [
    ['companies.html', 'companies', 'companies.png'],
    ['salaries.html', 'salaries', 'salaries.png'],
    ['reviews.html', 'reviews', 'Reviews.png'],
    ['interviews.html', 'interviews', 'Interviews.png'],
    ['jobs.html', 'jobs', 'job.png'],
    ['faq.html', 'faq', 'FAQ.png'],
    ['contact.html', 'faq', 'FAQ.png'],
    ['about.html', 'faq', 'FAQ.png']
  ]) {
    assert.match(readFrontend(page), new RegExp(`page-art-${className}`), page);
    assert.ok(css.includes(`.page-art-${className} { --page-art-image: url("../assets/hero/${image}"); }`));
    assert.ok(fs.existsSync(path.join(frontendDirectory, 'assets/hero', image)), image);
  }
});

test('FAQ and About describe implemented boundaries without exposing private values', () => {
  const content = `${readFrontend('faq.html')} ${readFrontend('about.html')}`;

  assert.match(content, /Administrator status does not automatically grant contribution rights/);
  assert.match(content, /current Saple implementation enforces the approved company/);
  assert.match(content, /does not yet store or enforce a\s+separate designation scope/);
  assert.match(content, /temporary,\s+single-use reset link/);
  assert.match(content, /never emails the existing password/);
  assert.match(content, /ML is not active in the current build/);
  assert.match(content, /at least 50 moderator-reviewed historical records/);
  assert.match(content, /synthetic (?:academic )?demonstration data/i);
  assert.doesNotMatch(content, /demo:\/\/proof/i);
  assert.doesNotMatch(content, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
});

test('shared and information-page styles guard mobile navigation and overflow', () => {
  const commonCss = readFrontend('css/common.css');
  const informationCss = readFrontend('css/info-pages.css');

  assert.match(commonCss, /overflow-wrap:\s*anywhere/);
  // Compact (menu button) navigation is keyed on html.nav-compact, which theme.js
  // sets for narrow screens and nav.js sets whenever the desktop row cannot fit.
  assert.match(commonCss, /\.nav-compact \.nav-menu\.is-open/);
  assert.match(informationCss, /@media \(max-width: 700px\)/);
  assert.match(informationCss, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(commonCss, /:focus-visible/, 'information pages must inherit the shared visible focus rule');
});
