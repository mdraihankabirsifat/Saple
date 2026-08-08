const test = require('node:test');
const assert = require('node:assert/strict');
const { createPasswordResetRateLimit } = require('../middleware/passwordResetRateLimit');

test('password-reset request limiter normalizes email and rejects repeated requests', () => {
  const middleware = createPasswordResetRateLimit({ limit: 2, windowMs: 60000 });
  const messages = [];
  const response = {
    status(code) { this.statusCode = code; return this; },
    json(body) { messages.push({ status: this.statusCode, body }); return body; }
  };
  let nextCalls = 0;
  const next = () => { nextCalls += 1; };

  middleware({ ip: '127.0.0.1', body: { email: ' PERSON@example.com ' } }, response, next);
  middleware({ ip: '127.0.0.1', body: { email: 'person@example.com' } }, response, next);
  middleware({ ip: '127.0.0.1', body: { email: 'PERSON@EXAMPLE.COM' } }, response, next);

  assert.equal(nextCalls, 2);
  assert.equal(messages[0].status, 429);
  assert.equal(messages[0].body.success, false);
  assert.match(messages[0].body.message, /Too many password-reset requests/);
});
