const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../../frontend');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const moduleFrom = (name) => import(`data:text/javascript;base64,${Buffer.from(read(name)).toString('base64')}`);

test('pagination clamps invalid pages, limits DOM candidates to 20 and provides compact page links', async () => {
  const { paginate, pageNumbers } = await moduleFrom('js/company-directory.js');
  const data = Array.from({ length: 127 }, (_, i) => i);
  assert.deepEqual(paginate(data, 2).items, data.slice(20, 40));
  assert.equal(paginate(data, 2).start, 21);
  assert.equal(paginate(data, 2).end, 40);
  assert.equal(paginate(data, 100).items.length, 7);
  for (const page of [-1, 0, NaN, Infinity, 1.5]) assert.equal(paginate(data, page).page, 1);
  assert.equal(paginate([], 10).start, 0);
  assert.deepEqual(pageNumbers(5, 20), [1, '…', 4, 5, 6, '…', 20]);
});

test('all sort orders keep missing data last and salary source determines ranking', async () => {
  const { sortCompanies } = await moduleFrom('js/company-directory.js');
  const data = [
    { companyId: 1, companyName: 'Alpha', reviewCount: 2, averageRating: 2, communitySalaryCount: 1, communityMinimumSalary: 10, communityMaximumSalary: 20, verifiedSalaryCount: 1, verifiedMinimumSalary: 100, verifiedMaximumSalary: 200 },
    { companyId: 2, companyName: 'Beta', reviewCount: 1, averageRating: 5, communitySalaryCount: 1, communityMinimumSalary: 30, communityMaximumSalary: 40, verifiedSalaryCount: 1, verifiedMinimumSalary: 50, verifiedMaximumSalary: 60 },
    { companyId: 3, companyName: 'Absent', reviewCount: 0, averageRating: null }
  ];
  const ids = (sort, source) => sortCompanies(data, sort, source).map((c) => c.companyId);
  assert.deepEqual(ids('name-asc'), [3, 1, 2]);
  assert.deepEqual(ids('name-desc'), [2, 1, 3]);
  for (const sort of ['rating-desc', 'salary-desc']) assert.deepEqual(ids(sort), [2, 1, 3]);
  for (const sort of ['rating-asc', 'salary-asc']) assert.deepEqual(ids(sort), [1, 2, 3]);
  assert.deepEqual(ids('salary-desc', 'VERIFIED'), [1, 2, 3]);
  assert.deepEqual(ids('salary-asc', 'VERIFIED'), [2, 1, 3]);
  assert.deepEqual(data.map((c) => c.companyId), [1, 2, 3]);
});

test('salary range preserves open bounds and decimal semantics while preventing crossed values', async () => {
  const { parseSalary, normalizeRange } = await moduleFrom('js/salary-range.js');
  assert.equal(parseSalary('12,345.67'), 12345.67);
  for (const value of ['', 'NaN', '-1', '1e5', '10000000000', '42.001']) assert.equal(parseSalary(value), null);
  assert.deepEqual(normalizeRange('', ''), { min: null, max: null });
  assert.deepEqual(normalizeRange('200', '100', 'min'), { min: 100, max: 100 });
  assert.deepEqual(normalizeRange('200', '100', 'max'), { min: 200, max: 200 });
  assert.deepEqual(normalizeRange('600000.25', ''), { min: 600000.25, max: null });
});

test('theme defaults to light, restores and persists dark, and survives unavailable storage', () => {
  const source = read('js/theme.js');
  for (const saved of [null, 'dark', 'invalid', 'blocked']) {
    let stored = saved; const events = {}; const attributes = {};
    const context = { document: { documentElement: { dataset: {} }, querySelector: () => ({ setAttribute: (key, value) => { attributes[key] = value; } }) },
      localStorage: { getItem() { if (saved === 'blocked') throw Error(); return stored; }, setItem(key, value) { assert.equal(key, 'saple.theme'); stored = value; } },
      window: { addEventListener: (key, callback) => { events[key] = callback; } } };
    vm.runInNewContext(source, context);
    assert.equal(context.document.documentElement.dataset.theme, saved === 'dark' ? 'dark' : 'light');
    context.window.SapleTheme.toggle();
    assert.equal(stored, saved === 'dark' ? 'light' : 'dark');
    assert.equal(attributes['aria-pressed'], String(saved !== 'dark'));
    events.storage({ key: 'saple.theme', newValue: 'light' });
    assert.equal(context.document.documentElement.dataset.theme, 'light');
  }
  for (const file of fs.readdirSync(root).filter((file) => file.endsWith('.html'))) {
    const html = read(file);
    assert.ok(html.indexOf('js/theme.js') < html.indexOf('css/common.css'), file);
  }
});
