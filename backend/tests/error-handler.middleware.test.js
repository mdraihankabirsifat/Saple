const test = require('node:test');
const assert = require('node:assert/strict');
const errorHandler = require('../middleware/errorHandler');
const createHttpError = require('../utils/httpError');

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
  };
}

test('controlled service-unavailable errors preserve their safe message and status', () => {
  const response = createResponse();
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    errorHandler(
      createHttpError(503, 'We could not send the password-reset email. Please try again later.'),
      { method: 'POST', originalUrl: '/api/auth/forgot-password' },
      response,
      () => {}
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.success, false);
  assert.match(response.body.message, /could not send the password-reset email/);
});

test('unexpected exceptions remain generic and do not expose internal details', () => {
  const response = createResponse();
  const originalError = console.error;
  console.error = () => {};
  try {
    errorHandler(
      new Error('private Oracle or SMTP internals'),
      { method: 'POST', originalUrl: '/api/auth/forgot-password' },
      response,
      () => {}
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.message, 'An unexpected server error occurred');
  assert.equal(JSON.stringify(response.body).includes('private Oracle'), false);
});
