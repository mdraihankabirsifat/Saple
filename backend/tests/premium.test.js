const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');

const database = require('../config/database');
const authConfig = require('../config/auth');
const aiConfig = require('../config/ai');
const paymentConfig = require('../config/payment');
const sslcommerz = require('../services/providers/sslcommerz.provider');
const premiumService = require('../services/premium.service');
const resumeService = require('../services/resume.service');
const applicationService = require('../services/application.service');

// Saple Premium, end to end on an in-process PostgreSQL (PGlite) loaded with
// the final schema: trial, entitlement, pricing, promo codes, SSLCommerz with
// a mocked gateway, idempotent settlement, the interview and job gates, the
// badge, profile views, Discover Talent and Premium AI.

const ROOT = path.resolve(__dirname, '../..');
// SSLCommerz v4 sandbox: sessions on sandbox-gw, validation on sandbox.
const GATEWAY_SESSION = 'https://sandbox-gw.sslcommerz.com';
const GATEWAY = 'https://sandbox.sslcommerz.com';
const AI_BASE = 'https://ai.example.test/v1';
const ENV_KEYS = ['JWT_SECRET', 'PAYMENT_GATEWAY', 'SSLCOMMERZ_BASE_URL', 'SSLCOMMERZ_SESSION_BASE_URL',
  'SSLCOMMERZ_VALIDATION_BASE_URL', 'SSLCOMMERZ_STORE_ID',
  'SSLCOMMERZ_STORE_PASSWORD', 'PUBLIC_API_ORIGIN', 'PREMIUM_AI_MODEL', 'PREMIUM_RESUME_DAILY_LIMIT', 'RESUME_FREE_DAILY_LIMIT'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const savedDatabase = {};
const realFetch = global.fetch;
const realGetAiConfig = aiConfig.getAiConfig;

let pg;
let server;
let baseUrl;
const ids = {};
const tokens = {};

// Scripted gateway and AI provider. Anything else goes to the real fetch, so
// the HTTP tests below still reach the local test server.
const gateway = { sessionFails: false, validations: new Map(), sessions: [] };
let aiReply = null;
// Every AI request body the code sends, and a model that should fail.
const aiRequests = [];
let aiFailModel = null;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

global.fetch = async (url, options = {}) => {
  const href = String(url);
  if (href.startsWith(`${GATEWAY_SESSION}/gwprocess/`)) {
    const body = new URLSearchParams(String(options.body));
    gateway.sessions.push(body);
    if (gateway.sessionFails) return jsonResponse({ status: 'FAILED', failedreason: 'Store is not active' });
    return jsonResponse({ status: 'SUCCESS', GatewayPageURL: `${GATEWAY}/EasyCheckOut/test${gateway.sessions.length}`, sessionkey: `S${gateway.sessions.length}` });
  }
  if (href.startsWith(`${GATEWAY}/validator/`)) {
    const valId = new URL(href).searchParams.get('val_id');
    return jsonResponse(gateway.validations.get(valId) || { status: 'INVALID_TRANSACTION' });
  }
  if (href.startsWith(AI_BASE)) {
    const body = JSON.parse(String(options.body));
    aiRequests.push(body);
    if (aiFailModel && body.model === aiFailModel) return jsonResponse({ error: 'down' }, 500);
    return jsonResponse({ choices: [{ message: { content: aiReply } }], usage: { prompt_tokens: 50, completion_tokens: 80 } });
  }
  return realFetch(url, options);
};

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const one = async (sql, values = []) => (await pg.query(sql, values)).rows[0];
const rejectsWith = (status, code) => (error) => error.statusCode === status && (!code || error.sapleCode === code);

function tokenFor(userId) {
  return jwt.sign({ userId, role: 'USER', tokenVersion: 0 }, process.env.JWT_SECRET, {
    algorithm: authConfig.JWT_ALGORITHM, issuer: authConfig.JWT_ISSUER, audience: authConfig.JWT_AUDIENCE, expiresIn: '10m'
  });
}

async function api(pathname, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const response = await realFetch(`${baseUrl}${pathname}`, {
    method, headers, redirect: 'manual',
    body: body ? JSON.stringify(body) : form ? new URLSearchParams(form).toString() : undefined
  });
  const json = (response.headers.get('content-type') || '').includes('json') ? await response.json() : null;
  return { status: response.status, json, location: response.headers.get('location') };
}

function validPayment(publicId, amount, valId) {
  gateway.validations.set(valId, {
    status: 'VALID', tran_id: publicId, val_id: valId, amount: amount.toFixed(2),
    currency_type: 'BDT', currency_amount: amount.toFixed(2), bank_tran_id: `BANK-${valId}`
  });
}

async function addUser(name, { role = 'USER', status = 'ACTIVE', headline = null } = {}) {
  const row = await one(`INSERT INTO users (full_name, email, password_hash, account_role, account_status, headline, bio)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING user_id AS "userId"`,
  [name, `${name.toLowerCase().replace(/\s+/g, '.')}@example.invalid`, 'x'.repeat(60), role, status, headline,
    headline ? `${name} writes about ${headline}.` : null]);
  return row.userId;
}

test.before(async () => {
  Object.assign(process.env, {
    JWT_SECRET: 'premium-test-secret-with-sufficient-local-entropy-only',
    PAYMENT_GATEWAY: 'sslcommerz',
    SSLCOMMERZ_STORE_ID: 'saple-test-store',
    SSLCOMMERZ_STORE_PASSWORD: 'test-only-store-password',
    PUBLIC_API_ORIGIN: 'https://saple.example.test'
  });
  // The documented sandbox hosts are the defaults, so none is set here.
  for (const key of ['SSLCOMMERZ_BASE_URL', 'SSLCOMMERZ_SESSION_BASE_URL', 'SSLCOMMERZ_VALIDATION_BASE_URL',
    'PREMIUM_AI_MODEL', 'PREMIUM_RESUME_DAILY_LIMIT', 'RESUME_FREE_DAILY_LIMIT']) delete process.env[key];

  const { PGlite } = await import('@electric-sql/pglite');
  pg = new PGlite();
  await pg.exec(read('database/postgres/01_final_schema_postgres.sql'));

  // One connection, so work is queued the way separate pooled connections
  // would wait on each other's row locks.
  let tail = Promise.resolve();
  const acquire = () => {
    let release;
    const next = new Promise((resolve) => { release = resolve; });
    const ready = tail.then(() => release);
    tail = tail.then(() => next);
    return ready;
  };
  for (const name of ['query', 'getClient', 'cloudQuery', 'cloudClient', 'withCloudTransaction']) savedDatabase[name] = database[name];
  database.query = async (sql, values) => {
    const release = await acquire();
    try { return await pg.query(sql, values); } finally { release(); }
  };
  database.cloudQuery = database.query;
  database.getClient = async () => {
    const release = await acquire();
    let released = false;
    return {
      query: (sql, values) => (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql) ? pg.exec(sql) : pg.query(sql, values)),
      release() { if (!released) { released = true; release(); } }
    };
  };
  database.cloudClient = database.getClient;
  database.withCloudTransaction = (work) => database.withTransaction(work);

  ids.admin = await addUser('Ada Admin', { role: 'ADMIN' });
  ids.rep = await addUser('Rafi Representative', { role: 'COMPANY_REPRESENTATIVE' });
  ids.alice = await addUser('Alice Trial', { headline: 'Data analyst' });
  ids.bob = await addUser('Bob Trial', { headline: 'Backend engineer' });
  ids.carol = await addUser('Carol Paid', { headline: 'Product designer' });
  ids.dave = await addUser('Dave Free', { headline: 'QA engineer' });
  ids.erin = await addUser('Erin Buyer');
  ids.frank = await addUser('Frank Promo');
  ids.suspended = await addUser('Sam Suspended', { status: 'SUSPENDED' });

  ids.company = (await one(`INSERT INTO companies (company_name, industry, headquarters_city, country)
    VALUES ('Premium Labs', 'Technology', 'Dhaka', 'Bangladesh') RETURNING company_id AS id`)).id;
  ids.role = (await one(`INSERT INTO job_roles (role_name, role_category) VALUES ('Data Engineer', 'Engineering')
    RETURNING role_id AS id`)).id;
  await pg.query(`INSERT INTO company_representatives (user_id, company_id, assignment_status, approved_by, approved_at)
    VALUES ($1, $2, 'ACTIVE', $3, CURRENT_TIMESTAMP)`, [ids.rep, ids.company, ids.admin]);

  const submission = await one(`INSERT INTO submissions (user_id, company_id, submission_type, submission_status, approved_at)
    VALUES ($1, $2, 'INTERVIEW', 'APPROVED', CURRENT_TIMESTAMP) RETURNING submission_id AS id`, [ids.dave, ids.company]);
  ids.questions = 'They asked me to design a streaming pipeline, explain exactly-once delivery, write a window function for rolling revenue, and talk through a production incident I had handled.';
  await pg.query(`INSERT INTO interview_experiences (submission_id, role_id, interview_date, difficulty_level, rounds_count,
      interview_mode, result_status, duration_days, process_description, questions_summary)
    VALUES ($1, $2, CURRENT_DATE - 10, 'MEDIUM', 3, 'ONLINE', 'OFFERED', 14, 'Three rounds over two weeks.', $3)`,
  [submission.id, ids.role, ids.questions]);

  const job = (accessLevel) => one(`INSERT INTO job_postings (company_id, created_by_user_id, title, description, location,
      employment_type, work_mode, salary_min, salary_max, salary_currency, salary_period, application_deadline,
      job_status, published_at, access_level)
    VALUES ($1, $2, $3, 'Build and run the data platform for our customers in Dhaka.', 'Dhaka', 'FULL_TIME', 'HYBRID',
      150000, 220000, 'BDT', 'MONTHLY', CURRENT_DATE + 30, 'PUBLISHED', CURRENT_TIMESTAMP, $4) RETURNING job_id AS id`,
  [ids.company, ids.rep, `${accessLevel === 'PREMIUM' ? 'Premium' : 'Open'} Data Engineer`, accessLevel]);
  ids.premiumJob = (await job('PREMIUM')).id;
  ids.freeJob = (await job('FREE')).id;

  for (const key of ['admin', 'rep', 'alice', 'bob', 'carol', 'dave', 'erin', 'frank']) tokens[key] = tokenFor(ids[key]);

  server = require('../app').listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server?.close();
  Object.assign(database, savedDatabase);
  global.fetch = realFetch;
  aiConfig.getAiConfig = realGetAiConfig;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await pg?.close();
});

