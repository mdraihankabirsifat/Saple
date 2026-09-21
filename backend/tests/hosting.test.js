const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { once } = require('node:events');
const { spawnSync } = require('child_process');
const YAML = require('yaml');

const app = require('../app');
const hostingConfig = require('../config/hosting');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const renderPath = path.join(repositoryRoot, 'render.yaml');
const frontendApiPath = path.join(repositoryRoot, 'frontend', 'js', 'api.js');

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('Render Blueprint defines one secret-safe Node web service', () => {
  assert.equal(fs.existsSync(renderPath), true);
  const source = fs.readFileSync(renderPath, 'utf8');
  const blueprint = YAML.parse(source);

  assert.equal(blueprint.services.length, 1);
  const service = blueprint.services[0];
  assert.equal(service.type, 'web');
  assert.equal(service.runtime, 'node');
  assert.equal(service.buildCommand, 'npm ci --omit=dev --prefix backend');
  assert.equal(service.startCommand, 'npm start --prefix backend');
  assert.equal(service.healthCheckPath, '/api/health');
  assert.equal(service.autoDeployTrigger, 'commit');
  assert.equal(blueprint.databases, undefined);
  assert.equal(service.disk, undefined);

  const environment = Object.fromEntries(service.envVars.map((item) => [item.key, item]));
  assert.deepEqual(environment.DATABASE_URL, { key: 'DATABASE_URL', sync: false });
  assert.deepEqual(environment.JWT_SECRET, { key: 'JWT_SECRET', generateValue: true });
  assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(source, /(?:password|secret)\s*[:=]\s*["']?[^\s{]/i);
});

test('Express serves the homepage while preserving the API welcome and routes', async () => {
  const homepage = await fetch(`${baseUrl}/`);
  const homepageBody = await homepage.text();
  assert.equal(homepage.status, 200);
  assert.match(homepage.headers.get('content-type'), /^text\/html/);
  assert.match(homepageBody, /<title>[^<]*Saple/i);

  const welcome = await fetch(`${baseUrl}/api`);
  const welcomeBody = await welcome.json();
  assert.equal(welcome.status, 200);
  assert.equal(welcomeBody.message, 'Welcome to the Saple API');

  const health = await fetch(`${baseUrl}/api/health`);
  const healthBody = await health.json();
  assert.equal(health.status, 200);
  assert.equal(healthBody.message, 'Saple API is running');

  const missingPage = await fetch(`${baseUrl}/this-page-does-not-exist`);
  const missingBody = await missingPage.json();
  assert.equal(missingPage.status, 404);
  assert.equal(missingBody.message, 'Endpoint not found');
});

test('CORS permits local development and same-origin requests without becoming open', async () => {
  const local = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'http://localhost:5500' }
  });
  assert.equal(local.headers.get('access-control-allow-origin'), 'http://localhost:5500');

  const sameOrigin = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: baseUrl }
  });
  assert.equal(sameOrigin.headers.get('access-control-allow-origin'), baseUrl);

  const untrusted = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'https://untrusted.example.test' }
  });
  assert.equal(untrusted.status, 200);
  assert.equal(untrusted.headers.get('access-control-allow-origin'), null);

  const noOrigin = await fetch(`${baseUrl}/api/health`);
  assert.equal(noOrigin.status, 200);
  assert.equal(noOrigin.headers.get('access-control-allow-origin'), null);
});

test('CORS origins are normalized, validated, and configurable', () => {
  const origins = hostingConfig.getAllowedCorsOrigins(
    'https://frontend.example.test/, http://localhost:4400'
  );
  assert.equal(origins.has('https://frontend.example.test'), true);
  assert.equal(origins.has('http://localhost:4400'), true);
  assert.equal(origins.has('http://127.0.0.1:5500'), true);
  assert.throws(
    () => hostingConfig.getAllowedCorsOrigins('https://user:pass@example.test'),
    /without credentials or paths/
  );
});

