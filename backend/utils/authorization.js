const createHttpError = require('./httpError');

// Shared, deliberately blunt authorization helpers. Services call these so the
// same rule is enforced whether a company is named in the URL or derived from
// a job or application row.

function hasCompanyScope(user, companyId) {
  return Array.isArray(user?.representativeCompanyIds)
    && user.representativeCompanyIds.includes(Number(companyId));
}

// Representatives are confined to their assigned companies. Administrators
// keep oversight, which is a separate power, not a wider representative scope.
function assertCompanyScope(user, companyId) {
  if (user?.role === 'ADMIN') return 'ADMIN';

  if (user?.role !== 'COMPANY_REPRESENTATIVE' || !hasCompanyScope(user, companyId)) {
    // The same message for "not a representative" and "wrong company" so the
    // response cannot be used to map which companies an account represents.
    throw createHttpError(403, 'You do not have access to this company workspace');
  }

  return 'COMPANY_REPRESENTATIVE';
}

function assertOwnership(user, ownerUserId, resourceLabel = 'record') {
  if (user?.userId !== ownerUserId) {
    throw createHttpError(403, `You do not have access to this ${resourceLabel}`);
  }
}

function isAdmin(user) {
  return user?.role === 'ADMIN';
}

module.exports = { hasCompanyScope, assertCompanyScope, assertOwnership, isAdmin };