// ---- Pure rules --------------------------------------------------------------

test('plans are ৳120 for 30 days and ৳300 for 90 days, prepaid, with the 3-month saving shown', async () => {
  const { plans, payments } = await premiumService.listPlans();
  assert.deepEqual(plans.map((plan) => [plan.planCode, plan.durationDays, plan.priceBdt, plan.savingBdt]),
    [['PREMIUM_1M', 30, 120, 0], ['PREMIUM_3M', 90, 300, 60]]);
  assert.ok(plans.every((plan) => plan.renewal === 'Prepaid access · no automatic renewal'));
  assert.deepEqual(payments, { paymentsEnabled: true, gateway: 'SSLCOMMERZ', sandbox: true });
});

test('discounts are computed on the server, capped, and never take the total below the minimum', () => {
  const percent = (value, extra = {}) => ({ discountType: 'PERCENT', discountValue: String(value), maxDiscountBdt: null, ...extra });
  assert.equal(premiumService.computeDiscount(percent(10), 120), 12);
  assert.equal(premiumService.computeDiscount(percent(15), 300), 45);
  assert.equal(premiumService.computeDiscount(percent(50, { maxDiscountBdt: '40.00' }), 300), 40);
  assert.equal(premiumService.computeDiscount({ discountType: 'FIXED', discountValue: '50.00', maxDiscountBdt: null }, 120), 50);
  assert.throws(() => premiumService.computeDiscount({ discountType: 'FIXED', discountValue: '115.00', maxDiscountBdt: null }, 120),
    rejectsWith(400, 'PROMO_TOO_LARGE'));
  assert.throws(() => premiumService.computeDiscount(percent(100), 120), rejectsWith(400, 'PROMO_TOO_LARGE'));
});

test('the interview preview is a short, ellipsised beginning and never the whole text', () => {
  const preview = premiumService.questionsPreview(ids.questions || 'x '.repeat(200));
  assert.ok(preview.endsWith('…'));
  assert.ok(preview.length <= 161 && preview.length < (ids.questions || '').length);
  assert.equal(premiumService.questionsPreview('Tell me about yourself and why this company.').endsWith('…'), true);
  assert.equal(premiumService.questionsPreview('A   B\n\nC'), 'A B C');
});

