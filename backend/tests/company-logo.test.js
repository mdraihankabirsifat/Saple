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
    this.dataset = {};
    this.hidden = false;
  }

  append(...children) { this.children.push(...children); }
  prepend(...children) { this.children.unshift(...children); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
}

const fakeDocument = {
  createElement: (tagName) => new FakeElement(tagName)
};

test('company marks are generated locally and never request a remote image', async () => {
  const { createCompanyLogo } = await helperModule;

  for (const website of [null, 'https://www.example.com', 'aci-bd.com', 'javascript:alert(1)']) {
    const logo = createCompanyLogo('Aster Byte Limited', website, fakeDocument);
    assert.equal(logo.children.length, 1, 'only the generated initials element is rendered');
    assert.equal(logo.children[0].tagName, 'SPAN');
    assert.equal(logo.children[0].textContent, 'AL');
    assert.equal(logo.children.some((child) => child.tagName === 'IMG'), false);
  }
});

test('no third-party logo host or image source survives in the helper', () => {
  assert.doesNotMatch(helperSource, /logos\.hunter\.io|icons\.duckduckgo\.com|clearbit|favicon/i);
  assert.doesNotMatch(helperSource, /createElement\(\s*['"]img['"]\s*\)/i);
  assert.doesNotMatch(helperSource, /\.src\s*=/);
  // A scheme followed by a host character would be a real outbound address.
  // The only remaining occurrence is a URL-parser template, which is not one.
  assert.doesNotMatch(helperSource, /https?:\/\/[a-z0-9]/i);
});

test('initials cover single words, multiple words, and unusable names', async () => {
  const { getCompanyInitials } = await helperModule;

  assert.equal(getCompanyInitials('Alpha Consulting International'), 'AI');
  assert.equal(getCompanyInitials('ACI'), 'AC');
  assert.equal(getCompanyInitials('  '), 'S');
  assert.equal(getCompanyInitials(null), 'S');
  assert.equal(getCompanyInitials('Example Limited'), 'EL');
});

test('a company keeps the same generated hue on every page', async () => {
  const { getCompanyMarkHue, createCompanyLogo } = await helperModule;
  const first = getCompanyMarkHue('Meghna Analytics');

  assert.equal(getCompanyMarkHue('Meghna Analytics'), first);
  assert.equal(getCompanyMarkHue('meghna analytics'), first);
  assert.ok(Number.isInteger(first) && first >= 0 && first < 360);

  const logo = createCompanyLogo('Meghna Analytics', null, fakeDocument);
  assert.equal(logo.dataset.markHue, String(first));
  // The hue travels as a data attribute so the strict CSP needs no inline style.
  assert.doesNotMatch(helperSource, /\.style\./);
});

test('domain normalization still validates websites for display only', async () => {
  const { normalizeCompanyDomain } = await helperModule;

  assert.equal(normalizeCompanyDomain('https://www.Example.com/about?from=saple'), 'example.com');
  assert.equal(normalizeCompanyDomain('example.com'), 'example.com');
  assert.equal(normalizeCompanyDomain('https://jobs.sub.example.co.uk/openings'), 'jobs.sub.example.co.uk');

  for (const website of [
    null, '', 'not a domain', 'javascript:alert(1)', 'ftp://example.com',
    'http://localhost', 'http://127.0.0.1', 'https://user:secret@example.com', 'https://example'
  ]) {
    assert.equal(normalizeCompanyDomain(website), null);
  }
});

test('directory and detail pages share the local mark helper', () => {
  assert.match(read('frontend/js/companies.js'), /createCompanyLogo\(company\.companyName, company\.website\)/);
  assert.match(read('frontend/js/company-details.js'), /import \{ createCompanyLogo \} from '\.\/company-logo\.js'/);

  const css = read('frontend/css/company-details.css');
  assert.match(css, /\.company-logo \{[\s\S]*width: clamp\(4\.5rem, 8vw, 5\.5rem\)/);
});

test('no frontend file fetches a company logo from a third-party service', () => {
  const frontend = path.join(projectRoot, 'frontend');
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
    assert.doesNotMatch(source, /logos\.hunter\.io|icons\.duckduckgo\.com|logo\.clearbit\.com/i, file);
  }
});
