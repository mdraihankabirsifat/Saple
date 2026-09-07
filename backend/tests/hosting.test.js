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
  const functionStart = source.indexOf('function normalizeApiBaseUrl');
  const functionEnd = source.indexOf('const API_BASE_URL');
  assert.ok(functionStart >= 0 && functionEnd > functionStart);

  const context = { URL };
  vm.createContext(context);
  vm.runInContext(
    `${source.slice(functionStart, functionEnd)}\nthis.resolveApiBaseUrl = resolveApiBaseUrl;`,
    context
  );

  const hostedLocation = {
    hostname: 'saple.example.test', port: '', origin: 'https://saple.example.test'
  };
  const localLocation = {
    hostname: 'localhost', port: '5500', origin: 'http://localhost:5500'
  };
  const loopbackLocation = {
    hostname: '127.0.0.1', port: '5500', origin: 'http://127.0.0.1:5500'
  };

  assert.equal(context.resolveApiBaseUrl(hostedLocation, null), hostedLocation.origin);
  assert.equal(context.resolveApiBaseUrl(localLocation, null), 'http://localhost:3000');
  assert.equal(context.resolveApiBaseUrl(loopbackLocation, null), 'http://127.0.0.1:3000');
  assert.equal(
    context.resolveApiBaseUrl(hostedLocation, 'https://api.example.test/'),
    'https://api.example.test'
  );
  assert.equal(
    context.resolveApiBaseUrl(hostedLocation, 'https://user:pass@api.example.test'),
    hostedLocation.origin
  );
  assert.doesNotMatch(source, /onrender\.com|supabase\.co/i);
});