test('the public badge never carries an expiry date', () => {
  assert.deepEqual(premiumService.badgeFor('PAID'), { premium: true, label: 'Premium Saple member' });
  assert.deepEqual(premiumService.badgeFor('TRIAL'), { premium: true, label: 'Premium trial' });
  assert.equal(premiumService.badgeFor(null), null);
});

test('payment configuration is null without credentials and refuses insecure gateway URLs', () => {
  const saved = process.env.SSLCOMMERZ_STORE_PASSWORD;
  delete process.env.SSLCOMMERZ_STORE_PASSWORD;
  try {
    assert.equal(paymentConfig.getSslcommerzConfig(), null);
    assert.equal(paymentConfig.getPublicPaymentStatus().paymentsEnabled, false);
  } finally {
    process.env.SSLCOMMERZ_STORE_PASSWORD = saved;
  }
  process.env.SSLCOMMERZ_SESSION_BASE_URL = 'http://sandbox-gw.sslcommerz.com';
  try {
    assert.throws(() => paymentConfig.getSslcommerzConfig(), /HTTPS/);
  } finally {
    delete process.env.SSLCOMMERZ_SESSION_BASE_URL;
  }
  // The public status says whether checkout works; it never includes credentials.
  assert.doesNotMatch(JSON.stringify(paymentConfig.getPublicPaymentStatus()), /saple-test-store|test-only-store-password/);
});

test('sessions and validation use their own SSLCommerz hosts, and live needs both hosts set', () => {
  const sandbox = paymentConfig.getSslcommerzConfig();
  assert.deepEqual([sandbox.sessionBaseUrl, sandbox.validationBaseUrl, sandbox.sandbox],
    ['https://sandbox-gw.sslcommerz.com', 'https://sandbox.sslcommerz.com', true]);

  // One shared base still works, and the specific settings win over it.
  process.env.SSLCOMMERZ_BASE_URL = 'https://securepay.sslcommerz.com';
  try {
    const live = paymentConfig.getSslcommerzConfig();
    assert.deepEqual([live.sessionBaseUrl, live.validationBaseUrl, live.sandbox],
      ['https://securepay.sslcommerz.com', 'https://securepay.sslcommerz.com', false]);
    process.env.SSLCOMMERZ_SESSION_BASE_URL = 'https://sandbox-gw.sslcommerz.com';
    const mixed = paymentConfig.getSslcommerzConfig();
    assert.equal(mixed.sessionBaseUrl, 'https://sandbox-gw.sslcommerz.com');
    assert.equal(mixed.sandbox, false);
  } finally {
    delete process.env.SSLCOMMERZ_BASE_URL;
    delete process.env.SSLCOMMERZ_SESSION_BASE_URL;
  }
});

