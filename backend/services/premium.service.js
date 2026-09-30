const premiumRepository = require('../repositories/premium.repository');
const userRepository = require('../repositories/user.repository');
const paymentGateway = require('./payment-gateway.service');
const paymentConfig = require('../config/payment');
const storage = require('../config/supabase-storage');
const createHttpError = require('../utils/httpError');

// SSLCommerz does not accept a charge below ten taka.
const MINIMUM_CHARGE_BDT = 10;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAN_CODE_PATTERN = /^[A-Z0-9_]{2,30}$/;
const PROMO_CODE_PATTERN = /^[A-Z0-9_-]{3,40}$/;

function httpError(status, message, code) {
  const error = createHttpError(status, message);
  if (code) error.sapleCode = code;
  return error;
}

// Before migration 009 the Premium tables do not exist; every reader then
// treats the account as free instead of failing the page.
function missingPremiumSchema(error) {
  return error?.code === '42P01' || error?.code === '42703';
}

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

// ---- Entitlement -----------------------------------------------------------

const FREE_ACCESS = Object.freeze({
  hasPremium: false, source: null, planCode: null, startsAt: null, endsAt: null,
  trialEligible: false, trialUsed: false, trialEndsAt: null
});

// The one answer to "does this account have Premium right now?", decided by
// the database clock. Nothing from the browser or the JWT is consulted.
async function getPremiumAccess(userId) {
  if (!userId) return { ...FREE_ACCESS };
  let row;
  try {
    row = await premiumRepository.findAccess(userId);
  } catch (error) {
    if (missingPremiumSchema(error)) return { ...FREE_ACCESS };
    throw error;
  }
  if (!row) return { ...FREE_ACCESS };

  const active = row.accountStatus === 'ACTIVE';
  const paidActive = active && Boolean(row.paidPlanCode);
  const trialActive = active && row.trialActive === true;
  const ends = [trialActive ? row.trialEndsAt : null, active ? row.paidEndsAt : null]
    .filter(Boolean).map((value) => new Date(value).getTime());

  return {
    hasPremium: paidActive || trialActive,
    source: paidActive ? 'PAID' : trialActive ? 'TRIAL' : null,
    planCode: paidActive ? row.paidPlanCode : null,
    startsAt: iso(paidActive ? row.paidStartsAt : trialActive ? row.trialStartsAt : null),
    endsAt: ends.length ? new Date(Math.max(...ends)).toISOString() : null,
    trialEligible: active && !row.trialUsed && !row.hasPaidHistory,
    trialUsed: Boolean(row.trialUsed),
    trialEndsAt: iso(row.trialEndsAt)
  };
}

async function hasPremium(userId) {
  return (await getPremiumAccess(userId)).hasPremium;
}

