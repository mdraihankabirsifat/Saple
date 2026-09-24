const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The CSE216 checklist requires authentication to be validated on every
// protected page, not only on the API. These tests check that each private
// page asks the server who the visitor is (GET /api/auth/me through
// getCurrentUser) before requesting anything private, that the shared guard
// behaves correctly, and that public browsing stays public.

const frontend = path.resolve(__dirname, '../../frontend');
const read = (file) => fs.readFileSync(path.join(frontend, file), 'utf8').replace(/\r\n/g, '\n');

// Every page that shows or changes account-specific data, with the script that
// must perform the server-backed check.
const PROTECTED_PAGES = [
  ['admin.html', 'js/admin.js'],
  ['admin.html', 'js/admin-oversight.js'],
  ['representative.html', 'js/representative.js'],
  ['profile.html', 'js/profile.js'],
  ['my-applications.html', 'js/my-applications.js'],
  ['employee-verification.html', 'js/verification.js'],
  ['submit-salary.html', 'js/submit-salary.js'],
  ['submit-review.html', 'js/review.js'],
  ['interview-experience.html', 'js/interview.js']
];

// A page's entry script may do the check itself or import a module that does
// (the contribution pages share contribution-access.js), so follow one level
// of local imports before deciding.
function sessionCheckSources(script) {
  const source = read(script);
  const imported = [...source.matchAll(/from '\.\/([\w.-]+\.js)'/g)].map((match) => `js/${match[1]}`);
  return [source, ...imported.map(read)];
}

// Loads js/require-session.js inside a sandbox: its imports are replaced with
// the stubs a test needs, and its exports become plain context values.
function loadGuard({ authenticated, meError = null, account = null, pathname = '/admin.html' }) {
  const context = {
    events: [],
    window: { location: { pathname, replace: (url) => context.events.push(`replace:${url}`) } }
  };
  const stubs = `
    const isAuthenticated = () => ${JSON.stringify(Boolean(authenticated))};
    const clearSession = () => events.push('clearSession');
    const getCurrentUser = async () => {
      events.push('GET /api/auth/me');
      if (meError) throw Object.assign(new Error(meError.message), meError);
      return account;
    };
  `;
  context.meError = meError;
  context.account = account;
  vm.createContext(context);
  vm.runInContext(read('js/require-session.js').replace(/^import[^\n]+\n/gm, stubs).replace(/^export /gm, ''), context);
  return context;
}

test('every protected page validates the session with the server before private data', () => {
  for (const [page, script] of PROTECTED_PAGES) {
    const validatesWithServer = sessionCheckSources(script)
      .some((source) => /getCurrentUser\(\)/.test(source) || /requireSession\(/.test(source));

    // A stored token is never treated as proof on its own.
    assert.ok(validatesWithServer, `${page} -> ${script} must ask the server before private data`);
    assert.match(read(page), new RegExp(`src="${script}"`), `${page} loads ${script}`);
  }
});

test('the guard only ever returns to an allowlisted Saple page', () => {
  const guard = loadGuard({ authenticated: true });

  assert.equal(guard.signInHref('my-applications.html'), 'login.html?returnTo=my-applications.html');
  assert.equal(guard.signInHref('admin.html'), 'login.html?returnTo=admin.html');
  // Anything that is not one of Saple's own pages loses the returnTo entirely.
  for (const hostile of [
    'https://evil.example/steal', '//evil.example', '../../etc/passwd',
    'javascript:alert(1)', 'unknown-page.html', '', null
  ]) {
    assert.equal(guard.signInHref(hostile), 'login.html', String(hostile));
  }
});

test('an unauthenticated visitor is redirected before any private request', async () => {
  const guard = loadGuard({ authenticated: false });

  assert.equal(await guard.requireSession({ returnTo: 'admin.html' }), null);
  assert.deepEqual(guard.events, ['replace:login.html?returnTo=admin.html']);
  assert.equal(guard.events.includes('GET /api/auth/me'), false);
});

test('a token the server rejects clears the session and returns to sign in', async () => {
  const guard = loadGuard({ authenticated: true, meError: { kind: 'AUTH', message: 'Session expired' } });

  assert.equal(await guard.requireSession({ returnTo: 'admin.html' }), null);
  assert.deepEqual(guard.events, ['GET /api/auth/me', 'clearSession', 'replace:login.html?returnTo=admin.html']);
});

test('a signed-in account without the required role sees access denied, not a redirect', async () => {
  const guard = loadGuard({ authenticated: true, account: { accountRole: 'USER', fullName: 'Synthetic Person' } });
  let denied = null;

  const result = await guard.requireSession({ returnTo: 'admin.html', roles: ['ADMIN'], onDenied: (user) => { denied = user.accountRole; } });

  assert.equal(result, null);
  assert.equal(denied, 'USER');
  assert.deepEqual(guard.events, ['GET /api/auth/me'], 'no redirect for a wrong-role account');
});

test('a valid session returns the account the server reported', async () => {
  const guard = loadGuard({ authenticated: true, account: { accountRole: 'ADMIN' } });

  assert.deepEqual(await guard.requireSession({ returnTo: 'admin.html', roles: ['ADMIN'] }), { accountRole: 'ADMIN' });
  assert.deepEqual(guard.events, ['GET /api/auth/me']);
});

test('a network or server failure is reported, not treated as a valid session', async () => {
  const guard = loadGuard({ authenticated: true, meError: { kind: 'NETWORK', message: 'Connection lost' } });
  let reported = null;

  const result = await guard.requireSession({ returnTo: 'admin.html', onError: (error) => { reported = error.message; } });

  assert.equal(result, null);
  assert.equal(reported, 'Connection lost');
  assert.equal(guard.events.some((event) => event.startsWith('replace')), false);
});

test('public browsing pages never require a session', () => {
  const publicPages = [
    ['index.html', 'js/home.js'],
    ['companies.html', 'js/companies.js'],
    ['company-details.html', 'js/company-details.js'],
    ['salaries.html', 'js/salaries.js'],
    ['reviews.html', 'js/reviews.js'],
    ['interviews.html', 'js/interviews.js'],
    ['jobs.html', 'js/jobs.js'],
    ['faq.html', 'js/faq.js']
  ];

  for (const [page, script] of publicPages) {
    assert.doesNotMatch(read(script), /requireSession\(/, `${page} must stay public`);
    assert.doesNotMatch(read(page), /require-session\.js/, `${page} must not load the guard`);
  }
});

test('the private guard is never cached by the service worker', () => {
  const worker = read('sw.js');
  const assets = worker.slice(worker.indexOf('const ASSETS'), worker.indexOf('].map'));
  const privatePaths = worker.slice(worker.indexOf('const PRIVATE_PATHS'));

  assert.equal(assets.includes("'js/require-session.js'"), false);
  assert.match(privatePaths, /'js\/require-session\.js'/);
});
