const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');

const app = require('../app');
const authConfig = require('../config/auth');
const userRepository = require('../repositories/user.repository');

const originals = {
  findAuthorizationById: userRepository.findAuthorizationById,
  incrementTokenVersion: userRepository.incrementTokenVersion,
  findSubmissionsByOwner: userRepository.findSubmissionsByOwner,
  findPrivateSubmissionById: userRepository.findPrivateSubmissionById,
  jwtSecret: process.env.JWT_SECRET
};

let server;
let baseUrl;
let tokenVersion = 0;

async function request(path, token, method = 'GET') {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` }
  });
  return { status: response.status, body: await response.json() };
}

test.before(async () => {
  process.env.JWT_SECRET = 'revocation-route-test-secret-with-local-entropy';
  userRepository.findAuthorizationById = async () => ({
    accountRole: 'USER',
    accountStatus: 'ACTIVE',
    tokenVersion
  });
  userRepository.incrementTokenVersion = async () => {
    tokenVersion += 1;
    return { tokenVersion };
  };
  userRepository.findSubmissionsByOwner = async (userId) => [{
    submissionId: 12,
    ownerUserId: userId,
    submissionType: 'SALARY',
    companyName: 'Test Company'
  }];
  userRepository.findPrivateSubmissionById = async (submissionId) => ({
    submissionId,
    ownerUserId: 8,
    submissionType: 'SALARY',
    companyName: 'Test Company'
  });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  Object.assign(userRepository, {
    findAuthorizationById: originals.findAuthorizationById,
    incrementTokenVersion: originals.incrementTokenVersion,
    findSubmissionsByOwner: originals.findSubmissionsByOwner,
    findPrivateSubmissionById: originals.findPrivateSubmissionById
  });
  if (originals.jwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originals.jwtSecret;
  if (server) await new Promise((resolve) => server.close(resolve));
});

function sign(userId) {
  return jwt.sign(
    { userId, role: 'USER', tokenVersion },
    process.env.JWT_SECRET,
    {
      algorithm: authConfig.JWT_ALGORITHM,
      issuer: authConfig.JWT_ISSUER,
      audience: authConfig.JWT_AUDIENCE,
      expiresIn: '5m'
    }
  );
}

test('logout invalidates the exact JWT that invoked it', async () => {
  const token = sign(8);
  const before = await request('/api/auth/me/submissions', token);
  assert.equal(before.status, 200);

  const logout = await request('/api/auth/logout', token, 'POST');
  assert.equal(logout.status, 200);

  const after = await request('/api/auth/me/submissions', token);
  assert.equal(after.status, 401);
  assert.equal(after.body.message, 'Authentication token has been revoked');
});

test('owner detail is 200 while another authenticated user receives 403', async () => {
  const ownerToken = sign(8);
  const otherToken = sign(9);

  const owned = await request('/api/auth/me/submissions/12', ownerToken);
  assert.equal(owned.status, 200);
  assert.equal('ownerUserId' in owned.body.data.submission, false);

  const forbidden = await request('/api/auth/me/submissions/12', otherToken);
  assert.equal(forbidden.status, 403);
});