// Map of userId -> 'PAID' | 'TRIAL' for accounts whose Premium is active now.
async function getBadgeSources(userIds) {
  const ids = [...new Set((userIds || []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return new Map();
  try {
    const rows = await premiumRepository.findBadgeSources(ids);
    return new Map(rows.map((row) => [Number(row.userId), row.source]));
  } catch (error) {
    if (missingPremiumSchema(error)) return new Map();
    throw error;
  }
}

// Public badge shape: never an expiry date.
function badgeFor(source) {
  if (source === 'PAID') return { premium: true, label: 'Premium Saple member' };
  if (source === 'TRIAL') return { premium: true, label: 'Premium trial' };
  return null;
}

async function withBadges(items, idField = 'userId') {
  const sources = await getBadgeSources(items.map((item) => item[idField]));
  return items.map((item) => ({ ...item, premiumBadge: badgeFor(sources.get(Number(item[idField]))) }));
}

// ---- Interview questions gate ---------------------------------------------

// About the first line or two. Short summaries show a little over half, so a
// preview never becomes the whole answer.
function questionsPreview(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  const limit = Math.min(160, Math.max(24, Math.floor(clean.length * 0.55)));
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,.;:-]+$/, '')}…`;
}

// Free and anonymous callers receive a preview and a lock flag; the full
// questions text is not in their response at all.
function lockInterview(item) {
  const { questionsSummary, ...rest } = item;
  if (!questionsSummary) return { ...rest, questionsPreview: null, questionsLocked: false };
  return { ...rest, questionsPreview: questionsPreview(questionsSummary), questionsLocked: true };
}

async function gateInterviews(items, userId) {
  const premium = userId ? await hasPremium(userId) : false;
  return (items || []).map((item) => (premium ? { ...item, questionsLocked: false } : lockInterview(item)));
}

// ---- One-day trial ---------------------------------------------------------

async function startTrial(userId) {
  let outcome;
  try {
    outcome = await premiumRepository.claimTrial(userId);
  } catch (error) {
    // The primary key is the final guard: a concurrent duplicate lands here.
    if (error?.code === '23505') throw httpError(409, 'The free trial has already been used on this account.', 'TRIAL_ALREADY_USED');
    if (missingPremiumSchema(error)) throw httpError(503, 'Premium is not available yet.', 'PREMIUM_UNAVAILABLE');
    throw error;
  }
  if (!outcome.claimed) {
    if (outcome.reason === 'TRIAL_ALREADY_USED') {
      throw httpError(409, 'The free trial has already been used on this account.', 'TRIAL_ALREADY_USED');
    }
    if (outcome.reason === 'TRIAL_NOT_ELIGIBLE') {
      throw httpError(409, 'The free trial is for accounts that have not had Premium before.', 'TRIAL_NOT_ELIGIBLE');
    }
    throw httpError(403, 'This account cannot start a trial.', 'ACCOUNT_INACTIVE');
  }
  return getPremiumAccess(userId);
}

// ---- Plans and prices -------------------------------------------------------

function planView(plan) {
  const price = money(plan.priceBdt);
  const months = Math.round(plan.durationDays / 30);
  const monthly = 120;
  const saving = months > 1 ? money(monthly * months - price) : 0;
  return {
    planCode: plan.planCode,
    name: plan.name,
    durationDays: plan.durationDays,
    priceBdt: price,
    savingBdt: saving > 0 ? saving : 0,
    renewal: 'Prepaid access · no automatic renewal'
  };
}

async function listPlans() {
  let plans;
  try {
    plans = await premiumRepository.findActivePlans();
  } catch (error) {
    if (missingPremiumSchema(error)) return { plans: [], payments: paymentConfig.getPublicPaymentStatus() };
    throw error;
  }
  return { plans: plans.map(planView), payments: paymentConfig.getPublicPaymentStatus() };
}

function normalizePlanCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!PLAN_CODE_PATTERN.test(code)) throw httpError(400, 'Choose a Premium plan.', 'PLAN_REQUIRED');
  return code;
}

function normalizePromoCode(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw httpError(400, 'Promo code must be text.', 'PROMO_INVALID');
  const code = value.trim().toUpperCase();
  if (!code) return null;
  if (!PROMO_CODE_PATTERN.test(code)) throw httpError(400, 'That promo code is not valid.', 'PROMO_INVALID');
  return code;
}

// Discount from a code's own rules. The result is rounded to the paisa and
// can never take the total below the gateway's minimum charge.
function computeDiscount(promo, baseAmount) {
  const value = Number(promo.discountValue);
  let discount = promo.discountType === 'PERCENT' ? money(baseAmount * value / 100) : money(value);
  if (promo.maxDiscountBdt !== null && promo.maxDiscountBdt !== undefined) {
    discount = Math.min(discount, money(promo.maxDiscountBdt));
  }
  discount = Math.min(discount, baseAmount);
  if (baseAmount - discount < MINIMUM_CHARGE_BDT) {
    throw httpError(400, `This code cannot be used here: the total must be at least ৳${MINIMUM_CHARGE_BDT}.`, 'PROMO_TOO_LARGE');
  }
  return money(discount);
}

function assertPromoUsable(promo, planCode, usage) {
  if (!promo || !promo.isActive || !promo.hasStarted || !promo.notExpired) {
    throw httpError(400, 'That promo code is not valid or has expired.', 'PROMO_INVALID');
  }
  if (promo.applicablePlanCode && promo.applicablePlanCode !== planCode) {
    throw httpError(400, 'That promo code does not apply to this plan.', 'PROMO_PLAN_MISMATCH');
  }
  if (promo.maxRedemptions !== null && promo.maxRedemptions !== undefined && usage.total >= promo.maxRedemptions) {
    throw httpError(400, 'That promo code has reached its limit.', 'PROMO_EXHAUSTED');
  }
  if (usage.forUser >= promo.perUserLimit) {
    throw httpError(400, 'You have already used this promo code.', 'PROMO_USER_LIMIT');
  }
}

async function loadActivePlan(planCode, client) {
  const plan = await premiumRepository.findPlanByCode(planCode, client);
  if (!plan || !plan.isActive) throw httpError(404, 'That Premium plan is not available.', 'PLAN_NOT_FOUND');
  return plan;
}

// Price only; nothing is reserved. Checkout recalculates from scratch.
async function quote(userId, input = {}) {
  const planCode = normalizePlanCode(input.planCode);
  const promoCode = normalizePromoCode(input.promoCode);
  try {
    const plan = await loadActivePlan(planCode);
    const baseAmount = money(plan.priceBdt);
    let discountAmount = 0;
    if (promoCode) {
      const promo = await premiumRepository.findPromo(promoCode);
      const usage = promo ? await premiumRepository.findPromoUsage(promo.promoCodeId, userId) : null;
      assertPromoUsable(promo, planCode, usage);
      discountAmount = computeDiscount(promo, baseAmount);
    }
    return {
      planCode,
      planName: plan.name,
      durationDays: plan.durationDays,
      baseAmount,
      discountAmount,
      finalAmount: money(baseAmount - discountAmount),
      promoCode,
      currency: 'BDT'
    };
  } catch (error) {
    if (missingPremiumSchema(error)) throw httpError(503, 'Premium is not available yet.', 'PREMIUM_UNAVAILABLE');
    throw error;
  }
}

// ---- Checkout ------------------------------------------------------------

async function checkout(userId, input = {}) {
  const planCode = normalizePlanCode(input.planCode);
  const promoCode = normalizePromoCode(input.promoCode);
  if (!paymentGateway.isConfigured()) {
    throw httpError(503, 'Online payment is not available yet. Please try again later.', 'PAYMENTS_NOT_CONFIGURED');
  }
  const user = await userRepository.findSafeUserById(userId);
  if (!user || user.accountStatus !== 'ACTIVE') throw httpError(403, 'This account cannot buy Premium.', 'ACCOUNT_INACTIVE');

  // 1. Record the payment (and reserve the code) before contacting anyone.
  const payment = await premiumRepository.withCloudTransaction(async (client) => {
    const plan = await loadActivePlan(planCode, client);
    const baseAmount = money(plan.priceBdt);
    let promo = null;
    let discountAmount = 0;
    if (promoCode) {
      promo = await premiumRepository.findPromo(promoCode, client, { lock: true });
      if (promo) await premiumRepository.releaseStaleReservations(promo.promoCodeId, client);
      const usage = promo ? await premiumRepository.findPromoUsage(promo.promoCodeId, userId, client) : null;
      assertPromoUsable(promo, planCode, usage);
      discountAmount = computeDiscount(promo, baseAmount);
    }
    const finalAmount = money(baseAmount - discountAmount);
    const created = await premiumRepository.insertPayment(client, {
      userId, planId: plan.planId, promoCodeId: promo?.promoCodeId || null, baseAmount, discountAmount, finalAmount
    });
    if (promo) {
      await premiumRepository.insertReservation(client, {
        promoCodeId: promo.promoCodeId, userId, paymentId: created.paymentId, discountAmount
      });
    }
    return { ...created, plan, finalAmount };
  });

  // 2. Only then open the gateway session. A failure here closes the payment
  // and frees the code; Premium is never granted on this path.
  try {
    const session = await paymentGateway.createSession({
      publicId: payment.publicId,
      amount: payment.finalAmount,
      customerName: user.fullName,
      customerEmail: user.email,
      planName: payment.plan.name
    });
    await premiumRepository.markSessionCreated(payment.paymentId, session.sessionKey);
    return { publicId: payment.publicId, redirectUrl: session.redirectUrl, finalAmount: payment.finalAmount };
  } catch (error) {
    await premiumRepository.closeOpenPayment(payment.publicId, 'FAILED').catch(() => {});
    if (error.statusCode) throw error;
    throw httpError(503, 'The payment gateway could not be reached. Please try again.', 'GATEWAY_UNAVAILABLE');
  }
}

// ---- Settlement ------------------------------------------------------------

function validPublicId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

// The single settlement path for both the IPN and the browser return. The
// gateway's server-side validation is the only evidence of payment; the
// transaction id and amount must match the row that Saple created.
async function settlePremiumPayment({ valId, expectedPublicId = null }) {
  if (typeof valId !== 'string' || !valId.trim() || valId.length > 255) {
    return { settled: false, reason: 'MISSING_VALIDATION_ID' };
  }
  const validation = await paymentGateway.validateTransaction(valId.trim());
  if (!validation.valid) return { settled: false, reason: 'NOT_VALID' };
  if (!validPublicId(validation.tranId)) return { settled: false, reason: 'UNKNOWN_TRANSACTION' };
  if (expectedPublicId && validation.tranId.toLowerCase() !== expectedPublicId.toLowerCase()) {
    return { settled: false, reason: 'TRANSACTION_MISMATCH' };
  }

  return premiumRepository.withCloudTransaction(async (client) => {
    const payment = await premiumRepository.findPaymentForUpdate(client, validation.tranId);
    if (!payment) return { settled: false, reason: 'UNKNOWN_TRANSACTION' };
    if (payment.status === 'SUCCEEDED') return { settled: false, reason: 'ALREADY_SETTLED', publicId: payment.publicId };
    if (payment.status === 'REFUNDED') return { settled: false, reason: 'REFUNDED', publicId: payment.publicId };
    if (validation.currency && validation.currency !== 'BDT') return { settled: false, reason: 'CURRENCY_MISMATCH' };
    if (validation.amount === null || Math.abs(validation.amount - Number(payment.finalAmountBdt)) > 0.009) {
      return { settled: false, reason: 'AMOUNT_MISMATCH' };
    }
    const access = await premiumRepository.grantPaidAccess(client, payment, {
      transactionId: validation.bankTransactionId || validation.tranId,
      validationId: validation.valId
    });
    return { settled: Boolean(access), reason: access ? 'SETTLED' : 'ALREADY_SETTLED', publicId: payment.publicId };
  });
}

// The browser coming back from the gateway. It is only a user-experience
// step: "success" here grants nothing unless validation succeeds.
async function handleReturn(publicId, result, body = {}) {
  const outcome = ['success', 'fail', 'cancel'].includes(result) ? result : 'fail';
  if (validPublicId(publicId)) {
    if (outcome === 'success' && body.val_id) {
      await settlePremiumPayment({ valId: String(body.val_id), expectedPublicId: publicId }).catch((error) => {
        console.error('Premium return settlement deferred to IPN:', error.sapleCode || error.message);
      });
    } else if (outcome !== 'success') {
      await premiumRepository.closeOpenPayment(publicId, outcome === 'cancel' ? 'CANCELLED' : 'FAILED').catch(() => {});
    }
  }
  const query = new URLSearchParams({ result: outcome });
  if (validPublicId(publicId)) query.set('payment', publicId);
  return `/payment-result.html?${query}`;
}

async function handleIpn(body = {}) {
  if (!body.val_id) return { received: true, settled: false };
  const outcome = await settlePremiumPayment({ valId: String(body.val_id) });
  return { received: true, settled: outcome.settled };
}

async function getOwnPayment(userId, publicId) {
  if (!validPublicId(publicId)) throw httpError(404, 'Payment not found.', 'PAYMENT_NOT_FOUND');
  const payment = await premiumRepository.findOwnPayment(userId, publicId);
  if (!payment) throw httpError(404, 'Payment not found.', 'PAYMENT_NOT_FOUND');
  return {
    ...payment,
    baseAmount: money(payment.baseAmount),
    discountAmount: money(payment.discountAmount),
    finalAmount: money(payment.finalAmount)
  };
}

// ---- Profile views ----------------------------------------------------------

async function recordProfileView(profileUserId, viewerUserId) {
  if (!viewerUserId || Number(profileUserId) === Number(viewerUserId)) return;
  try {
    await premiumRepository.recordProfileView(profileUserId, viewerUserId);
  } catch (error) {
    // A view counter must never break the profile page.
    if (!missingPremiumSchema(error)) console.error('Profile view not recorded:', error.message);
  }
}

async function getViewSummary(userId) {
  const access = await getPremiumAccess(userId);
  try {
    return { ...await premiumRepository.findViewSummary(userId), canSeeIdentities: access.hasPremium };
  } catch (error) {
    if (missingPremiumSchema(error)) {
      return { signedInViewersLast30Days: 0, totalViewEventsLast30Days: 0, canSeeIdentities: access.hasPremium };
    }
    throw error;
  }
}

function pageOf(query = {}) {
  const page = Math.max(1, Math.min(1000, Number.parseInt(query.page, 10) || 1));
  const pageSize = Math.max(1, Math.min(50, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

function safePerson(row) {
  return {
    userId: row.userId,
    fullName: row.fullName,
    headline: row.headline || null,
    avatarUrl: storage.publicUrl('avatar', row.avatarPath, row.updatedAt)
  };
}

// Premium-only (enforced by the route). Safe public fields only.
async function getViewers(userId, query = {}) {
  const page = pageOf(query);
  const { items, total } = await premiumRepository.findViewers(userId, page);
  const withBadge = await withBadges(items.map((row) => ({ ...safePerson(row), lastViewedAt: iso(row.lastViewedAt) })));
  return { items: withBadge, page: page.page, pageSize: page.pageSize, total };
}

// ---- Recruiter talent list -------------------------------------------------

async function listTalent(user, query = {}) {
  const page = pageOf(query);
  const raw = typeof query.q === 'string' ? query.q.trim().replace(/\s+/g, ' ') : '';
  if (raw.length > 80) throw httpError(400, 'Search must be 80 characters or fewer.');
  const search = raw.length >= 2 ? raw.replace(/[\\%_]/g, '\\$&') : null;
  let rows;
  try {
    rows = await premiumRepository.findTalent({ excludeUserId: user.userId, search, ...page });
  } catch (error) {
    if (missingPremiumSchema(error)) throw httpError(503, 'Discover Talent is not available yet.', 'PREMIUM_UNAVAILABLE');
    throw error;
  }
  return {
    items: rows.map((row) => ({
      ...safePerson(row),
      bioExcerpt: row.bioExcerpt || null,
      skills: row.skills || [],
      profileCompleteness: row.profileCompleteness,
      premiumBadge: badgeFor(row.premium),
      promoted: Boolean(row.premium)
    })),
    page: page.page,
    pageSize: page.pageSize,
    total: rows[0]?.totalCount || 0
  };
}

// ---- Administration ------------------------------------------------------

function optionalPositiveInteger(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 1000000) throw httpError(400, `${label} must be a positive whole number.`);
  return number;
}

function optionalMoney(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 100000) throw httpError(400, `${label} must be a positive amount.`);
  return money(number);
}

function optionalDate(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw httpError(400, `${label} must be a valid date.`);
  return date.toISOString();
}

async function createPromoCode(adminUser, input = {}) {
  const code = normalizePromoCode(input.code);
  if (!code) throw httpError(400, 'Enter a code of 3 to 40 letters, numbers, dashes or underscores.');
  const discountType = String(input.discountType || '').toUpperCase();
  if (!['PERCENT', 'FIXED'].includes(discountType)) throw httpError(400, 'Discount type must be PERCENT or FIXED.');
  const discountValue = optionalMoney(input.discountValue, 'Discount value');
  if (discountValue === null) throw httpError(400, 'Discount value is required.');
  if (discountType === 'PERCENT' && discountValue > 100) throw httpError(400, 'A percentage discount cannot exceed 100.');
  const applicablePlanCode = input.applicablePlanCode ? normalizePlanCode(input.applicablePlanCode) : null;
  const validFrom = optionalDate(input.validFrom, 'Start date');
  const validUntil = optionalDate(input.validUntil, 'End date');
  if (validUntil && new Date(validUntil) <= new Date(validFrom || Date.now())) {
    throw httpError(400, 'The end date must be after the start date.');
  }
  const description = typeof input.description === 'string' && input.description.trim()
    ? input.description.trim().slice(0, 300) : null;
  if (applicablePlanCode && !(await premiumRepository.findPlanByCode(applicablePlanCode))) {
    throw httpError(400, 'That plan does not exist.');
  }
  try {
    return await premiumRepository.insertPromoCode({
      code, description, discountType, discountValue,
      maxDiscountBdt: optionalMoney(input.maxDiscountBdt, 'Maximum discount'),
      applicablePlanCode,
      maxRedemptions: optionalPositiveInteger(input.maxRedemptions, 'Total limit'),
      perUserLimit: optionalPositiveInteger(input.perUserLimit, 'Per-user limit') || 1,
      validFrom, validUntil, createdBy: adminUser.userId
    });
  } catch (error) {
    if (error?.code === '23505') throw httpError(409, 'A promo code with that name already exists.');
    throw error;
  }
}

async function setPromoCodeActive(promoCodeIdValue, input = {}) {
  const promoCodeId = optionalPositiveInteger(promoCodeIdValue, 'Promo code ID');
  if (typeof input.isActive !== 'boolean') throw httpError(400, 'isActive must be true or false.');
  const updated = await premiumRepository.setPromoActive(promoCodeId, input.isActive);
  if (!updated) throw httpError(404, 'Promo code not found.');
  return updated;
}

async function listPromoCodes() {
  const rows = await premiumRepository.findPromoCodes();
  return rows.map(({ hasStarted, notExpired, ...row }) => ({
    ...row,
    discountValue: money(row.discountValue),
    maxDiscountBdt: row.maxDiscountBdt === null ? null : money(row.maxDiscountBdt),
    currentlyValid: row.isActive && hasStarted && notExpired
  }));
}

async function getOverview() {
  const overview = await premiumRepository.findOverview();
  return {
    ...overview,
    revenueBdt: money(overview.revenueBdt),
    recentPayments: overview.recentPayments.map((payment) => ({
      ...payment,
      finalAmount: money(payment.finalAmount),
      discountAmount: money(payment.discountAmount)
    }))
  };
}

module.exports = {
  MINIMUM_CHARGE_BDT,
  missingPremiumSchema,
  getPremiumAccess, hasPremium, getBadgeSources, badgeFor, withBadges,
  questionsPreview, gateInterviews,
  startTrial,
  listPlans, quote, computeDiscount, checkout,
  settlePremiumPayment, handleReturn, handleIpn, getOwnPayment,
  recordProfileView, getViewSummary, getViewers,
  listTalent,
  createPromoCode, setPromoCodeActive, listPromoCodes, getOverview
};
