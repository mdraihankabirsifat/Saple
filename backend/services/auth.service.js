const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth');
const userRepository = require('../repositories/user.repository');
const createHttpError = require('../utils/httpError');

const PASSWORD_SALT_ROUNDS = 12;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('saple-timing-placeholder', PASSWORD_SALT_ROUNDS);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_TYPES = new Set(['NORMAL', 'EMPLOYEE']);
const EMPLOYMENT_STATUSES = new Set(['CURRENT', 'FORMER']);

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function validateEmail(email) {
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

function validatePassword(password) {
  return (
    typeof password === 'string'
    && password.length >= 8
    && Buffer.byteLength(password, 'utf8') <= 72
    && /[A-Za-z]/.test(password)
    && /\d/.test(password)
  );
}

function toSafeUser(user, verifiedCompanies = []) {
  return {
    userId: user.userId,
    fullName: user.fullName,
    email: user.email,
    userType: user.userType,
    accountRole: user.accountRole,
    accountStatus: user.accountStatus,
    employmentStatus: user.employmentStatus || null,
    verifiedCompanies,
    ...(user.createdAt ? { createdAt: user.createdAt } : {})
  };
}

async function register(input = {}) {
  const fullName = typeof input.fullName === 'string'
    ? input.fullName.trim().replace(/\s+/g, ' ')
    : '';
  const email = normalizeEmail(input.email);
  const password = input.password;
  const userType = typeof input.userType === 'string' ? input.userType.trim().toUpperCase() : '';
  const employmentStatus = typeof input.employmentStatus === 'string'
    ? input.employmentStatus.trim().toUpperCase()
    : null;

  if (fullName.length < 2 || fullName.length > 120) {
    throw createHttpError(400, 'Full name must be between 2 and 120 characters');
  }

  if (!validateEmail(email)) {
    throw createHttpError(400, 'A valid email address is required');
  }

  if (!validatePassword(password)) {
    throw createHttpError(400, 'Password must contain 8 to 72 bytes, including a letter and a number');
  }

  if (!USER_TYPES.has(userType)) {
    throw createHttpError(400, 'User type must be NORMAL or EMPLOYEE');
  }

  if (userType === 'EMPLOYEE' && !EMPLOYMENT_STATUSES.has(employmentStatus)) {
    throw createHttpError(400, 'Employment status must be CURRENT or FORMER for employee accounts');
  }

  if (await userRepository.findUserByEmail(email)) {
    throw createHttpError(409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);

  try {
    const user = await userRepository.createUserWithOptionalEmployee({
      fullName,
      email,
      passwordHash,
      userType,
      employmentStatus
    });

    return toSafeUser(user);
  } catch (error) {
    if (error.errorNum === 1) {
      throw createHttpError(409, 'An account with this email already exists');
    }

    throw error;
  }
}

async function login(input = {}) {
  const email = normalizeEmail(input.email);
  const password = input.password;

  if (!validateEmail(email) || typeof password !== 'string' || password.length === 0) {
    throw createHttpError(401, 'Invalid email or password.');
  }

  const user = await userRepository.findUserByEmail(email);
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash || DUMMY_PASSWORD_HASH);

  if (!user || !passwordMatches || user.accountStatus !== 'ACTIVE') {
    throw createHttpError(401, 'Invalid email or password.');
  }

  const token = jwt.sign(
    {
      userId: user.userId,
      role: user.accountRole
    },
    authConfig.getJwtSecret(),
    {
      algorithm: authConfig.JWT_ALGORITHM,
      expiresIn: authConfig.getJwtExpiresIn(),
      issuer: authConfig.JWT_ISSUER,
      audience: authConfig.JWT_AUDIENCE
    }
  );

  const verifiedCompanies = user.userType === 'EMPLOYEE'
    ? await userRepository.findActiveVerifiedCompaniesByUserId(user.userId)
    : [];

  return {
    token,
    user: toSafeUser(user, verifiedCompanies)
  };
}

async function getCurrentUser(userId) {
  const user = await userRepository.findSafeUserById(userId);

  if (!user || user.accountStatus !== 'ACTIVE') {
    throw createHttpError(401, 'Authenticated account is unavailable');
  }

  const verifiedCompanies = user.userType === 'EMPLOYEE'
    ? await userRepository.findActiveVerifiedCompaniesByUserId(userId)
    : [];
  return toSafeUser(user, verifiedCompanies);
}

async function updateProfile(userId, input = {}) {
  const allowedFields = new Set(['fullName']);
  const unexpected = Object.keys(input).filter((key) => !allowedFields.has(key));
  if (unexpected.length > 0) {
    throw createHttpError(400, `Profile field cannot be changed: ${unexpected[0]}`);
  }
  const fullName = typeof input.fullName === 'string'
    ? input.fullName.trim().replace(/\s+/g, ' ')
    : '';
  if (fullName.length < 2 || fullName.length > 120) {
    throw createHttpError(400, 'Full name must be between 2 and 120 characters');
  }
  if (!await userRepository.updateFullName(userId, fullName)) {
    throw createHttpError(401, 'Authenticated account is unavailable');
  }
  return getCurrentUser(userId);
}

async function changePassword(userId, input = {}) {
  const currentPassword = input.currentPassword;
  const newPassword = input.newPassword;
  if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
    throw createHttpError(400, 'Current password is required');
  }
  if (!validatePassword(newPassword)) {
    throw createHttpError(400, 'New password must contain 8 to 72 bytes, including a letter and a number');
  }
  const credentials = await userRepository.findPasswordHashById(userId);
  if (!credentials || credentials.accountStatus !== 'ACTIVE') {
    throw createHttpError(401, 'Authenticated account is unavailable');
  }
  if (!await bcrypt.compare(currentPassword, credentials.passwordHash)) {
    throw createHttpError(400, 'Current password is incorrect');
  }
  if (await bcrypt.compare(newPassword, credentials.passwordHash)) {
    throw createHttpError(400, 'New password must be different from the current password');
  }
  const passwordHash = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS);
  if (!await userRepository.updatePasswordHash(userId, passwordHash)) {
    throw createHttpError(401, 'Authenticated account is unavailable');
  }
  return { passwordChanged: true };
}

module.exports = {
  register,
  login,
  getCurrentUser,
  updateProfile,
  changePassword
};