test('the SSLCommerz adapter sends the required session fields and parses validation strictly', async () => {
  const config = paymentConfig.getSslcommerzConfig();
  const before = gateway.sessions.length;
  const session = await sslcommerz.createSession(config, {
    tranId: '11111111-1111-4111-8111-111111111111', amount: 108, customerName: 'Test', customerEmail: 't@example.invalid',
    productName: 'Saple Premium 1 Month', successUrl: 'https://a/s', failUrl: 'https://a/f', cancelUrl: 'https://a/c', ipnUrl: 'https://a/i'
  });
  assert.match(session.redirectUrl, /^https:\/\/sandbox\.sslcommerz\.com\//);
  const sent = gateway.sessions[before];
  for (const [key, value] of Object.entries({
    store_id: 'saple-test-store', total_amount: '108.00', currency: 'BDT', tran_id: '11111111-1111-4111-8111-111111111111',
    success_url: 'https://a/s', fail_url: 'https://a/f', cancel_url: 'https://a/c', ipn_url: 'https://a/i',
    cus_name: 'Test', cus_email: 't@example.invalid', shipping_method: 'NO', product_category: 'Subscription', product_profile: 'general'
  })) assert.equal(sent.get(key), value, key);
  assert.equal(sent.get('product_name'), 'Saple Premium 1 Month');

  validPayment('22222222-2222-4222-8222-222222222222', 300, 'VAL-PARSE');
  const valid = await sslcommerz.validateTransaction(config, 'VAL-PARSE');
  assert.deepEqual([valid.valid, valid.tranId, valid.amount, valid.currency], [true, '22222222-2222-4222-8222-222222222222', 300, 'BDT']);
  const invalid = await sslcommerz.validateTransaction(config, 'VAL-UNKNOWN');
  assert.equal(invalid.valid, false);

  gateway.sessionFails = true;
  try {
    await assert.rejects(sslcommerz.createSession(config, { tranId: 'x', amount: 1 }), rejectsWith(502, 'GATEWAY_SESSION_FAILED'));
  } finally {
    gateway.sessionFails = false;
  }
});

// ---- Trial and entitlement ---------------------------------------------------

test('the one-day trial is claimed once, starts at once, and a second claim is refused', async () => {
  const access = await premiumService.startTrial(ids.alice);
  assert.equal(access.hasPremium, true);
  assert.equal(access.source, 'TRIAL');
  const claim = await one(`SELECT EXTRACT(EPOCH FROM ends_at - starts_at)::int AS seconds FROM premium_trial_claims WHERE user_id = $1`, [ids.alice]);
  assert.equal(claim.seconds, 24 * 3600);
  assert.equal((await one(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND notification_type = 'PREMIUM_TRIAL_STARTED'`, [ids.alice])).n, 1);

  await assert.rejects(premiumService.startTrial(ids.alice), rejectsWith(409, 'TRIAL_ALREADY_USED'));
  const http = await api('/api/premium/trial/start', { method: 'POST', token: tokens.alice });
  assert.equal(http.status, 409);
  assert.equal(http.json.detail.code, 'TRIAL_ALREADY_USED');
  await assert.rejects(premiumService.startTrial(ids.suspended), rejectsWith(403));
});

test('two simultaneous trial requests produce exactly one claim, and the key forbids a second row', async () => {
  const outcomes = await Promise.allSettled([premiumService.startTrial(ids.bob), premiumService.startTrial(ids.bob)]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find((outcome) => outcome.status === 'rejected').reason.sapleCode, 'TRIAL_ALREADY_USED');
  assert.equal((await one('SELECT COUNT(*)::int AS n FROM premium_trial_claims WHERE user_id = $1', [ids.bob])).n, 1);
  await assert.rejects(pg.query(`INSERT INTO premium_trial_claims (user_id, starts_at, ends_at)
    VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day')`, [ids.bob]), (error) => error.code === '23505');
});

test('an expired trial leaves the account on the free plan and not eligible again', async () => {
  await pg.query(`UPDATE premium_trial_claims SET starts_at = CURRENT_TIMESTAMP - INTERVAL '2 days',
    ends_at = CURRENT_TIMESTAMP - INTERVAL '1 day', claimed_at = CURRENT_TIMESTAMP - INTERVAL '2 days' WHERE user_id = $1`, [ids.alice]);
  const access = await premiumService.getPremiumAccess(ids.alice);
  assert.deepEqual([access.hasPremium, access.trialUsed, access.trialEligible], [false, true, false]);
  const status = await api('/api/premium/status', { token: tokens.alice });
  assert.equal(status.json.data.hasPremium, false);
  const fresh = await premiumService.getPremiumAccess(ids.dave);
  assert.deepEqual([fresh.hasPremium, fresh.trialEligible], [false, true]);
});

// ---- Checkout and settlement -------------------------------------------------

test('checkout records the payment before the gateway, and settlement is validated and idempotent', async () => {
  const checkout = await api('/api/premium/checkout', { method: 'POST', token: tokens.carol, body: { planCode: 'PREMIUM_1M' } });
  assert.equal(checkout.status, 201);
  const { publicId, redirectUrl } = checkout.json.data;
  assert.match(redirectUrl, /^https:\/\/sandbox\.sslcommerz\.com\//);
  const row = await one('SELECT status, final_amount_bdt AS amount FROM premium_payments WHERE public_id = $1', [publicId]);
  assert.notEqual(row.status, 'SUCCEEDED');
  assert.equal(Number(row.amount), 120);
  // The gateway's callback addresses point at Saple's own API.
  const sent = gateway.sessions.at(-1);
  assert.equal(sent.get('ipn_url'), 'https://saple.example.test/api/webhooks/payments/sslcommerz');
  assert.equal(sent.get('success_url'), `https://saple.example.test/api/premium/payments/${publicId}/return?result=success`);

  // "?result=success" alone grants nothing.
  const bare = await api(`/api/premium/payments/${publicId}/return?result=success`, { method: 'POST', form: {} });
  assert.equal(bare.status, 303);
  assert.equal(bare.location, `/payment-result.html?result=success&payment=${publicId}`);
  assert.equal((await premiumService.getPremiumAccess(ids.carol)).hasPremium, false);

  // A validation for a different transaction, or a different amount, is refused.
  validPayment('33333333-3333-4333-8333-333333333333', 120, 'VAL-OTHER');
  assert.equal((await premiumService.settlePremiumPayment({ valId: 'VAL-OTHER', expectedPublicId: publicId })).reason, 'TRANSACTION_MISMATCH');
  validPayment(publicId, 100, 'VAL-SHORT');
  assert.equal((await premiumService.settlePremiumPayment({ valId: 'VAL-SHORT' })).reason, 'AMOUNT_MISMATCH');
  assert.equal((await premiumService.getPremiumAccess(ids.carol)).hasPremium, false);

  // The real validation settles it, once.
  validPayment(publicId, 120, 'VAL-CAROL');
  const returned = await api(`/api/premium/payments/${publicId}/return?result=success`, { method: 'POST', form: { val_id: 'VAL-CAROL', tran_id: publicId } });
  assert.equal(returned.status, 303);
  const ipn = await api('/api/webhooks/payments/sslcommerz', { method: 'POST', form: { val_id: 'VAL-CAROL', tran_id: publicId, status: 'VALID' } });
  assert.equal(ipn.status, 200);
  assert.equal(ipn.json.data.settled, false);
  assert.equal((await premiumService.settlePremiumPayment({ valId: 'VAL-CAROL' })).reason, 'ALREADY_SETTLED');

  const periods = await pg.query(`SELECT EXTRACT(EPOCH FROM ends_at - starts_at)::int AS seconds FROM premium_access_periods WHERE user_id = $1`, [ids.carol]);
  assert.deepEqual(periods.rows.map((period) => period.seconds), [30 * 86400]);
  const settled = await one('SELECT status, gateway_validation_id AS "valId" FROM premium_payments WHERE public_id = $1', [publicId]);
  assert.deepEqual(settled, { status: 'SUCCEEDED', valId: 'VAL-CAROL' });
  assert.equal((await one(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND notification_type = 'PREMIUM_PURCHASE'`, [ids.carol])).n, 1);

  const access = await premiumService.getPremiumAccess(ids.carol);
  assert.deepEqual([access.hasPremium, access.source, access.planCode], [true, 'PAID', 'PREMIUM_1M']);
  const own = await api(`/api/premium/payments/${publicId}`, { token: tokens.carol });
  assert.equal(own.json.data.status, 'SUCCEEDED');
  assert.equal((await api(`/api/premium/payments/${publicId}`, { token: tokens.dave })).status, 404);
});

test('buying again stacks from the current end, and a trial cannot follow a purchase', async () => {
  const { publicId } = await premiumService.checkout(ids.carol, { planCode: 'PREMIUM_3M' });
  validPayment(publicId, 300, 'VAL-CAROL-2');
  assert.equal((await premiumService.handleIpn({ val_id: 'VAL-CAROL-2' })).settled, true);
  const periods = (await pg.query(`SELECT starts_at, ends_at, EXTRACT(EPOCH FROM ends_at - starts_at)::int AS seconds
    FROM premium_access_periods WHERE user_id = $1 ORDER BY starts_at`, [ids.carol])).rows;
  assert.equal(periods.length, 2);
  assert.equal(periods[1].starts_at.getTime(), periods[0].ends_at.getTime());
  assert.equal(periods[1].seconds, 90 * 86400);
  await assert.rejects(premiumService.startTrial(ids.carol), rejectsWith(409, 'TRIAL_NOT_ELIGIBLE'));

  // Paid days bought during a trial begin when the trial ends.
  const trialEnd = (await one('SELECT ends_at FROM premium_trial_claims WHERE user_id = $1', [ids.bob])).ends_at;
  const bob = await premiumService.checkout(ids.bob, { planCode: 'PREMIUM_1M' });
  validPayment(bob.publicId, 120, 'VAL-BOB');
  await premiumService.handleIpn({ val_id: 'VAL-BOB' });
  const bobPeriod = await one('SELECT starts_at FROM premium_access_periods WHERE user_id = $1', [ids.bob]);
  assert.equal(bobPeriod.starts_at.getTime(), trialEnd.getTime());
});

test('a failed or cancelled return, or a gateway failure, closes the payment and frees the code', async () => {
  await premiumService.createPromoCode({ userId: ids.admin }, { code: 'SAVE20', discountType: 'FIXED', discountValue: 20, maxRedemptions: 1 });

  gateway.sessionFails = true;
  await assert.rejects(premiumService.checkout(ids.erin, { planCode: 'PREMIUM_1M', promoCode: 'save20' }), rejectsWith(502));
  gateway.sessionFails = false;
  const failed = await one(`SELECT pp.status, r.status AS reservation FROM premium_payments pp
    JOIN premium_promo_redemptions r ON r.payment_id = pp.payment_id WHERE pp.user_id = $1`, [ids.erin]);
  assert.deepEqual(failed, { status: 'FAILED', reservation: 'RELEASED' });

  const { publicId } = await premiumService.checkout(ids.erin, { planCode: 'PREMIUM_1M', promoCode: 'SAVE20' });
  // The only redemption is now reserved, so nobody else can take it meanwhile.
  await assert.rejects(premiumService.quote(ids.frank, { planCode: 'PREMIUM_1M', promoCode: 'SAVE20' }), rejectsWith(400, 'PROMO_EXHAUSTED'));
  const cancelled = await api(`/api/premium/payments/${publicId}/return?result=cancel`, { method: 'POST', form: {} });
  assert.equal(cancelled.location, `/payment-result.html?result=cancel&payment=${publicId}`);
  const row = await one(`SELECT pp.status, r.status AS reservation FROM premium_payments pp
    JOIN premium_promo_redemptions r ON r.payment_id = pp.payment_id WHERE pp.public_id = $1`, [publicId]);
  assert.deepEqual(row, { status: 'CANCELLED', reservation: 'RELEASED' });
  assert.equal((await premiumService.quote(ids.frank, { planCode: 'PREMIUM_1M', promoCode: 'SAVE20' })).finalAmount, 100);
  assert.equal((await premiumService.getPremiumAccess(ids.erin)).hasPremium, false);
});

test('promo codes respect validity, plan, per-member and total limits, and redemption', async () => {
  await premiumService.createPromoCode({ userId: ids.admin }, { code: 'SIFAT10', discountType: 'PERCENT', discountValue: 10 });
  await premiumService.createPromoCode({ userId: ids.admin }, { code: 'THREEONLY', discountType: 'FIXED', discountValue: 30, applicablePlanCode: 'PREMIUM_3M' });
  await premiumService.createPromoCode({ userId: ids.admin }, { code: 'OLDCODE', discountType: 'FIXED', discountValue: 10 });
  await pg.query(`UPDATE premium_promo_codes SET valid_from = CURRENT_TIMESTAMP - INTERVAL '10 days',
    valid_until = CURRENT_TIMESTAMP - INTERVAL '1 day' WHERE code = 'OLDCODE'`);

  const quote = await premiumService.quote(ids.frank, { planCode: 'PREMIUM_1M', promoCode: ' sifat10 ' });
  assert.deepEqual([quote.baseAmount, quote.discountAmount, quote.finalAmount, quote.promoCode], [120, 12, 108, 'SIFAT10']);
  await assert.rejects(premiumService.quote(ids.frank, { planCode: 'PREMIUM_1M', promoCode: 'THREEONLY' }), rejectsWith(400, 'PROMO_PLAN_MISMATCH'));
  assert.equal((await premiumService.quote(ids.frank, { planCode: 'PREMIUM_3M', promoCode: 'THREEONLY' })).finalAmount, 270);
  await assert.rejects(premiumService.quote(ids.frank, { planCode: 'PREMIUM_1M', promoCode: 'OLDCODE' }), rejectsWith(400, 'PROMO_INVALID'));
  await assert.rejects(premiumService.quote(ids.frank, { planCode: 'PREMIUM_1M', promoCode: 'NOSUCHCODE' }), rejectsWith(400, 'PROMO_INVALID'));
  await assert.rejects(premiumService.quote(ids.frank, { planCode: 'PREMIUM_1M', promoCode: 'bad code!' }), rejectsWith(400, 'PROMO_INVALID'));

  // Checkout recalculates: the charged amount is the server's, and the code is
  // redeemed only when the payment settles.
  const { publicId, finalAmount } = await premiumService.checkout(ids.frank, { planCode: 'PREMIUM_1M', promoCode: 'SIFAT10' });
  assert.equal(finalAmount, 108);
  assert.equal(gateway.sessions.at(-1).get('total_amount'), '108.00');
  validPayment(publicId, 108, 'VAL-FRANK');
  await premiumService.handleIpn({ val_id: 'VAL-FRANK' });
  assert.equal((await one(`SELECT r.status FROM premium_promo_redemptions r JOIN premium_payments pp ON pp.payment_id = r.payment_id
    WHERE pp.public_id = $1`, [publicId])).status, 'REDEEMED');
  await assert.rejects(premiumService.quote(ids.frank, { planCode: 'PREMIUM_1M', promoCode: 'SIFAT10' }), rejectsWith(400, 'PROMO_USER_LIMIT'));

  // Deactivated codes stop working; only administrators manage codes.
  const [sifat] = (await premiumService.listPromoCodes()).filter((code) => code.code === 'SIFAT10');
  assert.equal(sifat.redeemedCount, 1);
  await premiumService.setPromoCodeActive(sifat.promoCodeId, { isActive: false });
  await assert.rejects(premiumService.quote(ids.dave, { planCode: 'PREMIUM_1M', promoCode: 'SIFAT10' }), rejectsWith(400, 'PROMO_INVALID'));
  assert.equal((await api('/api/admin/premium/promo-codes', { token: tokens.dave })).status, 403);
  assert.equal((await api('/api/admin/premium/promo-codes', { token: tokens.admin })).status, 200);
  const overview = await api('/api/admin/premium/overview', { token: tokens.admin });
  // Bob's paid days begin when his trial ends, so today he counts as a trial.
  assert.deepEqual([overview.json.data.activePaid, overview.json.data.activeTrials], [2, 1]);
  assert.doesNotMatch(JSON.stringify(overview.json.data), /test-only-store-password|VAL-|BANK-/);
});

test('checkout is refused cleanly when the gateway is not configured', async () => {
  const saved = process.env.SSLCOMMERZ_STORE_ID;
  delete process.env.SSLCOMMERZ_STORE_ID;
  try {
    const response = await api('/api/premium/checkout', { method: 'POST', token: tokens.dave, body: { planCode: 'PREMIUM_1M' } });
    assert.equal(response.status, 503);
    assert.equal(response.json.detail.code, 'PAYMENTS_NOT_CONFIGURED');
    assert.equal((await one('SELECT COUNT(*)::int AS n FROM premium_payments WHERE user_id = $1', [ids.dave])).n, 0);
  } finally {
    process.env.SSLCOMMERZ_STORE_ID = saved;
  }
});

// ---- Gates -------------------------------------------------------------------

test('interview questions: a preview for free visitors, the full text for Premium', async () => {
  for (const token of [undefined, tokens.dave]) {
    const response = await api('/api/interviews', { token });
    const [item] = response.json.data;
    assert.equal(item.questionsLocked, true);
    assert.equal('questionsSummary' in item, false);
    assert.ok(item.questionsPreview.length < ids.questions.length);
    assert.doesNotMatch(JSON.stringify(response.json), /production incident/);
    const company = await api(`/api/companies/${ids.company}/interviews`, { token });
    assert.equal('questionsSummary' in company.json.data[0], false);
  }
  const premium = await api('/api/interviews', { token: tokens.carol });
  assert.equal(premium.json.data[0].questionsSummary, ids.questions);
  assert.equal(premium.json.data[0].questionsLocked, false);
  const admin = await api('/api/interviews', { token: tokens.admin });
  assert.equal(admin.json.data[0].questionsSummary, ids.questions);
});

test('administrator feature access is independent of payment, trial and public badge', async () => {
  const status = await api('/api/premium/status', { token: tokens.admin });
  assert.equal(status.status, 200);
  assert.equal(status.json.data.hasPremium, false);
  assert.equal(status.json.data.featureAccess, true);
  assert.equal(status.json.data.administratorAccess, true);
  const resume = await api('/api/resume/status', { token: tokens.admin });
  assert.equal(resume.status, 200);
  assert.equal(resume.json.data.pdfAvailable, true);
  assert.equal((await api('/api/me/profile-viewers', { token: tokens.admin })).status, 200);
  assert.equal((await premiumService.hasPremiumFeatureAccess(ids.dave)), false);
  assert.equal((await premiumService.hasPremiumFeatureAccess(ids.carol)), true);
  assert.equal((await premiumService.hasPremiumFeatureAccess(ids.bob)), true);
  assert.equal((await one('SELECT COUNT(*)::int AS n FROM premium_payments WHERE user_id = $1', [ids.admin])).n, 0);
  assert.equal((await one('SELECT COUNT(*)::int AS n FROM premium_trial_claims WHERE user_id = $1', [ids.admin])).n, 0);
  assert.equal((await api(`/api/users/${ids.admin}/profile`)).json.data.user.premiumBadge, null);
});

test('Premium vacancies: a teaser without details for free visitors, full access for Premium and the owning company', async () => {
  const teaserKeys = ['accessLevel', 'companyId', 'companyName', 'employmentType', 'industry', 'jobId', 'location',
    'locked', 'logoUrl', 'publishedAt', 'title', 'workMode'];
  for (const token of [undefined, tokens.dave]) {
    const detail = await api(`/api/jobs/${ids.premiumJob}`, { token });
    assert.deepEqual(Object.keys(detail.json.data).sort(), teaserKeys);
    assert.equal(detail.json.data.locked, true);
    const list = await api('/api/jobs', { token });
    const listed = list.json.data.items.find((job) => job.jobId === ids.premiumJob);
    assert.deepEqual(Object.keys(listed).sort(), teaserKeys);
    assert.doesNotMatch(JSON.stringify(listed), /150000|data platform for our customers/);
    assert.equal(list.json.data.items.find((job) => job.jobId === ids.freeJob).locked, false);
  }
  for (const token of [tokens.carol, tokens.rep, tokens.admin]) {
    const detail = await api(`/api/jobs/${ids.premiumJob}`, { token });
    assert.notEqual(detail.json.data.locked, true);
    assert.match(detail.json.data.description, /data platform/);
    assert.equal(detail.json.data.accessLevel, 'PREMIUM');
  }

  const coverLetter = 'I have built streaming data platforms for four years and would like to help.';
  const refused = await api(`/api/jobs/${ids.premiumJob}/applications`, { method: 'POST', token: tokens.dave, body: { coverLetter } });
  assert.equal(refused.status, 403);
  assert.equal(refused.json.detail.code, 'PREMIUM_REQUIRED');
  await assert.rejects(applicationService.applyToJob({ userId: ids.alice, role: 'USER' }, ids.premiumJob, { coverLetter }), rejectsWith(403));
  assert.equal((await api(`/api/jobs/${ids.freeJob}/applications`, { method: 'POST', token: tokens.dave, body: { coverLetter } })).status, 201);
  assert.equal((await api(`/api/jobs/${ids.premiumJob}/applications`, { method: 'POST', token: tokens.carol, body: { coverLetter } })).status, 201);
});

test('the badge follows active Premium and appears on profiles, search and the talent list', async () => {
  const profile = await api(`/api/users/${ids.carol}/profile`);
  assert.deepEqual(profile.json.data.user.premiumBadge, { premium: true, label: 'Premium Saple member' });
  assert.equal((await api(`/api/users/${ids.alice}/profile`)).json.data.user.premiumBadge, null);
  // Bob has paid days queued after his trial; until then his badge says trial.
  assert.equal((await api(`/api/users/${ids.bob}/profile`)).json.data.user.premiumBadge.label, 'Premium trial');
  const search = await api('/api/search?q=Carol', { token: tokens.dave });
  assert.match(JSON.stringify(search.json.data), /Premium Saple member/);
  assert.doesNotMatch(JSON.stringify(search.json.data), /endsAt|ends_at/);
});

test('profile views: one per viewer per day, never anonymous or self, identities for Premium only', async () => {
  await api(`/api/users/${ids.dave}/profile`, { token: tokens.carol });
  await api(`/api/users/${ids.dave}/profile`, { token: tokens.carol });
  await api(`/api/users/${ids.dave}/profile`, { token: tokens.rep });
  await api(`/api/users/${ids.dave}/profile`);
  await api(`/api/users/${ids.dave}/profile`, { token: tokens.dave });
  const rows = (await pg.query('SELECT viewer_user_id AS viewer, view_count AS count FROM profile_views WHERE profile_user_id = $1 ORDER BY viewer_user_id', [ids.dave])).rows;
  assert.deepEqual(rows, [{ viewer: ids.rep, count: 1 }, { viewer: ids.carol, count: 2 }].sort((a, b) => a.viewer - b.viewer));

  const summary = await api('/api/me/profile-view-summary', { token: tokens.dave });
  assert.deepEqual(summary.json.data, { signedInViewersLast30Days: 2, totalViewEventsLast30Days: 3, canSeeIdentities: false });
  assert.doesNotMatch(JSON.stringify(summary.json), /Carol|Rafi/);
  const denied = await api('/api/me/profile-viewers', { token: tokens.dave });
  assert.equal(denied.status, 403);
  assert.equal(denied.json.detail.code, 'PREMIUM_REQUIRED');

  await api(`/api/users/${ids.carol}/profile`, { token: tokens.dave });
  const viewers = await api('/api/me/profile-viewers', { token: tokens.carol });
  assert.equal(viewers.status, 200);
  assert.deepEqual(Object.keys(viewers.json.data.items[0]).sort(), ['avatarUrl', 'fullName', 'headline', 'lastViewedAt', 'premiumBadge', 'userId']);
  assert.equal(viewers.json.data.items[0].fullName, 'Dave Free');
});

test('Discover Talent lists Premium members first, with public fields only, for representatives', async () => {
  assert.equal((await api('/api/representative/talent', { token: tokens.dave })).status, 403);
  const response = await api('/api/representative/talent', { token: tokens.rep });
  assert.equal(response.status, 200);
  const items = response.json.data.items;
  const firstFree = items.findIndex((item) => !item.promoted);
  assert.ok(firstFree > 0);
  assert.ok(items.slice(firstFree).every((item) => !item.promoted));
  for (const item of items) {
    assert.deepEqual(Object.keys(item).sort(), ['avatarUrl', 'bioExcerpt', 'fullName', 'headline', 'premiumBadge',
      'profileCompleteness', 'promoted', 'skills', 'userId']);
  }
  assert.doesNotMatch(JSON.stringify(response.json), /@example\.invalid|password|score|rank/i);
  assert.equal(items.some((item) => item.userId === ids.suspended), false);
});

// ---- Saple Guide tiers and the resume generator -----------------------------------

const GUIDE_CONFIG = () => ({ apiKey: 'test-key', baseUrl: AI_BASE, model: 'guide-model', timeoutMs: 5000, maxOutputTokens: 400 });
const RESUME_TEXT = 'Carol Rahman. Product designer at Pathao from 2022 to 2025 in Dhaka. Skills: Figma, user research. BSc in CSE from BUET.';
const RESUME_REPLY = '```json\n' + JSON.stringify({
  name: 'Carol Rahman', headline: 'Product designer', summary: 'Designer focused on research.',
  skills: ['Figma', 'User research', 'Kubernetes'],
  experience: [
    { title: 'Product designer', organization: 'Pathao', location: 'Dhaka', start: '2022', end: '2025', highlights: ['Designed flows'] },
    { title: 'Head of Design', organization: 'Google', start: '2019', end: '2021', highlights: [] }
  ],
  education: [{ institution: 'BUET', degree: 'BSc', field: 'CSE', start: null, end: null, details: null }],
  projects: [{ name: 'Invented Project', description: 'Not real', highlights: [] }]
}) + '\n```';

async function withAi(work, env = {}) {
  const saved = Object.fromEntries(['PREMIUM_AI_MODEL', 'PREMIUM_RESUME_DAILY_LIMIT', 'RESUME_FREE_DAILY_LIMIT']
    .map((key) => [key, process.env[key]]));
  Object.assign(process.env, { PREMIUM_AI_MODEL: 'test-premium-model', ...env });
  aiConfig.getAiConfig = GUIDE_CONFIG;
  aiRequests.length = 0;
  try {
    await work();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    aiConfig.getAiConfig = realGetAiConfig;
    aiFailModel = null;
  }
}

async function ask(token, question = 'How do I negotiate my salary?') {
  return api('/api/assistant/messages', { method: 'POST', token, body: { messages: [{ role: 'user', content: question }] } });
}

test('the one Saple Guide answers free members with the standard model and Premium or trial members with the Premium model', async () => {
  await withAi(async () => {
    aiReply = 'Bring approved salary ranges to the conversation.';
    const free = await ask(tokens.dave);
    assert.equal(free.status, 200);
    assert.deepEqual([free.json.data.tier, free.json.data.premiumMember], ['STANDARD', false]);
    assert.equal(aiRequests.at(-1).model, 'guide-model');

    const paid = await ask(tokens.carol);
    assert.deepEqual([paid.json.data.tier, paid.json.data.premiumMember], ['PREMIUM', true]);
    assert.equal(aiRequests.at(-1).model, 'test-premium-model');
    assert.match(aiRequests.at(-1).messages[0].content, /Premium mode/);

    const trial = await ask(tokens.bob);
    assert.equal(trial.json.data.tier, 'PREMIUM');
    assert.equal(aiRequests.at(-1).model, 'test-premium-model');

    // An expired trial is back on the standard guide with no sign-in change.
    const expired = await ask(tokens.alice);
    assert.equal(expired.json.data.tier, 'STANDARD');
    assert.equal(aiRequests.at(-1).model, 'guide-model');

    // Signed out, and a client claiming Premium, both get the standard guide.
    const anonymous = await api('/api/assistant/messages', { method: 'POST', body: { tier: 'PREMIUM', messages: [{ role: 'user', content: 'Hi' }] } });
    assert.equal(anonymous.json.data.tier, 'STANDARD');

    // Usage metadata only: the conversation itself is never stored.
    const usage = (await pg.query(`SELECT * FROM premium_ai_usage WHERE feature_type = 'ADVANCED_CHAT'`)).rows;
    assert.ok(usage.length >= 2);
    assert.doesNotMatch(JSON.stringify(usage), /negotiate|salary ranges/i);

    const status = await api('/api/assistant/status', { token: tokens.carol });
    assert.equal(status.json.data.tier, 'PREMIUM');
    assert.equal((await api('/api/assistant/status')).json.data.tier, 'STANDARD');
  });
});

test('a failing or missing Premium model falls back to the standard guide', async () => {
  await withAi(async () => {
    aiReply = 'Here is a standard answer.';
    aiFailModel = 'test-premium-model';
    const response = await ask(tokens.carol);
    assert.equal(response.status, 200);
    assert.deepEqual([response.json.data.tier, response.json.data.source, response.json.data.answer],
      ['STANDARD', 'AI', 'Here is a standard answer.']);
    assert.deepEqual(aiRequests.slice(-2).map((request) => request.model), ['test-premium-model', 'guide-model']);
  });
  await withAi(async () => {
    delete process.env.PREMIUM_AI_MODEL;
    aiReply = 'Standard.';
    const response = await ask(tokens.carol);
    assert.deepEqual([response.json.data.tier, response.json.data.premiumMember], ['STANDARD', true]);
    assert.equal(aiRequests.at(-1).model, 'guide-model');
  }, { PREMIUM_AI_MODEL: '' });
});

test('the old Premium-only AI routes are gone', async () => {
  assert.equal((await api('/api/premium/ai/chat', { method: 'POST', token: tokens.carol, body: { message: 'Hi' } })).status, 404);
  assert.equal((await api('/api/premium/resume/generate', { method: 'POST', token: tokens.carol, body: { text: 'x'.repeat(60) } })).status, 404);
});

test('every signed-in member can generate a full resume, without invented facts and without storing the text', async () => {
  assert.equal((await api('/api/resume/generate', { method: 'POST', body: { text: RESUME_TEXT } })).status, 401);
  await withAi(async () => {
    aiReply = RESUME_REPLY;
    const status = await api('/api/resume/status', { token: tokens.dave });
    assert.deepEqual([status.json.data.premium, status.json.data.pdfAvailable, status.json.data.dailyLimit], [false, false, 3]);

    const response = await api('/api/resume/generate', { method: 'POST', token: tokens.dave, body: { text: RESUME_TEXT, style: 'concise' } });
    assert.equal(response.status, 200);
    const { resume, pdfAvailable, remaining } = response.json.data;
    assert.deepEqual([pdfAvailable, remaining], [false, 2]);
    assert.equal(resume.name, 'Carol Rahman');
    assert.equal(resume.summary, 'Designer focused on research.');
    assert.deepEqual(resume.skills, ['Figma', 'User research']);
    assert.deepEqual(resume.experience.map((item) => item.organization), ['Pathao']);
    assert.deepEqual(resume.projects, []);
    assert.equal(resume.education[0].institution, 'BUET');

    const usage = (await pg.query(`SELECT * FROM premium_ai_usage WHERE user_id = $1 AND feature_type = 'RESUME_GENERATION'`, [ids.dave])).rows;
    assert.equal(usage.length, 1);
    assert.doesNotMatch(JSON.stringify(usage), /Pathao|Carol Rahman|Figma/);
  });
  assert.match(resumeService.RESUME_SYSTEM_PROMPT, /Use ONLY facts/);
  assert.match(resumeService.RESUME_SYSTEM_PROMPT, /Never invent/);
  assert.match(resumeService.RESUME_SYSTEM_PROMPT, /omit it/);
  assert.equal(resumeService.parseResumeJson('not json'), null);
});

test('daily resume allowances are enforced on the server: 3 free, 10 Premium by default', async () => {
  await withAi(async () => {
    aiReply = RESUME_REPLY;
    // Dave already used one today; with a free limit of 2 he has one more.
    assert.equal((await api('/api/resume/generate', { method: 'POST', token: tokens.dave, body: { text: RESUME_TEXT } })).status, 200);
    const limited = await api('/api/resume/generate', { method: 'POST', token: tokens.dave, body: { text: RESUME_TEXT } });
    assert.equal(limited.status, 429);
    assert.equal(limited.json.detail.code, 'RESUME_DAILY_LIMIT');

    assert.equal((await api('/api/resume/status', { token: tokens.carol })).json.data.dailyLimit, 1);
    assert.equal((await api('/api/resume/generate', { method: 'POST', token: tokens.carol, body: { text: RESUME_TEXT } })).status, 200);
    const premiumLimited = await api('/api/resume/generate', { method: 'POST', token: tokens.carol, body: { text: RESUME_TEXT } });
    assert.equal(premiumLimited.json.detail.code, 'RESUME_DAILY_LIMIT');
  }, { RESUME_FREE_DAILY_LIMIT: '2', PREMIUM_RESUME_DAILY_LIMIT: '1' });
  const limits = require('../config/payment').getPremiumAiLimits();
  assert.deepEqual([limits.freeResumePerDay, limits.resumePerDay], [3, 10]);
});

test('the official PDF export is Premium and trial only, and returns a real PDF', async () => {
  const resume = {
    name: 'Carol Rahman', headline: 'Product designer',
    experience: [{ title: 'Product designer', organization: 'Pathao', start: '2022', end: '2025', highlights: ['Designed (core) flows \\ checkout'] }],
    skills: ['Figma']
  };
  const download = (token) => realFetch(`${baseUrl}/api/resume/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ resume })
  });
  assert.equal((await download(null)).status, 401);
  const free = await download(tokens.dave);
  assert.equal(free.status, 403);
  assert.equal((await free.json()).detail.code, 'PREMIUM_REQUIRED');
  assert.equal((await download(tokens.alice)).status, 403, 'an expired trial is locked again');

  for (const token of [tokens.carol, tokens.bob]) {
    const response = await download(token);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="Saple_Resume_Carol.pdf"');
    assert.match(response.headers.get('cache-control'), /no-store/);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-');
    const text = bytes.toString('latin1');
    assert.match(text, /\(Carol Rahman\) Tj/);
    assert.match(text, /Designed \\\(core\\\) flows \\\\ checkout/);
    assert.match(text, /%%EOF\n$/);
  }
  const empty = await realFetch(`${baseUrl}/api/resume/pdf`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.carol}` }, body: JSON.stringify({ resume: {} })
  });
  assert.equal(empty.status, 400);
});
