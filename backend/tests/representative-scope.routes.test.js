const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');

const userRepository = require('../repositories/user.repository');
const representativeRepository = require('../repositories/representative.repository');
const jobRepository = require('../repositories/job.repository');
const applicationRepository = require('../repositories/application.repository');
const verificationRepository = require('../repositories/verification.repository');
const authorization = require('../utils/authorization');
const requireCompanyRepresentative = require('../middleware/requireCompanyRepresentative');
const jobService = require('../services/job.service');
const applicationService = require('../services/application.service');
const authConfig = require('../config/auth');
const app = require('../app');

const originals = {
  findAuthorizationById: userRepository.findAuthorizationById,
  findActiveScopesByUserId: representativeRepository.findActiveScopesByUserId,
  findJobScope: jobRepository.findJobScope,
  findManagedJobs: jobRepository.findManagedJobs,
  countManagedJobs: jobRepository.countManagedJobs,
  findManagedJobById: jobRepository.findManagedJobById,
  findApplicationScope: applicationRepository.findApplicationScope,
  findApplicationsForScope: applicationRepository.findApplicationsForScope,
  countApplicationsForScope: applicationRepository.countApplicationsForScope,
  findVerificationScope: verificationRepository.findVerificationScope,
  jwtSecret: process.env.JWT_SECRET
};

// Company 1 belongs to the representative under test. Company 2 never does.
const REPRESENTATIVE_SCOPES = [
  { assignmentId: 1, companyId: 1, companyName: 'Alpha Ltd', jobTitle: 'People Lead', approvedAt: new Date() }
];

let server;
let baseUrl;
let account = { accountRole: 'COMPANY_REPRESENTATIVE', accountStatus: 'ACTIVE', tokenVersion: 0 };
let scopes = REPRESENTATIVE_SCOPES;

function signToken(role, userId = 30) {
  return jwt.sign({ userId, role, tokenVersion: 0 }, process.env.JWT_SECRET, {
    algorithm: authConfig.JWT_ALGORITHM,
    issuer: authConfig.JWT_ISSUER,
    audience: authConfig.JWT_AUDIENCE,
    expiresIn: '5m'
  });
}

test.before(async () => {
  process.env.JWT_SECRET = 'scope-test-secret-with-sufficient-local-entropy-only';
  userRepository.findAuthorizationById = async () => account;
  representativeRepository.findActiveScopesByUserId = async () => scopes;

  // Job 11 belongs to company 1; job 22 belongs to company 2.
  jobRepository.findJobScope = async (jobId) => ({
    jobId,
    companyId: Number(jobId) === 22 ? 2 : 1,
    jobStatus: 'PUBLISHED',
    applicationDeadline: '2099-01-01'
  });
  jobRepository.findManagedJobById = async (jobId) => ({ jobId, companyId: 1, title: 'Job' });
  jobRepository.findManagedJobs = async (filters) => {
    jobRepository.lastFilters = filters;
    return [];
  };
  jobRepository.countManagedJobs = async () => 0;

  // Application 101 belongs to company 1; application 202 to company 2.
  applicationRepository.findApplicationScope = async (applicationId) => ({
    applicationId,
    jobId: 11,
    applicantUserId: 99,
    applicationStatus: 'SUBMITTED',
    companyId: Number(applicationId) === 202 ? 2 : 1
  });
  applicationRepository.findApplicationsForScope = async (filters) => {
    applicationRepository.lastFilters = filters;
    return [];
  };
  applicationRepository.countApplicationsForScope = async () => 0;

  verificationRepository.findVerificationScope = async (verificationId) => ({
    verificationId,
    companyId: Number(verificationId) === 202 ? 2 : 1,
    verificationStatus: 'PENDING'
  });

  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  for (const [key, value] of Object.entries(originals)) {
    if (key === 'jwtSecret') continue;
    const target = key in userRepository ? userRepository
      : key in representativeRepository ? representativeRepository
        : key in jobRepository ? jobRepository
          : key in applicationRepository ? applicationRepository
            : verificationRepository;
    target[key] = value;
  }
  if (originals.jwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originals.jwtSecret;
  if (server) await new Promise((resolve) => server.close(resolve));
});

test.beforeEach(() => {
  account = { accountRole: 'COMPANY_REPRESENTATIVE', accountStatus: 'ACTIVE', tokenVersion: 0 };
  scopes = REPRESENTATIVE_SCOPES;
});

test('the scope helper separates administrator oversight from representative scope', () => {
  const representative = { role: 'COMPANY_REPRESENTATIVE', representativeCompanyIds: [1] };
  const admin = { role: 'ADMIN', representativeCompanyIds: [] };
  const user = { role: 'USER', representativeCompanyIds: [] };

  assert.equal(authorization.assertCompanyScope(representative, 1), 'COMPANY_REPRESENTATIVE');
  assert.equal(authorization.assertCompanyScope(representative, '1'), 'COMPANY_REPRESENTATIVE');
  assert.equal(authorization.assertCompanyScope(admin, 2), 'ADMIN');

  // The message must be identical for "not a representative" and "wrong
  // company", so a caller cannot map which companies an account represents.
  const capture = (candidate, companyId) => {
    try {
      authorization.assertCompanyScope(candidate, companyId);
    } catch (error) {
      return error;
    }
    throw new Error('expected the scope check to refuse');
  };
  const wrongCompany = capture(representative, 2);
  const notRepresentative = capture(user, 1);
  assert.equal(wrongCompany.statusCode, 403);
  assert.equal(notRepresentative.statusCode, 403);
  assert.equal(wrongCompany.message, notRepresentative.message);
});

test('requireCompanyRepresentative refuses a role without any active assignment', () => {
  const captured = [];
  const response = {
    status(code) { captured.push(code); return this; },
    json(body) { captured.push(body); return this; }
  };

  let continued = false;
  requireCompanyRepresentative(
    { user: { role: 'COMPANY_REPRESENTATIVE', representativeCompanyIds: [1] } },
    response,
    () => { continued = true; }
  );
  assert.equal(continued, true);

  // A revoked account can still hold the role for as long as its row says so;
  // an empty scope list is what actually closes the workspace.
  requireCompanyRepresentative(
    { user: { role: 'COMPANY_REPRESENTATIVE', representativeCompanyIds: [] } },
    response,
    () => { throw new Error('must not continue'); }
  );
  assert.equal(captured[0], 403);
  assert.match(captured[1].message, /No active company assignment/);

  requireCompanyRepresentative(
    { user: { role: 'USER', representativeCompanyIds: [] } },
    response,
    () => { throw new Error('must not continue'); }
  );
  assert.equal(captured[2], 403);
});

test('representative A cannot read, edit or decide anything owned by company B', async () => {
  const token = signToken('COMPANY_REPRESENTATIVE');
  const headers = { Authorization: `Bearer ${token}` };

  const outOfScope = [
    ['GET', '/api/representative/jobs/22'],
    ['PUT', '/api/representative/jobs/22'],
    ['PATCH', '/api/representative/jobs/22/status'],
    ['POST', '/api/representative/companies/2/jobs'],
    ['GET', '/api/representative/applications/202'],
    ['PATCH', '/api/representative/applications/202/status'],
    ['GET', '/api/representative/verifications/202'],
    ['PATCH', '/api/representative/verifications/202/status']
  ];

  for (const [method, path] of outOfScope) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify({})
    });
    const body = await response.json();
    assert.equal(response.status, 403, `${method} ${path}`);
    assert.equal(body.success, false);
    assert.match(body.message, /do not have access to this company workspace/);
  }

  // The same routes inside the assigned company do not fail with 403.
  const inScope = await fetch(`${baseUrl}/api/representative/jobs/11`, { headers });
  assert.notEqual(inScope.status, 403);
});

