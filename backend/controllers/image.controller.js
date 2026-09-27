const database = require('../config/database');
const storage = require('../config/supabase-storage');
const createHttpError = require('../utils/httpError');
const { sendSuccess } = require('../utils/apiResponse');

function companyIdFrom(request) {
  const id = Number(request.params.companyId);
  if (!Number.isSafeInteger(id) || id < 1) throw createHttpError(400, 'Invalid company ID');
  if (!request.user.representativeCompanyIds.includes(id)) throw createHttpError(403, 'This company is outside your active assignments');
  return id;
}
function handler(work) { return async (request, response, next) => {
  try { return await work(request, response); } catch (error) { return next(error); }
}; }
const putAvatar = handler(async (request, response) => {
  const id = request.user.userId;
  const path = `users/${id}/avatar`;
  const existing = await database.query('SELECT avatar_path FROM users WHERE user_id = $1', [id]);
  await storage.upload('avatar', path, request.file);
  let result;
  try { result = await database.withTransaction((client) => client.query('UPDATE users SET avatar_path = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 RETURNING avatar_path AS "avatarPath", updated_at AS "updatedAt"', [path, id])); }
  catch (error) { if (!existing.rows[0]?.avatar_path) await storage.remove('avatar', path).catch(() => {}); throw error; }
  return sendSuccess(response, 200, 'Profile picture updated', { avatarPath: path, avatarUrl: storage.publicUrl('avatar', path, result.rows[0].updatedAt) });
});
const deleteAvatar = handler(async (request, response) => {
  const id = request.user.userId;
  const existing = await database.query('SELECT avatar_path FROM users WHERE user_id = $1', [id]);
  await storage.remove('avatar', existing.rows[0]?.avatar_path);
  await database.withTransaction((client) => client.query('UPDATE users SET avatar_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1', [id]));
  return sendSuccess(response, 200, 'Profile picture removed', { avatarPath: null, avatarUrl: null });
});
const putLogo = handler(async (request, response) => {
  const id = companyIdFrom(request);
  const path = `companies/${id}/logo`;
  const existing = await database.query('SELECT logo_path FROM companies WHERE company_id = $1', [id]);
  if (!existing.rows[0]) throw createHttpError(404, 'Company not found');
  await storage.upload('logo', path, request.file);
  let result;
  try { result = await database.withTransaction((client) => client.query('UPDATE companies SET logo_path = $1, updated_at = CURRENT_TIMESTAMP WHERE company_id = $2 RETURNING updated_at AS "updatedAt"', [path, id])); }
  catch (error) { if (!existing.rows[0].logo_path) await storage.remove('logo', path).catch(() => {}); throw error; }
  return sendSuccess(response, 200, 'Company logo updated', { logoPath: path, logoUrl: storage.publicUrl('logo', path, result.rows[0].updatedAt) });
});
const deleteLogo = handler(async (request, response) => {
  const id = companyIdFrom(request);
  const existing = await database.query('SELECT logo_path FROM companies WHERE company_id = $1', [id]);
  if (!existing.rows[0]) throw createHttpError(404, 'Company not found');
  await storage.remove('logo', existing.rows[0].logo_path);
  await database.withTransaction((client) => client.query('UPDATE companies SET logo_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE company_id = $1', [id]));
  return sendSuccess(response, 200, 'Company logo removed', { logoPath: null, logoUrl: null });
});
module.exports = { putAvatar, deleteAvatar, putLogo, deleteLogo, companyIdFrom };
