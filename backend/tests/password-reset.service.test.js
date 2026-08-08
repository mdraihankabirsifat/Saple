const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const userRepository = require('../repositories/user.repository');
const passwordResetRepository = require('../repositories/password-reset.repository');
const mailService = require('../services/mail.service');
const authService = require('../services/auth.service');

const originals = {
  findUserByEmail: userRepository.findUserByEmail,
  findUserForPasswordResetByEmail: userRepository.findUserForPasswordResetByEmail,
  createTokenWithDelivery: passwordResetRepository.createTokenWithDelivery,
  consumeTokenAndUpdatePassword: passwordResetRepository.consumeTokenAndUpdatePassword,
  sendPasswordResetEmail: mailService.sendPasswordResetEmail,
  frontendUrl: process.env.FRONTEND_URL,
  ttl: process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES,
  jwtSecret: process.env.JWT_SECRET
};

test.beforeEach(() => {
  process.env.FRONTEND_URL = 'http://localhost:5500/';
  process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES = '15';
});

test.afterEach(() => {
  userRepository.findUserForPasswordResetByEmail = originals.findUserForPasswordResetByEmail;
  userRepository.findUserByEmail = originals.findUserByEmail;
  passwordResetRepository.createTokenWithDelivery = originals.createTokenWithDelivery;
  passwordResetRepository.consumeTokenAndUpdatePassword = originals.consumeTokenAndUpdatePassword;
  mailService.sendPasswordResetEmail = originals.sendPasswordResetEmail;
  if (originals.frontendUrl === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = originals.frontendUrl;
  if (originals.ttl === undefined) delete process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES;
  else process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES = originals.ttl;
  if (originals.jwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originals.jwtSecret;
});

test('forgot password normalizes email, stores only a hash, and sends a temporary raw-token link', async () => {
  let stored;
  let delivery;
  userRepository.findUserForPasswordResetByEmail = async (email) => {
    assert.equal(email, 'person@example.com');
    return { userId: 8, fullName: 'Test Person', email, accountStatus: 'ACTIVE' };
  };
  mailService.sendPasswordResetEmail = async (input) => { delivery = input; };
  passwordResetRepository.createTokenWithDelivery = async (input) => {
    stored = input;
    await input.deliver();
  };

  const result = await authService.forgotPassword({ email: ' PERSON@example.com ' });
  const rawToken = new URL(delivery.resetUrl).searchParams.get('token');

  assert.deepEqual(result, { emailSent: true });
  assert.match(stored.tokenHash, /^[a-f0-9]{64}$/);
  assert.ok(rawToken.length >= 40);
  assert.notEqual(stored.tokenHash, rawToken);
  assert.equal(JSON.stringify(result).includes(rawToken), false);
  assert.equal(delivery.expiresMinutes, 15);
  assert.equal(stored.expiresMinutes, 15);
});

test('forgot password rejects unknown and unavailable accounts with controlled messages', async () => {
  userRepository.findUserForPasswordResetByEmail = async () => null;
  await assert.rejects(
    authService.forgotPassword({ email: 'missing@example.com' }),
    (error) => error.statusCode === 404
      && error.message === 'No account was found with that email address.'
  );

  userRepository.findUserForPasswordResetByEmail = async () => ({ accountStatus: 'DEACTIVATED' });
  await assert.rejects(
    authService.forgotPassword({ email: 'person@example.com' }),
    (error) => error.statusCode === 403 && /deactivated/i.test(error.message)
  );
});

test('SMTP failure becomes a controlled recovery-only error', async () => {
  userRepository.findUserForPasswordResetByEmail = async (email) => ({
    userId: 8, fullName: 'Test Person', email, accountStatus: 'ACTIVE'
  });
  mailService.sendPasswordResetEmail = async () => { throw new Error('private SMTP detail'); };
  passwordResetRepository.createTokenWithDelivery = async ({ deliver }) => deliver();

  await assert.rejects(
    authService.forgotPassword({ email: 'person@example.com' }),
    (error) => error.statusCode === 503
      && error.message === 'We could not send the password-reset email. Please try again later.'
  );
});

test('valid reset hashes the raw token and sends only a BCrypt password hash to the repository', async () => {
  const rawToken = 'abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ-1234567890';
  let repositoryInput;
  passwordResetRepository.consumeTokenAndUpdatePassword = async (input) => {
    repositoryInput = input;
    return { userId: 8, passwordReset: true };
  };

  const result = await authService.resetPassword({
    token: rawToken,
    newPassword: 'changed1',
    confirmPassword: 'changed1'
  });

  assert.deepEqual(result, { passwordReset: true });
  assert.match(repositoryInput.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(repositoryInput.tokenHash, rawToken);
  assert.notEqual(repositoryInput.passwordHash, 'changed1');
  assert.equal(await bcrypt.compare('changed1', repositoryInput.passwordHash), true);
});

test('after a reset the old password fails and the new password creates a JWT', async () => {
  const rawToken = 'abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ-1234567890';
  let storedHash = await bcrypt.hash('original1', 4);
  process.env.JWT_SECRET = 'password-reset-test-jwt-secret-with-local-entropy';
  passwordResetRepository.consumeTokenAndUpdatePassword = async ({ passwordHash }) => {
    storedHash = passwordHash;
    return { userId: 8, passwordReset: true };
  };
  userRepository.findUserByEmail = async () => ({
    userId: 8,
    fullName: 'Test Person',
    email: 'person@example.com',
    passwordHash: storedHash,
    userType: 'NORMAL',
    accountRole: 'USER',
    accountStatus: 'ACTIVE',
    employmentStatus: null
  });

  await authService.resetPassword({
    token: rawToken,
    newPassword: 'replacement1',
    confirmPassword: 'replacement1'
  });
  await assert.rejects(
    authService.login({ email: 'person@example.com', password: 'original1' }),
    (error) => error.statusCode === 401 && error.message === 'Incorrect password.'
  );
  const login = await authService.login({ email: 'person@example.com', password: 'replacement1' });
  assert.equal(typeof login.token, 'string');
});

test('reset rejects mismatch and weak passwords before touching Oracle', async () => {
  let calls = 0;
  passwordResetRepository.consumeTokenAndUpdatePassword = async () => { calls += 1; };
  const token = 'abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ-1234567890';

  await assert.rejects(
    authService.resetPassword({ token, newPassword: 'changed1', confirmPassword: 'changed2' }),
    (error) => error.statusCode === 400 && /do not match/.test(error.message)
  );
  await assert.rejects(
    authService.resetPassword({ token, newPassword: 'password', confirmPassword: 'password' }),
    (error) => error.statusCode === 400 && /letter and a number/.test(error.message)
  );
  assert.equal(calls, 0);
});

for (const [code, statusCode, message] of [
  ['INVALID_TOKEN', 400, 'invalid'],
  ['EXPIRED_TOKEN', 410, 'expired'],
  ['USED_TOKEN', 409, 'already been used']
]) {
  test(`${code.toLowerCase()} is returned as a controlled reset-link error`, async () => {
    passwordResetRepository.consumeTokenAndUpdatePassword = async () => {
      const error = new Error(code);
      error.sapleCode = code;
      throw error;
    };

    await assert.rejects(
      authService.resetPassword({
        token: 'abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ-1234567890',
        newPassword: 'changed1',
        confirmPassword: 'changed1'
      }),
      (error) => error.statusCode === statusCode && error.message.includes(message)
    );
  });
}
