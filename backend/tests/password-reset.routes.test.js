const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const authService = require('../services/auth.service');
const app = require('../app');

const originals = {
  forgotPassword: authService.forgotPassword,
  resetPassword: authService.resetPassword
};
let server;
let baseUrl;

test.before(async () => {
  authService.forgotPassword = async () => ({ emailSent: true });
  authService.resetPassword = async () => ({ passwordReset: true });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  authService.forgotPassword = originals.forgotPassword;
  authService.resetPassword = originals.resetPassword;
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('forgot-password endpoint returns the standard safe response structure', async () => {
  const response = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'person@example.com' })
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.emailSent, true);
  assert.match(body.message, /spam or junk/);
});

test('reset-password endpoint never echoes the submitted token', async () => {
  const rawToken = 'route-token-that-must-never-be-returned';
  const response = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: rawToken, newPassword: 'changed1', confirmPassword: 'changed1' })
  });
  const responseText = await response.text();
  const body = JSON.parse(responseText);

  assert.equal(response.status, 200);
  assert.equal(body.data.passwordReset, true);
  assert.equal(responseText.includes(rawToken), false);
});