test('a list request is silently confined to the assigned companies', async () => {
  const token = signToken('COMPANY_REPRESENTATIVE');

  await fetch(`${baseUrl}/api/representative/jobs`, { headers: { Authorization: `Bearer ${token}` } });
  assert.deepEqual(jobRepository.lastFilters.companyIds, [1]);

  await fetch(`${baseUrl}/api/representative/applications`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.deepEqual(applicationRepository.lastFilters.companyIds, [1]);
});

test('a revoked assignment closes the workspace on the very next request', async () => {
  const token = signToken('COMPANY_REPRESENTATIVE');

  const before = await fetch(`${baseUrl}/api/representative/workspace`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(before.status, 200);

  // The JWT is unchanged and still inside its lifetime; only PostgreSQL moved.
  scopes = [];
  const after = await fetch(`${baseUrl}/api/representative/workspace`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await after.json();
  assert.equal(after.status, 403);
  assert.match(body.message, /No active company assignment/);
});

test('a normal account cannot reach any representative or admin endpoint', async () => {
  account = { accountRole: 'USER', accountStatus: 'ACTIVE', tokenVersion: 0 };
  scopes = [];
  const token = signToken('USER');

  for (const path of [
    '/api/representative/workspace',
    '/api/representative/jobs',
    '/api/representative/applications',
    '/api/representative/verifications',
    '/api/admin/submissions/pending',
    '/api/admin/representative-assignments',
    '/api/admin/announcements'
  ]) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(response.status, 403, path);
  }
});

test('an unauthenticated caller reaches no private endpoint', async () => {
  for (const path of [
    '/api/me/applications',
    '/api/me/notifications',
    '/api/me/notifications/unread-count',
    '/api/me/representative-assignments',
    '/api/representative/workspace',
    '/api/admin/representative-assignments'
  ]) {
    const response = await fetch(`${baseUrl}${path}`);
    const body = await response.json();
    assert.equal(response.status, 401, path);
    assert.equal(body.success, false);
  }
});

test('an administrator is not confined to a company but is still not a representative', async () => {
  account = { accountRole: 'ADMIN', accountStatus: 'ACTIVE', tokenVersion: 0 };
  scopes = [];
  const adminUser = { role: 'ADMIN', userId: 6, representativeCompanyIds: [] };

  await jobService.listManagedJobs(adminUser, {});
  assert.equal(jobRepository.lastFilters.companyIds, null);

  await applicationService.listScopedApplications(adminUser, {});
  assert.equal(applicationRepository.lastFilters.companyIds, null);

  // Oversight is a separate power: the representative workspace itself stays
  // closed to an administrator, because they hold no company assignment.
  const token = signToken('ADMIN', 6);
  const response = await fetch(`${baseUrl}/api/representative/workspace`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(response.status, 403);
});

test('public registration can never produce an ADMIN or representative account', () => {
  const authService = require('../services/auth.service');
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'repositories', 'user.repository.js'),
    'utf8'
  );

  // The registration insert hard-codes the role; nothing from the request body
  // reaches account_role.
  assert.match(source, /INSERT INTO users \(full_name, email, password_hash, user_type, account_role, account_status\)\s*\n\s*VALUES \(\$1, \$2, \$3, \$4, 'USER', 'ACTIVE'\)/);
  assert.equal(typeof authService.register, 'function');
});
