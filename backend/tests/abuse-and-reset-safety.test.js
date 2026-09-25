const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');

const mailConfig = require('../config/mail');
const authService = require('../services/auth.service');
const userRepository = require('../repositories/user.repository');
const passwordResetRepository = require('../repositories/password-reset.repository');
const verificationRepository = require('../repositories/verification.repository');
const mailService = require('../services/mail.service');
const requireVerifiedEmployee = require('../middleware/requireVerifiedEmployee');
const authRoutes = require('../routes/auth.routes');
const app = require('../app');

const saved = {
  FRONTEND_URL: process.env.FRONTEND_URL,
  RENDER: process.env.RENDER,
  findUserForPasswordResetByEmail: userRepository.findUserForPasswordResetByEmail,
  findUserByEmail: userRepository.findUserByEmail,
  createTokenWithDelivery: passwordResetRepository.createTokenWithDelivery,
  sendPasswordResetEmail: mailService.sendPasswordResetEmail,
  findActiveVerifiedEmployment: verificationRepository.findActiveVerifiedEmployment
};

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  for (const name of ['FRONTEND_URL', 'RENDER']) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  userRepository.findUserForPasswordResetByEmail = saved.findUserForPasswordResetByEmail;
  userRepository.findUserByEmail = saved.findUserByEmail;
  passwordResetRepository.createTokenWithDelivery = saved.createTokenWithDelivery;
  mailService.sendPasswordResetEmail = saved.sendPasswordResetEmail;
  verificationRepository.findActiveVerifiedEmployment = saved.findActiveVerifiedEmployment;
  if (server) await new Promise((resolve) => server.close(resolve));
});

// ---------------------------------------------------------------------------
// Reset links come only from one validated origin
// ---------------------------------------------------------------------------

test('the reset link base must be a credential-free HTTP(S) URL', () => {
  delete process.env.RENDER;

  process.env.FRONTEND_URL = 'https://saple.example.test/app';
  assert.equal(mailConfig.getFrontendUrl(), 'https://saple.example.test/app/');

  // Query strings and fragments are stripped, never carried into the link.
  process.env.FRONTEND_URL = 'https://saple.example.test/?next=https://attacker.test#x';
  assert.equal(mailConfig.getFrontendUrl(), 'https://saple.example.test/');

  for (const value of [
    'https://user:secret@saple.example.test',
    'javascript:alert(1)',
    'ftp://saple.example.test',
    'not a url'
  ]) {
    process.env.FRONTEND_URL = value;
    assert.throws(() => mailConfig.getFrontendUrl(), /FRONTEND_URL/, value);
  }

  delete process.env.FRONTEND_URL;
  assert.throws(() => mailConfig.getFrontendUrl(), /FRONTEND_URL is required/);
});

// Synthetic mailer settings, assembled at run time. Recovery checks that
// delivery is configured before it looks an account up.
const syntheticSmtp = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_USER: ['synthetic', 'smtp', 'login'].join('-'),
  SMTP_PASS: ['synthetic', 'smtp', 'value'].join('-'),
  SMTP_FROM: 'Saple <no-reply@example.test>'
};

test('the emailed link points at reset-password.html on the configured origin only', async () => {
  delete process.env.RENDER;
  process.env.FRONTEND_URL = 'https://saple.example.test/';
  Object.assign(process.env, syntheticSmtp);
  let delivered;
  userRepository.findUserForPasswordResetByEmail = async (email) => ({
    userId: 8, fullName: 'Test Person', email, accountStatus: 'ACTIVE'
  });
  mailService.sendPasswordResetEmail = async (input) => { delivered = input; };
  passwordResetRepository.createTokenWithDelivery = async ({ deliver }) => deliver();

  await authService.forgotPassword({ email: 'person@example.com' });

  const link = new URL(delivered.resetUrl);
  assert.equal(link.origin, 'https://saple.example.test');
  assert.equal(link.pathname, '/reset-password.html');
  assert.deepEqual([...link.searchParams.keys()], ['token']);
});

test('a misconfigured FRONTEND_URL disables recovery with a controlled 503', async () => {
  delete process.env.RENDER;
  process.env.FRONTEND_URL = 'https://user:secret@saple.example.test';
  let lookups = 0;
  userRepository.findUserForPasswordResetByEmail = async () => { lookups += 1; return null; };

  await assert.rejects(
    authService.forgotPassword({ email: 'person@example.com' }),
    (error) => error.statusCode === 503 && !/secret/.test(error.message)
  );
  // Configuration is checked before any account lookup.
  assert.equal(lookups, 0);
});

