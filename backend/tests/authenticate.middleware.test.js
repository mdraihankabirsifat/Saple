const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const authenticate = require('../middleware/authenticate');
const authConfig = require('../config/auth');
const userRepository = require('../repositories/user.repository');

const originalFindAuthorizationById = userRepository.findAuthorizationById;

test.afterEach(() => {
  userRepository.findAuthorizationById = originalFindAuthorizationById;
});

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('authentication middleware rejects a missing Bearer token with 401', async () => {
  const request = { get: () => undefined };
  const response = createResponse();
  let nextCalled = false;

  await authenticate(request, response, () => { nextCalled = true; });

  assert.equal(response.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('authentication middleware verifies JWT and attaches current database identity', async () => {
  process.env.JWT_SECRET = 'test-only-secret-that-is-long-enough-for-tests';
  const token = jwt.sign(
    { userId: 8, role: 'USER' },
    process.env.JWT_SECRET,
    {
      algorithm: authConfig.JWT_ALGORITHM,
      issuer: authConfig.JWT_ISSUER,
      audience: authConfig.JWT_AUDIENCE,
      expiresIn: '1h'
    }
  );
  const request = { get: () => `Bearer ${token}` };
  const response = createResponse();
  let nextCalled = false;
  userRepository.findAuthorizationById = async () => ({ accountRole: 'ADMIN', accountStatus: 'ACTIVE' });

  await authenticate(request, response, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.deepEqual(request.user, { userId: 8, role: 'ADMIN' });
  assert.equal(response.statusCode, null);
});

test('authentication middleware rejects a suspended account even with a valid JWT', async () => {
  process.env.JWT_SECRET = 'test-only-secret-that-is-long-enough-for-tests';
  const token = jwt.sign(
    { userId: 8, role: 'USER' },
    process.env.JWT_SECRET,
    {
      algorithm: authConfig.JWT_ALGORITHM,
      issuer: authConfig.JWT_ISSUER,
      audience: authConfig.JWT_AUDIENCE,
      expiresIn: '1h'
    }
  );
  userRepository.findAuthorizationById = async () => ({ accountRole: 'USER', accountStatus: 'SUSPENDED' });
  const response = createResponse();
  let nextCalled = false;

  await authenticate({ get: () => `Bearer ${token}` }, response, () => { nextCalled = true; });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.message, 'Authenticated account is unavailable');
  assert.equal(nextCalled, false);
});
