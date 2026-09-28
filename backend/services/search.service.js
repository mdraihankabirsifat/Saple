const users = require('../repositories/user.repository');
const companies = require('../repositories/company.repository');
const storage = require('../config/supabase-storage');
const createHttpError = require('../utils/httpError');

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
    avatarUrl: storage.publicUrl('avatar', user.avatarPath, user.updatedAt)
  };
}

async function people(value, currentUserId) {
  const pattern = `%${normalizeQuery(value)}%`;
  return (await users.searchActiveUsers(pattern, currentUserId)).map(safeUser);
}

async function all(value, currentUserId) {
  const pattern = `%${normalizeQuery(value)}%`;
  const [userRows, companyRows] = await Promise.all([
    users.searchActiveUsers(pattern, currentUserId),
    companies.searchCompanies(pattern)
  ]);
  return {
    users: userRows.map(safeUser),
    companies: companyRows.map((company) => ({
      companyId: company.companyId,
      companyName: company.companyName,
      industry: company.industry,
      logoUrl: storage.publicUrl('logo', company.logoPath, company.updatedAt)
    }))
  };
}

module.exports = { normalizeQuery, people, all };
