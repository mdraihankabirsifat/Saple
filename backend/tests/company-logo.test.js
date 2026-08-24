const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const helperSource = read('frontend/js/company-logo.js');
const helperModule = import(`data:text/javascript;base64,${Buffer.from(helperSource).toString('base64')}`);

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
  }

  append(...children) { this.children.push(...children); }
  prepend(...children) { this.children.unshift(...children); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'src') delete this.src;
  }

  addEventListener(type, listener, options = {}) {
    this.listeners.set(type, { listener, once: Boolean(options.once) });
  }

  emit(type) {
    const entry = this.listeners.get(type);
    if (!entry) return;
    if (entry.once) this.listeners.delete(type);
    entry.listener();
  }
}

const fakeDocument = {
  createElement: (tagName) => new FakeElement(tagName)
};

test('company logo helper normalizes full URLs and bare domains without trusting raw input', async () => {
  const { getCompanyLogoUrl, normalizeCompanyDomain } = await helperModule;

  assert.equal(normalizeCompanyDomain('https://www.Example.com/about?from=saple'), 'example.com');
  assert.equal(normalizeCompanyDomain('example.com'), 'example.com');
  assert.equal(normalizeCompanyDomain('WWW.Example.com/careers'), 'example.com');
  assert.equal(normalizeCompanyDomain('https://jobs.sub.example.co.uk/openings'), 'jobs.sub.example.co.uk');
  assert.equal(
    getCompanyLogoUrl('https://www.Example.com/path?next=attacker.invalid'),
    'https://logos.hunter.io/example.com'
  );
});

test('company logo helper rejects missing, invalid, credentialed, and unsupported websites', async () => {
  const { normalizeCompanyDomain } = await helperModule;

  for (const website of [
    null,
    '',
    'not a domain',
    'javascript:alert(1)',
    'ftp://example.com',
    'http://localhost',
    'http://127.0.0.1',
    'https://user:secret@example.com',
    'https://example'
  ]) {
    assert.equal(normalizeCompanyDomain(website), null);
  }
});

test('missing and invalid websites render clean initials without an image element', async () => {
  const { createCompanyLogo } = await helperModule;

  const missing = createCompanyLogo('Alpha Consulting International', null, fakeDocument);
  const invalid = createCompanyLogo('Example Limited', 'javascript:alert(1)', fakeDocument);

  assert.equal(missing.children.length, 1);
  assert.equal(missing.children[0].textContent, 'AI');
  assert.equal(missing.children[0].attributes.get('aria-label'), 'Alpha Consulting International company initials');
  assert.equal(invalid.children.length, 1);
  assert.equal(invalid.children[0].textContent, 'EL');
});

test('an unavailable remote logo stays hidden and falls back once without an error loop', async () => {
  const { createCompanyLogo } = await helperModule;
  const logo = createCompanyLogo('Unavailable Company', 'no-logo.invalid', fakeDocument);
  const [image, fallback] = logo.children;

  assert.equal(image.src, 'https://logos.hunter.io/no-logo.invalid');
  assert.equal(image.hidden, true);
  assert.equal(fallback.hidden, false);
  image.emit('error');
  assert.equal(image.src, undefined);
  assert.equal(image.hidden, true);
  assert.equal(fallback.hidden, false);
  assert.equal(image.listeners.has('error'), false);
  image.emit('error');
  assert.equal(fallback.hidden, false);
});

test('an available logo replaces the fallback with accessible responsive image metadata', async () => {
  const { createCompanyLogo, getCompanyInitials } = await helperModule;
  const logo = createCompanyLogo('ACI', 'https://www.aci-bd.com', fakeDocument);
  const [image, fallback] = logo.children;

  assert.equal(getCompanyInitials('ACI'), 'AC');
  assert.equal(image.src, 'https://logos.hunter.io/aci-bd.com');
  assert.equal(image.alt, 'ACI company logo');
  assert.equal(image.loading, 'lazy');
  assert.equal(image.decoding, 'async');
  image.emit('load');
  assert.equal(image.hidden, false);
  assert.equal(fallback.hidden, true);
});

test('company details integrates the reusable helper and responsive logo styling', () => {
  const script = read('frontend/js/company-details.js');
  const css = read('frontend/css/company-details.css');

  assert.match(script, /import \{ createCompanyLogo \} from '\.\/company-logo\.js'/);
  assert.match(script, /createCompanyLogo\(company\.companyName, company\.website\)/);
  assert.match(css, /\.company-logo \{[\s\S]*width: clamp\(4\.5rem, 8vw, 5\.5rem\)/);
  assert.match(css, /\.company-logo-image \{[\s\S]*object-fit: contain/);
  assert.match(css, /\.company-logo-image\[hidden\][\s\S]*display: none/);
});
