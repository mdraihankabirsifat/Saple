const repository = require('../repositories/admin-control.repository');
const storage = require('../config/supabase-storage');
const createHttpError = require('../utils/httpError');
const { sendSuccess } = require('../utils/apiResponse');

function id(value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw createHttpError(400, 'Invalid user ID');
  }
  return Number(value);
}
function paging(query = {}) {
  const page = Number(query.page || 1);
  const pageSize = Number(query.pageSize || 20);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || (page - 1) * pageSize > 1000000) {
    throw createHttpError(400, 'Invalid pagination');
  }
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}
function selected(value, allowed, label) {
  if (!value) return null;
  if (typeof value !== 'string' || !allowed.includes(value)) throw createHttpError(400, `Invalid ${label}`);
  return value;
}
function search(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.trim().length > 100) throw createHttpError(400, 'Search must be at most 100 characters');
  return value.trim();
}
function reason(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 1000) {
    throw createHttpError(400, 'A reason of up to 1000 characters is required');
  }
  return value.trim();
}
function mapError(error) {
  const code = { NOT_FOUND: 404, CONFLICT: 409, LAST_ADMIN: 409, INVALID_CONFIRMATION: 400 }[error.sapleCode];
  return code ? createHttpError(code, error.message) : error;
}
function handle(work) { return async (request, response, next) => {
  try { return sendSuccess(response, 200, 'Admin data retrieved successfully', await work(request)); }
  catch (error) { return next(mapError(error)); }
}; }

const summary = handle(() => repository.summary());
const submissions = handle(async ({ query }) => { const page = paging(query); return { ...page,
  ...(await repository.submissions({ ...page, search: search(query.search),
    type: selected(query.type, ['SALARY','REVIEW','INTERVIEW'], 'type'),
    status: query.status === 'ALL' ? null : selected(query.status || 'PENDING', ['PENDING','APPROVED','REJECTED','FLAGGED'], 'status'),
    sort: selected(query.sort || 'oldest', ['oldest','newest','company','type'], 'sort') })) }; });
const verifications = handle(async ({ query }) => { const page = paging(query); return { ...page,
  ...(await repository.verifications({ ...page, search: search(query.search),
    status: query.status === 'ALL' ? null : selected(query.status || 'PENDING', ['PENDING','VERIFIED','REJECTED','EXPIRED'], 'status') })) }; });
const reports = handle(async ({ query }) => { const page = paging(query); return { ...page,
  ...(await repository.reports({ ...page, search: search(query.search),
    status: selected(query.status, ['OPEN','REVIEWING','RESOLVED','DISMISSED'], 'status') })) }; });
const screening = handle(({ params }) => repository.screening(id(params.submissionId)));
const users = handle(async ({ query }) => {
  const page = paging(query);
  return { ...page, ...(await repository.users({ ...page, search: search(query.search),
    role: selected(query.role, ['USER','ADMIN','COMPANY_REPRESENTATIVE'], 'role'),
    status: selected(query.status, ['ACTIVE','SUSPENDED','DEACTIVATED'], 'status'),
    premium: selected(query.premium, ['PREMIUM','TRIAL','FREE'], 'Premium filter'),
    sort: selected(query.sort || 'newest', ['newest','oldest','name'], 'sort') })) };
});
const user = handle(async ({ params }) => {
  const detail = await repository.userDetail(id(params.userId));
  if (!detail) throw createHttpError(404, 'User not found');
  return { ...detail, avatarUrl: storage.publicUrl('avatar', detail.avatarPath) };
});
const userStatus = handle(({ params, user: actor, body }) => repository.setUserStatus({
  userId: id(params.userId), actorId: actor.userId,
  status: selected(body?.status, ['ACTIVE','SUSPENDED','DEACTIVATED'], 'account status') || (() => { throw createHttpError(400, 'Account status is required'); })(),
  reason: reason(body?.reason), confirmEmail: typeof body?.confirmEmail === 'string' ? body.confirmEmail.trim() : ''
}));
const subscriptions = handle(async ({ query }) => {
  const page = paging(query);
  return { ...page, ...(await repository.subscriptions({ ...page, search: search(query.search),
    filter: selected(query.filter, ['PREMIUM','TRIAL','FREE','ADMIN_GRANT','PAID','EXPIRED'], 'subscription filter') })) };
});
const subscription = handle(async ({ params }) => {
  const detail = await repository.subscriptionDetail(id(params.userId));
  if (!detail) throw createHttpError(404, 'User not found');
  return detail;
});
const grant = handle(({ params, user: actor, body }) => {
  const days = Number(body?.days);
  if (![30,90].includes(days)) throw createHttpError(400, 'Duration must be 30 or 90 days');
  return repository.grantPremium({ userId: id(params.userId), actorId: actor.userId, days, reason: reason(body?.reason) });
});
const revoke = handle(({ params, user: actor, body }) => repository.revokePremium({
  userId: id(params.userId), actorId: actor.userId, reason: reason(body?.reason)
}));

module.exports = { summary, submissions, verifications, reports, screening, users, user, userStatus,
  subscriptions, subscription, grant, revoke };
