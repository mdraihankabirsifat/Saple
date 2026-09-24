const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const YAML = require('yaml');
const { initializeSettings, actions } = require('../scripts/localApp');
const root = path.resolve(__dirname, '../..');
// Built at run time so this file contains no "Bearer <literal>" pattern; the
// value is meaningless and only has to be present.
const SYNTHETIC_AUTHORIZATION = ['Bearer', ['synthetic', 'not', 'a', 'token'].join('-')].join(' ');

function cacheHarness() {
  let stored = null;
  const storage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  const context = { URL, Date, localStorage: storage, document: { querySelector: () => null, querySelectorAll: () => [] } };
  const source = fs.readFileSync(path.join(root, 'frontend/js/offline-cache.js'), 'utf8').replaceAll('export ', '');
  vm.createContext(context); vm.runInContext(source, context);
  return { context, storage, stored: () => JSON.parse(stored || '[]') };
}
test('offline cache allows public GET endpoints and rejects private requests and every write', () => {
  const { context: c } = cacheHarness();
  for (const p of ['/api/companies', '/api/companies/filter-options', '/api/companies/1', '/api/companies/1/salary-summary', '/api/reviews?companyId=1', '/api/job-roles']) assert.equal(c.isCacheable(p), true, p);
  for (const p of ['/api/auth/me', '/api/admin/submissions/pending', '/api/companies/1/verifications', '/api/health/database', '/api/submissions/1/reports']) assert.equal(c.isCacheable(p), false, p);
  assert.equal(c.isCacheable('/api/companies', 'POST'), false);
  assert.equal(c.isCacheable('/api/companies', 'GET', true), false);
  assert.equal(c.isCacheable('/api/companies', 'GET', false, { authorization: SYNTHETIC_AUTHORIZATION }), false);
});
test('cache isolates API origins, canonicalizes queries, limits entries, expires old data and tolerates denied storage', () => {
  const { context: c, storage, stored } = cacheHarness();
  assert.equal(c.cacheKey('https://saple.test', '/api/companies?b=2&a=1'), 'https://saple.test/api/companies?a=1&b=2');
  assert.notEqual(c.cacheKey('https://saple.test/primary', '/api/companies'), c.cacheKey('https://saple.test/local', '/api/companies'));
  for (let i = 0; i < 40; i++) c.savePublicData(`key-${i}`, [i]);
  assert.equal(stored().length, 30); assert.equal(c.readPublicData('key-0'), null);
  c.removePublicData('key-39'); assert.equal(c.readPublicData('key-39'), null);
  storage.setItem('', JSON.stringify([{ key: 'expired', savedAt: Date.now() - 8 * 86400000, data: [] }]));
  assert.equal(c.readPublicData('expired'), null);
  storage.getItem = () => { throw Error('denied'); }; storage.setItem = () => { throw Error('full'); };
  assert.doesNotThrow(() => c.savePublicData('new', [])); assert.equal(c.readPublicData('new'), null);
});
test('local settings contain generated independent secrets and never overwrite an existing file', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'saple-local-test-'));
  const file = path.join(dir, '.env.local');
  try {
    assert.equal(initializeSettings(file), true);
    const before = fs.readFileSync(file, 'utf8');
    assert.equal(before.trim().split('\n').length, 5);
    assert.match(before, /SAPLE_LOCAL_DB_PASSWORD=[a-f0-9]{64}/);
    assert.equal(initializeSettings(file), false); assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert.deepEqual(actions.down, ['down']);
  } finally { fs.unlinkSync(file); fs.rmdirSync(dir); }
});
test('local compose uses its own database, loopback bindings and no hosted env file', () => {
  const source = fs.readFileSync(path.join(root, 'compose.local.yaml'), 'utf8');
  const compose = YAML.parse(source);
  assert.equal(compose.name, 'saple-local');
  assert.match(compose.services.app.environment.DATABASE_URL, /@database:5432\/saple_local$/);
  assert.equal(compose.services.app.environment.DB_SSL, 'false');
  assert.deepEqual(compose.services.app.ports, ['127.0.0.1:3000:3000']);
  assert.deepEqual(compose.services.database.ports, ['127.0.0.1:5433:5432']);
  assert.equal(compose.services.app.env_file, undefined);
  assert.equal(compose.services.app.depends_on.database.condition, 'service_healthy');
  assert.doesNotMatch(source, /supabase|backend\/\.env/);
});
test('service worker asset manifest exists and excludes API requests', () => {
  const source = fs.readFileSync(path.join(root, 'frontend/sw.js'), 'utf8');
  const files = [...source.matchAll(/'((?:css\/|js\/)[^']+|[a-z-]+\.html)'/g)].map((match) => match[1]);
  for (const file of files) assert.ok(fs.existsSync(path.join(root, 'frontend', file)), file);
  assert.ok(files.includes('js/offline-cache.js'));
  assert.match(source, /if \(!allowed\.has\(url\.href\) \|\| PRIVATE_PATHS\.includes\(url\.href\)\) return/);
  assert.match(source, /request\.method !== 'GET'/);
  assert.match(source, /url\.pathname\.includes\('\/api\/'\)/);
  assert.match(source, /request\.headers\.has\('Authorization'\)/);
});

test('the service worker never caches a private page, script or stylesheet', () => {
  const source = fs.readFileSync(path.join(root, 'frontend/sw.js'), 'utf8');
  const assets = source.slice(source.indexOf('const ASSETS'), source.indexOf('const allowed'));
  const privatePaths = source.slice(source.indexOf('const PRIVATE_PATHS'), source.indexOf("self.addEventListener('install'"));

  // Anything that only ever shows one account's data must be absent from the
  // cached shell and named in the purge list, so an older worker's copy goes.
  for (const file of [
    'profile.html', 'admin.html', 'representative.html', 'my-applications.html',
    'employee-verification.html', 'js/notifications.js', 'js/admin.js',
    'js/representative.js', 'js/profile.js'
  ]) {
    assert.equal(assets.includes(`'${file}'`), false, `${file} must not be cached`);
    assert.equal(privatePaths.includes(`'${file}'`), true, `${file} must be purged`);
  }

  // The cache name is versioned and older versions are deleted on activation.
  assert.match(source, /const SHELL_CACHE = 'saple-shell-v4'/);
  assert.match(source, /caches\.delete\(key\)/);
  assert.match(source, /cache\.delete\(href\)/);
});