test('Render enables exactly one trusted proxy hop', () => {
  const result = spawnSync(
    process.execPath,
    ['-e', "process.env.RENDER='true';const app=require('./app');process.stdout.write(String(app.get('trust proxy')));"],
    { cwd: path.join(repositoryRoot, 'backend'), encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '1');
});

test('frontend API resolution keeps hosted traffic same-origin and local ports separate', () => {
  const source = fs.readFileSync(frontendApiPath, 'utf8');
  const functionStart = source.indexOf('const LOCAL_HOSTNAMES');
  const functionEnd = source.indexOf('const API_BASE_URL');
  assert.ok(functionStart >= 0 && functionEnd > functionStart);

  const context = { URL, window: {} };
  vm.createContext(context);
  vm.runInContext(
    `${source.slice(functionStart, functionEnd)}\nthis.resolveApiBaseUrl = resolveApiBaseUrl;`,
    context
  );

  const hosted = {
    hostname: 'saple.example.test', port: '', origin: 'https://saple.example.test'
  };
  const sameOriginLocal = {
    hostname: 'localhost', port: '3000', origin: 'http://localhost:3000'
  };

  // Express same-origin hosting, in production and locally.
  assert.equal(context.resolveApiBaseUrl(hosted, null), hosted.origin);
  assert.equal(context.resolveApiBaseUrl(sameOriginLocal, null), sameOriginLocal.origin);

  // Any local static server, including Live Server on 5500 and 5501, is sent
  // to the Express backend on port 3000 on the same loopback host.
  for (const port of ['5500', '5501', '8080']) {
    for (const hostname of ['localhost', '127.0.0.1']) {
      assert.equal(
        context.resolveApiBaseUrl({ hostname, port, origin: `http://${hostname}:${port}` }, null),
        `http://${hostname}:3000`,
        `${hostname}:${port}`
      );
    }
  }

  // A developer override is honoured on a local page.
  assert.equal(
    context.resolveApiBaseUrl(
      { hostname: 'localhost', port: '5501', origin: 'http://localhost:5501' },
      'http://localhost:4000/'
    ),
    'http://localhost:4000'
  );

  // On a real deployment an override may only ever name the page's own origin,
  // so a tampered value cannot redirect a visitor's API traffic elsewhere.
  assert.equal(context.resolveApiBaseUrl(hosted, 'https://attacker.example.test'), hosted.origin);
  assert.equal(context.resolveApiBaseUrl(hosted, hosted.origin), hosted.origin);

  // Malformed, credential-bearing and non-HTTP overrides are all rejected.
  for (const override of [
    'https://user:pass@api.example.test',
    'javascript:alert(1)',
    'ftp://api.example.test',
    'not a url',
    'https://api.example.test/path',
    'https://api.example.test/?k=v'
  ]) {
    assert.equal(
      context.resolveApiBaseUrl({ hostname: 'localhost', port: '5501', origin: 'http://localhost:5501' }, override),
      'http://localhost:3000',
      override
    );
  }

  assert.doesNotMatch(source, /onrender\.com|supabase\.co/i);
});

test('the API distinguishes failure kinds instead of showing one vague message', () => {
  const source = fs.readFileSync(frontendApiPath, 'utf8');

  for (const kind of [
    'NETWORK', 'TIMEOUT', 'CORS', 'INVALID_RESPONSE', 'SERVER',
    'DATABASE', 'AUTH', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'RATE_LIMITED'
  ]) {
    assert.match(source, new RegExp(`\\b${kind}\\b`), kind);
  }

  // Content type is checked before any parsing, so an HTML page returned where
  // JSON was expected is reported as an invalid response, not a parse crash.
  assert.match(source, /content-type/i);
  assert.match(source, /contentType\.includes\('application\/json'\)/);
  assert.match(source, /new AbortController\(\)/);
});

test('every response carries the explicit security headers and a strict CSP', async () => {
  for (const target of ['/', '/api/health', '/this-page-does-not-exist']) {
    const response = await fetch(`${baseUrl}${target}`);
    const csp = response.headers.get('content-security-policy');

    assert.ok(csp, `${target} sends a CSP`);
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /base-uri 'self'/);
    assert.match(csp, /form-action 'self'/);
    assert.doesNotMatch(csp, /unsafe-eval|unsafe-inline/);

    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.match(response.headers.get('permissions-policy'), /geolocation=\(\)/);
    assert.equal(response.headers.get('x-powered-by'), null);
    // HSTS belongs to HTTPS only; over plain local HTTP it must not appear.
    assert.equal(response.headers.get('strict-transport-security'), null);
  }

  const apiResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(apiResponse.headers.get('cache-control'), 'no-store');
});

test('oversized and malformed JSON bodies return the JSON envelope, not a stack trace', async () => {
  const tooLarge = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.test', password: 'x'.repeat(200000) })
  });
  const tooLargeBody = await tooLarge.json();
  assert.equal(tooLarge.status, 413);
  assert.equal(tooLargeBody.success, false);
  assert.match(tooLargeBody.message, /too large/i);

  const malformed = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"email": '
  });
  const malformedBody = await malformed.json();
  assert.equal(malformed.status, 400);
  assert.equal(malformedBody.success, false);
  assert.match(malformedBody.message, /not valid JSON/i);
  assert.equal(JSON.stringify(malformedBody).includes('at JSON.parse'), false);
});

test('robots, sitemap and security.txt describe only public pages', async () => {
  const robots = await fetch(`${baseUrl}/robots.txt`);
  const robotsBody = await robots.text();
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get('content-type'), /^text\/plain/);
  assert.match(robotsBody, /Disallow: \/api\//);
  assert.match(robotsBody, /Disallow: \/admin\.html/);
  assert.match(robotsBody, /Disallow: \/representative\.html/);
  assert.match(robotsBody, /Disallow: \/reset-password\.html/);
  assert.match(robotsBody, new RegExp(`Sitemap: ${baseUrl}/sitemap.xml`));

  const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
  const sitemapBody = await sitemap.text();
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get('content-type'), /xml/);
  assert.match(sitemapBody, new RegExp(`<loc>${baseUrl}/jobs.html</loc>`));
  for (const privatePage of ['admin.html', 'profile.html', 'my-applications.html', 'reset-password.html']) {
    assert.equal(sitemapBody.includes(privatePage), false, privatePage);
  }

  const security = await fetch(`${baseUrl}/.well-known/security.txt`);
  const securityBody = await security.text();
  assert.equal(security.status, 200);
  assert.match(securityBody, /independent BUET CSE academic project/i);
  assert.match(securityBody, /Expires: \d{4}-\d{2}-\d{2}T/);
  // With no SECURITY_CONTACT configured, no address is invented.
  assert.match(securityBody, /SECURITY_CONTACT/);
});

test('no API route can be turned into an open redirect', async () => {
  for (const target of [
    '/api/health?next=https://attacker.example.test',
    '/api?redirect=//attacker.example.test',
    '/this-page-does-not-exist?returnTo=https://attacker.example.test'
  ]) {
    const response = await fetch(`${baseUrl}${target}`, { redirect: 'manual' });
    assert.ok(response.status < 300 || response.status >= 400, target);
    assert.equal(response.headers.get('location'), null, target);
  }
});
