const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getNextAccordionIndex, initializeFaqAccordion } = require('../../frontend/js/faq');

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
  assert.match(script, /\['FAQ', 'About'\]/);
});

test('auth-aware and verified-contributor navigation behavior remains connected', () => {
  const script = readFrontend('js/nav.js');

  assert.match(script, /import\(authModuleUrl\.href\)/);
  assert.match(script, /auth\.getCurrentUser\(\)/);
  assert.match(script, /currentUser\?\.accountRole === 'ADMIN'/);
  assert.match(script, /currentUser\?\.userType === 'EMPLOYEE'/);
  assert.match(script, /verifiedCompanies/);
  assert.match(script, /updateContributionVisibility/);
});

test('FAQ has fourteen uniquely linked, initially collapsed accessible regions', () => {
  const html = readFrontend('faq.html');
  const buttons = [...html.matchAll(/<button id="([^"]+)" class="faq-question"[^>]+aria-expanded="false" aria-controls="([^"]+)" data-faq-button>/g)];
  const panels = [...html.matchAll(/<div id="([^"]+)" class="faq-answer" role="region" aria-labelledby="([^"]+)" hidden>/g)];

  assert.equal(buttons.length, 14);
  assert.equal(panels.length, 14);
  assert.equal(new Set(buttons.map((match) => match[1])).size, 14);
  assert.equal(new Set(panels.map((match) => match[1])).size, 14);

  buttons.forEach((button, index) => {
    assert.equal(button[2], panels[index][1]);
    assert.equal(panels[index][2], button[1]);
  });
});

test('FAQ and About describe implemented boundaries without exposing private values', () => {
  const content = `${readFrontend('faq.html')} ${readFrontend('about.html')}`;

  assert.match(content, /Administrator status does not automatically grant contribution rights/);
  assert.match(content, /current Saple implementation enforces the approved company/);
  assert.match(content, /does not yet store or enforce a separate designation scope/);
  assert.match(content, /self-service email forgot-password flow is not operational yet/);
  assert.match(content, /ML is not active in the current build/);
  assert.match(content, /at least 50 moderator-reviewed historical records/);
  assert.match(content, /synthetic (?:academic )?demonstration data/i);
  assert.doesNotMatch(content, /demo:\/\/proof/i);
  assert.doesNotMatch(content, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
});

test('accordion keyboard index movement wraps and supports Home and End', () => {
  assert.equal(getNextAccordionIndex('ArrowDown', 2, 4), 3);
  assert.equal(getNextAccordionIndex('ArrowDown', 3, 4), 0);
  assert.equal(getNextAccordionIndex('ArrowUp', 0, 4), 3);
  assert.equal(getNextAccordionIndex('Home', 3, 4), 0);
  assert.equal(getNextAccordionIndex('End', 0, 4), 3);
});

test('accordion permits only one open panel and responds to keyboard controls', () => {
  class FakeButton {
    constructor(panelId) {
      this.attributes = new Map([['aria-controls', panelId], ['aria-expanded', 'false']]);
      this.listeners = {};
      this.focused = false;
    }
    getAttribute(name) { return this.attributes.get(name); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    focus() { this.focused = true; }
    trigger(type, event = {}) { this.listeners[type](event); }
  }

  const buttons = [new FakeButton('panel-1'), new FakeButton('panel-2'), new FakeButton('panel-3')];
  const panels = new Map(buttons.map((button) => [button.getAttribute('aria-controls'), { hidden: true }]));
  const root = {
    querySelectorAll: () => buttons,
    getElementById: (id) => panels.get(id)
  };

  initializeFaqAccordion(root);
  buttons[0].trigger('click');
  assert.equal(buttons[0].getAttribute('aria-expanded'), 'true');
  assert.equal(panels.get('panel-1').hidden, false);

  buttons[1].trigger('click');
  assert.equal(buttons[0].getAttribute('aria-expanded'), 'false');
  assert.equal(panels.get('panel-1').hidden, true);
  assert.equal(buttons[1].getAttribute('aria-expanded'), 'true');
  assert.equal(panels.get('panel-2').hidden, false);

  let prevented = false;
  buttons[1].trigger('keydown', { key: 'ArrowDown', preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(buttons[2].focused, true);

  buttons[1].trigger('keydown', { key: 'Escape', preventDefault: () => {} });
  assert.equal(buttons[1].getAttribute('aria-expanded'), 'false');
  assert.equal(panels.get('panel-2').hidden, true);
});

test('shared and information-page styles guard mobile navigation and overflow', () => {
  const commonCss = readFrontend('css/common.css');
  const informationCss = readFrontend('css/info-pages.css');

  assert.match(commonCss, /overflow-x:\s*hidden/);
  assert.match(commonCss, /@media \(max-width: 1050px\)[\s\S]*?\.nav-menu\.is-open/);
  assert.match(informationCss, /@media \(max-width: 700px\)/);
  assert.match(informationCss, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(commonCss, /:focus-visible/, 'information pages must inherit the shared visible focus rule');
});
