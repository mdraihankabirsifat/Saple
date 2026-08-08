const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/user.repository');
const authService = require('../services/auth.service');

const originalMethods = {
  findUserByEmail: userRepository.findUserByEmail,
  findSafeUserById: userRepository.findSafeUserById,
  findAuthorizationById: userRepository.findAuthorizationById,
  findActiveVerifiedScopesByUserId: userRepository.findActiveVerifiedScopesByUserId,
  createUserWithOptionalEmployee: userRepository.createUserWithOptionalEmployee,
  updateFullName: userRepository.updateFullName,
  findPasswordHashById: userRepository.findPasswordHashById,
  updatePasswordHash: userRepository.updatePasswordHash
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

test('login returns a minimal signed JWT with existing ADMIN role behavior and safe user data', async () => {
  process.env.JWT_SECRET = 'test-only-secret-that-is-long-enough-for-tests';
  process.env.JWT_EXPIRES_IN = '1h';
  const passwordHash = await bcrypt.hash('password1', 4);
  userRepository.findUserByEmail = async () => ({
    userId: 8,
    fullName: 'Test Person',
    email: 'person@example.com',
    passwordHash,
    userType: 'NORMAL',
    accountRole: 'ADMIN',
    accountStatus: 'ACTIVE',
    employmentStatus: null
  });

  const result = await authService.login({
    email: 'PERSON@example.com',
    password: 'password1'
  });

  assert.equal(typeof result.token, 'string');
  assert.equal(result.user.userId, 8);
  assert.equal(result.user.accountRole, 'ADMIN');
  assert.equal(jwt.decode(result.token).role, 'ADMIN');
  assert.equal('passwordHash' in result.user, false);
});

test('login distinguishes an unknown normalized email from an incorrect password', async () => {
  userRepository.findUserByEmail = async () => null;

  await assert.rejects(
    authService.login({ email: ' MISSING@example.com ', password: 'wrong' }),
    (error) => error.statusCode === 401
      && error.message === 'No account was found with that email address.'
  );

  userRepository.findUserByEmail = async () => ({
    userId: 8,
    passwordHash: await bcrypt.hash('correct1', 4),
    accountStatus: 'ACTIVE'
  });
  await assert.rejects(
    authService.login({ email: 'person@example.com', password: 'wrong1' }),
    (error) => error.statusCode === 401 && error.message === 'Incorrect password.'
  );
});

test('login returns a controlled account-status message after valid credentials', async () => {
  userRepository.findUserByEmail = async () => ({
    userId: 8,
    passwordHash: await bcrypt.hash('correct1', 4),
    accountStatus: 'SUSPENDED'
  });

  await assert.rejects(
    authService.login({ email: 'person@example.com', password: 'correct1' }),
    (error) => error.statusCode === 403 && /account is suspended/i.test(error.message)
  );
});

test('auth/me rejects suspended accounts and never returns a password hash', async () => {
  userRepository.findSafeUserById = async () => ({
    userId: 8,
    accountStatus: 'SUSPENDED',
    passwordHash: 'must-not-leak'
  });
  await assert.rejects(
    authService.getCurrentUser(8),
    (error) => error.statusCode === 401
  );

  userRepository.findSafeUserById = async () => ({
    userId: 8, fullName: 'Safe User', email: 'safe@example.test', userType: 'NORMAL',
    accountRole: 'USER', accountStatus: 'ACTIVE', employmentStatus: null
  });
  const user = await authService.getCurrentUser(8);
  assert.equal('passwordHash' in user, false);
});

test('auth/me exposes only safe active company-role verification scopes', async () => {
  userRepository.findSafeUserById = async () => ({
    userId: 8, fullName: 'Scoped Employee', email: 'scoped@example.test', userType: 'EMPLOYEE',
    accountRole: 'USER', accountStatus: 'ACTIVE', employmentStatus: 'CURRENT'
  });
  userRepository.findActiveVerifiedScopesByUserId = async () => [{
    companyId: 1, companyName: 'Chaldal', roleId: 12, roleName: 'Data Engineer',
    expiresAt: new Date('2030-01-01T00:00:00Z')
  }];
  const user = await authService.getCurrentUser(8);
  assert.deepEqual(Object.keys(user.verifiedScopes[0]).sort(), [
    'companyId', 'companyName', 'expiresAt', 'roleId', 'roleName'
  ]);
  assert.equal('employeeId' in user.verifiedScopes[0], false);
  assert.equal('companyEmail' in user.verifiedScopes[0], false);
  assert.equal('proofReference' in user.verifiedScopes[0], false);
});

test('profile update permits only a normalized full name', async () => {
  let updatedName;
  userRepository.updateFullName = async (userId, fullName) => {
    assert.equal(userId, 8);
    updatedName = fullName;
    return true;
  };
  userRepository.findSafeUserById = async () => ({
    userId: 8, fullName: updatedName, email: 'safe@example.test', userType: 'NORMAL',
    accountRole: 'USER', accountStatus: 'ACTIVE', employmentStatus: null
  });

  const user = await authService.updateProfile(8, { fullName: '  Safe   Name  ' });
  assert.equal(updatedName, 'Safe Name');
  assert.equal(user.fullName, 'Safe Name');
  await assert.rejects(
    authService.updateProfile(8, { fullName: 'Safe Name', accountRole: 'ADMIN' }),
    (error) => error.statusCode === 400 && /cannot be changed/.test(error.message)
  );
});

test('password change requires the current password and stores only a new hash', async () => {
  const currentHash = await bcrypt.hash('current1', 4);
  let storedHash;
  userRepository.findPasswordHashById = async () => ({
    passwordHash: currentHash,
    accountStatus: 'ACTIVE'
  });
  userRepository.updatePasswordHash = async (userId, passwordHash) => {
    assert.equal(userId, 8);
    storedHash = passwordHash;
    return true;
  };

  await assert.rejects(
    authService.changePassword(8, { currentPassword: 'wrong1', newPassword: 'changed1' }),
    (error) => error.statusCode === 400 && /incorrect/.test(error.message)
  );
  const result = await authService.changePassword(8, {
    currentPassword: 'current1',
    newPassword: 'changed1'
  });
  assert.equal(result.passwordChanged, true);
  assert.notEqual(storedHash, 'changed1');
  assert.equal(await bcrypt.compare('changed1', storedHash), true);
});