// ---------------------------------------------------------------------------
// Verified-employee scope under the new request.user shape
// ---------------------------------------------------------------------------

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('contribution scope is the exact company and role, whatever the account role', async () => {
  const calls = [];
  verificationRepository.findActiveVerifiedEmployment = async (userId, companyId, roleId) => {
    calls.push([userId, companyId, roleId]);
    return companyId === 1 && roleId === 2 ? { verificationId: 5, companyId: 1, roleId: 2 } : null;
  };

  const user = { userId: 42, role: 'USER', representativeScopes: [], representativeCompanyIds: [] };

  const allowed = { params: { companyId: '1' }, body: { roleId: '2' }, user };
  let continued = false;
  await requireVerifiedEmployee(allowed, responseRecorder(), () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(allowed.verifiedEmployment.verificationId, 5);

  const wrongRole = responseRecorder();
  await requireVerifiedEmployee({ params: { companyId: '1' }, body: { roleId: '3' }, user }, wrongRole, () => {
    throw new Error('must not continue');
  });
  assert.equal(wrongRole.statusCode, 403);

  // A representative scope for company 1 is not an employee verification.
  const representative = {
    userId: 43,
    role: 'COMPANY_REPRESENTATIVE',
    representativeScopes: [{ companyId: 1 }],
    representativeCompanyIds: [1]
  };
  const repResponse = responseRecorder();
  await requireVerifiedEmployee(
    { params: { companyId: '1' }, body: { roleId: '9' }, user: representative },
    repResponse,
    () => { throw new Error('must not continue'); }
  );
  assert.equal(repResponse.statusCode, 403);

  // The identity checked is always the authenticated one.
  assert.deepEqual(calls.map((call) => call[0]), [42, 42, 43]);

  const invalid = responseRecorder();
  await requireVerifiedEmployee({ params: { companyId: 'abc' }, body: { roleId: '2' }, user }, invalid, () => {});
  assert.equal(invalid.statusCode, 400);
});

// ---------------------------------------------------------------------------
// Rate limits on the account endpoints
// ---------------------------------------------------------------------------

test('sign-in is rate-limited per address and email with a safe 429', async () => {
  authRoutes.loginRateLimit.reset();
  userRepository.findUserByEmail = async () => null;

  const statuses = [];
  let limitedBody;
  let retryAfter;
  for (let attempt = 0; attempt < 21; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'target@example.com', password: 'wrong-password-1' })
    });
    statuses.push(response.status);
    if (response.status === 429) {
      limitedBody = await response.json();
      retryAfter = response.headers.get('retry-after');
    } else {
      await response.text();
    }
  }

  assert.equal(statuses.slice(0, 20).includes(429), false);
  assert.equal(statuses[20], 429);
  assert.equal(limitedBody.success, false);
  assert.match(limitedBody.message, /Too many sign-in attempts/);
  assert.ok(Number(retryAfter) > 0);

  // A different address from the same network keeps its own allowance.
  const other = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'someone-else@example.com', password: 'wrong-password-1' })
  });
  await other.text();
  assert.notEqual(other.status, 429);
  authRoutes.loginRateLimit.reset();
});

test('every write-heavy public endpoint has its own limiter', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

  assert.match(read('routes/auth.routes.js'), /router\.post\('\/register', registerRateLimit/);
  assert.match(read('routes/auth.routes.js'), /router\.post\('\/login', loginRateLimit/);
  assert.match(read('routes/auth.routes.js'), /forgot-password', passwordResetRateLimit/);
  assert.match(read('routes/auth.routes.js'), /reset-password', createPasswordResetRateLimit/);
  assert.match(read('routes/report.routes.js'), /authenticate, reportRateLimit/);
  assert.match(read('routes/verification.routes.js'), /authenticate,\s*\n\s*verificationRateLimit/);
  assert.match(read('routes/job.routes.js'), /authenticate, applyRateLimit/);
  assert.match(read('routes/me.routes.js'), /representativeRequestRateLimit/);
  assert.match(read('routes/ai.routes.js'), /guideRateLimit, aiController\.ask/);
});
