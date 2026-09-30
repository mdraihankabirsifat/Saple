const users = require('../repositories/user.repository');
const companies = require('../repositories/company.repository');
const storage = require('../config/supabase-storage');
const createHttpError = require('../utils/httpError');
const premium = require('./premium.service');

function normalizeQuery(value) {
  if (typeof value !== 'string') throw createHttpError(400, 'Search must be text');
  const query = value.trim().replace(/\s+/g, ' ');
  if (query.length < 2 || query.length > 80) throw createHttpError(400, 'Search must be 2 to 80 characters');
  return query.replace(/[\\%_]/g, '\\$&');
}

function safeUser(user) {
  return {
    userId: user.userId,
    fullName: user.fullName,
    displayLabel: user.accountRole === 'COMPANY_REPRESENTATIVE' ? 'Company representative' : 'Saple member',
    headline: user.headline || null,
    avatarUrl: storage.publicUrl('avatar', user.avatarPath, user.updatedAt)
  };
}

async function people(value, currentUserId) {
  const pattern = `%${normalizeQuery(value)}%`;
  return premium.withBadges((await users.searchActiveUsers(pattern, currentUserId)).map(safeUser));
}

// scope 'companies' is the homepage search: companies only, matched by name,
// industry or city, so it costs one query instead of two.
async function all(value, currentUserId = null, { scope } = {}) {
  if (scope !== undefined && scope !== 'all' && scope !== 'companies') {
    throw createHttpError(400, 'Unknown search scope');
  }
  const pattern = `%${normalizeQuery(value)}%`;
  const companiesOnly = scope === 'companies';
  const [userRows, companyRows] = await Promise.all([
    companiesOnly ? [] : users.searchActiveUsers(pattern, currentUserId),
    companies.searchCompanies(pattern, 8, { broad: companiesOnly })
  ]);
  return {
    users: await premium.withBadges(userRows.map(safeUser)),
    companies: companyRows.map((company) => ({
      companyId: company.companyId,
      companyName: company.companyName,
      industry: company.industry,
      city: company.city || null,
      logoUrl: storage.publicUrl('logo', company.logoPath, company.updatedAt)
    }))
  };
}

module.exports = { normalizeQuery, people, all };
