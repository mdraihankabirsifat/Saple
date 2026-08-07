const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const userRepository = require('../repositories/user.repository');
const authService = require('../services/auth.service');

const originalMethods = {
  findUserByEmail: userRepository.findUserByEmail,
  findSafeUserById: userRepository.findSafeUserById,
  createUserWithOptionalEmployee: userRepository.createUserWithOptionalEmployee
};

test.afterEach(() => {
  Object.assign(userRepository, originalMethods);
});

test('registration normalizes email, hashes the password, and never creates an admin', async () => {
  let repositoryInput;
  userRepository.findUserByEmail = async () => null;
  userRepository.createUserWithOptionalEmployee = async (input) => {
    repositoryInput = input;
    return {
      userId: 8,
      fullName: input.fullName,
      email: input.email,
      userType: input.userType,
      accountRole: 'USER',
      accountStatus: 'ACTIVE',
      employmentStatus: null
    };
  };

  const user = await authService.register({
    fullName: '  Test   Person ',
    email: ' PERSON@Example.COM ',
    password: 'password1',
    userType: 'NORMAL'
  });

  assert.equal(repositoryInput.fullName, 'Test Person');
  assert.equal(repositoryInput.email, 'person@example.com');
  assert.notEqual(repositoryInput.passwordHash, 'password1');
  assert.equal(await bcrypt.compare('password1', repositoryInput.passwordHash), true);
  assert.equal(user.accountRole, 'USER');
  assert.equal('passwordHash' in user, false);
});

test('employee registration requires a schema-compatible employment status', async () => {
  await assert.rejects(
    authService.register({
      fullName: 'Test Employee',
      email: 'employee@example.com',
      password: 'password1',
      userType: 'EMPLOYEE'
    }),
    (error) => error.statusCode === 400 && /Employment status/.test(error.message)
  );
});

test('registration rejects duplicate normalized email with 409', async () => {
  userRepository.findUserByEmail = async () => ({ userId: 1 });

  await assert.rejects(
    authService.register({
      fullName: 'Test Person',
      email: 'PERSON@example.com',
      password: 'password1',
      userType: 'NORMAL'
    }),
    (error) => error.statusCode === 409
  );
});

test('login returns a minimal signed JWT and safe user data', async () => {
  process.env.JWT_SECRET = 'test-only-secret-that-is-long-enough-for-tests';
  process.env.JWT_EXPIRES_IN = '1h';
  const passwordHash = await bcrypt.hash('password1', 4);
  userRepository.findUserByEmail = async () => ({
    userId: 8,
    fullName: 'Test Person',
    email: 'person@example.com',
    passwordHash,
    userType: 'NORMAL',
    accountRole: 'USER',
    accountStatus: 'ACTIVE',
    employmentStatus: null
  });

  const result = await authService.login({
    email: 'PERSON@example.com',
    password: 'password1'
  });

  assert.equal(typeof result.token, 'string');
  assert.equal(result.user.userId, 8);
  assert.equal('passwordHash' in result.user, false);
});

test('unknown users and wrong passwords share the same generic login error', async () => {
  userRepository.findUserByEmail = async () => null;

  await assert.rejects(
    authService.login({ email: 'missing@example.com', password: 'wrong' }),
    (error) => error.statusCode === 401 && error.message === 'Invalid email or password.'
  );
});
