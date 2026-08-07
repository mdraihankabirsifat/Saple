const test = require('node:test');
const assert = require('node:assert/strict');
const requireAdmin = require('../middleware/requireAdmin');

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

test('ADMIN role continues to the protected handler', () => {
  let continued = false;
  const response = createResponse();

  requireAdmin({ user: { userId: 6, role: 'ADMIN' } }, response, () => {
    continued = true;
  });

  assert.equal(continued, true);
  assert.equal(response.statusCode, null);
});

test('authenticated USER role receives 403', () => {
  let continued = false;
  const response = createResponse();

  requireAdmin({ user: { userId: 8, role: 'USER' } }, response, () => {
    continued = true;
  });

  assert.equal(continued, false);
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.message, 'Administrator access is required');
});
