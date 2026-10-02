const database = require('../config/database');

// Every Premium decision uses the database clock (CURRENT_TIMESTAMP), never
// the browser's or the server's own time. Money-changing statements run on
// the cloud database only: the independent local fallback never holds a
// payment or an entitlement.

const RESERVATION_MINUTES = 30;
const ACTIVE_RESERVATION = `(r.status = 'REDEEMED' OR (r.status = 'RESERVED'
  AND r.reserved_at > CURRENT_TIMESTAMP - INTERVAL '${RESERVATION_MINUTES} minutes'))`;

// ---- Entitlement -----------------------------------------------------------

async function findAccess(userId) {
  const result = await database.query(`
    SELECT u.account_status AS "accountStatus",
      t.user_id IS NOT NULL AS "trialUsed",
      t.starts_at AS "trialStartsAt", t.ends_at AS "trialEndsAt",
      COALESCE(t.revoked_at IS NULL AND t.starts_at <= CURRENT_TIMESTAMP AND t.ends_at > CURRENT_TIMESTAMP, FALSE) AS "trialActive",
      paid.plan_code AS "paidPlanCode", paid.source_type AS "paidSource", paid.starts_at AS "paidStartsAt",
      (SELECT MAX(ap.ends_at) FROM premium_access_periods ap
        WHERE ap.user_id = u.user_id AND ap.revoked_at IS NULL AND ap.ends_at > CURRENT_TIMESTAMP) AS "paidEndsAt",
      (EXISTS (SELECT 1 FROM premium_access_periods ap WHERE ap.user_id = u.user_id)
        OR EXISTS (SELECT 1 FROM premium_payments pp WHERE pp.user_id = u.user_id AND pp.status = 'SUCCEEDED'))
        AS "hasPaidHistory"
    FROM users u
    LEFT JOIN premium_trial_claims t ON t.user_id = u.user_id
    LEFT JOIN LATERAL (
      SELECT p.plan_code, ap.source_type, ap.starts_at
      FROM premium_access_periods ap
      JOIN premium_plans p ON p.plan_id = ap.plan_id
      WHERE ap.user_id = u.user_id AND ap.revoked_at IS NULL
        AND ap.starts_at <= CURRENT_TIMESTAMP AND ap.ends_at > CURRENT_TIMESTAMP
      ORDER BY ap.ends_at DESC
      LIMIT 1
    ) paid ON TRUE
    WHERE u.user_id = $1
  `, [userId]);
  return result.rows[0] || null;
}

// Badge source for many accounts at once: 'PAID', 'TRIAL' or absent.
async function findBadgeSources(userIds) {
  if (!userIds.length) return [];
  const result = await database.query(`
    SELECT u.user_id AS "userId",
      CASE
        WHEN EXISTS (SELECT 1 FROM premium_access_periods ap WHERE ap.user_id = u.user_id
          AND ap.revoked_at IS NULL AND ap.starts_at <= CURRENT_TIMESTAMP AND ap.ends_at > CURRENT_TIMESTAMP)
          THEN (SELECT CASE WHEN ap.source_type = 'ADMIN_GRANT' THEN 'ADMIN_GRANT' ELSE 'PAID' END
            FROM premium_access_periods ap WHERE ap.user_id = u.user_id AND ap.revoked_at IS NULL
              AND ap.starts_at <= CURRENT_TIMESTAMP AND ap.ends_at > CURRENT_TIMESTAMP
            ORDER BY ap.ends_at DESC LIMIT 1)
        WHEN EXISTS (SELECT 1 FROM premium_trial_claims t WHERE t.user_id = u.user_id
          AND t.revoked_at IS NULL AND t.starts_at <= CURRENT_TIMESTAMP AND t.ends_at > CURRENT_TIMESTAMP) THEN 'TRIAL'
      END AS source
    FROM users u
    WHERE u.user_id = ANY($1::bigint[]) AND u.account_status = 'ACTIVE'
  `, [userIds]);
  return result.rows.filter((row) => row.source);
}

// ---- One-day trial ---------------------------------------------------------

// Returns { claimed, reason }. The user row lock queues concurrent requests
// from the same account, and the primary key on premium_trial_claims makes a
// second trial impossible even if that lock were bypassed.
async function claimTrial(userId) {
  return database.withCloudTransaction(async (client) => {
    const user = (await client.query(
      'SELECT account_status AS "accountStatus" FROM users WHERE user_id = $1 FOR UPDATE',
      [userId]
    )).rows[0];
    if (!user || user.accountStatus !== 'ACTIVE') return { claimed: false, reason: 'ACCOUNT_INACTIVE' };

    const existing = await client.query('SELECT 1 FROM premium_trial_claims WHERE user_id = $1', [userId]);
    if (existing.rows[0]) return { claimed: false, reason: 'TRIAL_ALREADY_USED' };

    const paid = await client.query(`
      SELECT (EXISTS (SELECT 1 FROM premium_access_periods WHERE user_id = $1)
        OR EXISTS (SELECT 1 FROM premium_payments WHERE user_id = $1 AND status = 'SUCCEEDED')) AS "paid"
    `, [userId]);
    if (paid.rows[0].paid) return { claimed: false, reason: 'TRIAL_NOT_ELIGIBLE' };

    const inserted = await client.query(`
      INSERT INTO premium_trial_claims (user_id, claimed_at, starts_at, ends_at)
      VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '24 hours')
      ON CONFLICT (user_id) DO NOTHING
      RETURNING starts_at AS "startsAt", ends_at AS "endsAt"
    `, [userId]);
    if (!inserted.rows[0]) return { claimed: false, reason: 'TRIAL_ALREADY_USED' };

    await client.query(`
      INSERT INTO notifications (user_id, notification_type, title, message, related_entity_type, related_entity_id)
      VALUES ($1, 'PREMIUM_TRIAL_STARTED', 'Your Premium trial has started',
        'You have 24 hours of Premium access. The trial can be used once per account.', 'ACCOUNT', $1)
    `, [userId]);
    return { claimed: true, ...inserted.rows[0] };
  });
}

// ---- Plans and promo codes ------------------------------------------------

const PLAN_COLUMNS = `plan_id AS "planId", plan_code AS "planCode", name,
  duration_days AS "durationDays", price_bdt AS "priceBdt", is_active AS "isActive", sort_order AS "sortOrder"`;

async function findActivePlans() {
  const result = await database.query(`SELECT ${PLAN_COLUMNS} FROM premium_plans WHERE is_active ORDER BY sort_order, plan_id`);
  return result.rows;
}

async function findPlanByCode(planCode, client = database) {
  const result = await client.query(`SELECT ${PLAN_COLUMNS} FROM premium_plans WHERE plan_code = $1`, [planCode]);
  return result.rows[0] || null;
}

const PROMO_COLUMNS = `promo_code_id AS "promoCodeId", code, description, discount_type AS "discountType",
  discount_value AS "discountValue", max_discount_bdt AS "maxDiscountBdt",
  applicable_plan_code AS "applicablePlanCode", max_redemptions AS "maxRedemptions",
  per_user_limit AS "perUserLimit", valid_from AS "validFrom", valid_until AS "validUntil",
  is_active AS "isActive",
  valid_from <= CURRENT_TIMESTAMP AS "hasStarted",
  (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP) AS "notExpired"`;

async function findPromo(code, client = database, { lock = false } = {}) {
  const result = await client.query(
    `SELECT ${PROMO_COLUMNS} FROM premium_promo_codes WHERE code = $1${lock ? ' FOR UPDATE' : ''}`,
    [code]
  );
  return result.rows[0] || null;
}

// Uses that count against a code's limits: redeemed ones, and reservations
// less than 30 minutes old (a checkout still in progress).
async function findPromoUsage(promoCodeId, userId, client = database) {
  const result = await client.query(`
    SELECT COUNT(*) FILTER (WHERE ${ACTIVE_RESERVATION})::int AS total,
      COUNT(*) FILTER (WHERE r.user_id = $2 AND ${ACTIVE_RESERVATION})::int AS "forUser"
    FROM premium_promo_redemptions r
    WHERE r.promo_code_id = $1
  `, [promoCodeId, userId]);
  return result.rows[0];
}

async function releaseStaleReservations(promoCodeId, client) {
  await client.query(`
    UPDATE premium_promo_redemptions r
    SET status = 'RELEASED', released_at = CURRENT_TIMESTAMP
    WHERE r.promo_code_id = $1 AND r.status = 'RESERVED'
      AND r.reserved_at <= CURRENT_TIMESTAMP - INTERVAL '${RESERVATION_MINUTES} minutes'
  `, [promoCodeId]);
}

// ---- Checkout and settlement ------------------------------------------------

async function withCloudTransaction(work) {
  return database.withCloudTransaction(work);
}

async function insertPayment(client, payment) {
  const result = await client.query(`
    INSERT INTO premium_payments (user_id, plan_id, promo_code_id, base_amount_bdt, discount_amount_bdt, final_amount_bdt)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING payment_id AS "paymentId", public_id::text AS "publicId"
  `, [payment.userId, payment.planId, payment.promoCodeId, payment.baseAmount, payment.discountAmount, payment.finalAmount]);
  return result.rows[0];
}

async function insertReservation(client, reservation) {
  await client.query(`
    INSERT INTO premium_promo_redemptions (promo_code_id, user_id, payment_id, discount_amount_bdt)
    VALUES ($1, $2, $3, $4)
  `, [reservation.promoCodeId, reservation.userId, reservation.paymentId, reservation.discountAmount]);
}

async function markSessionCreated(paymentId, sessionKey) {
  await database.withCloudTransaction((client) => client.query(`
    UPDATE premium_payments SET status = 'PENDING', gateway_session_key = $2, updated_at = CURRENT_TIMESTAMP
    WHERE payment_id = $1 AND status = 'INITIATED'
  `, [paymentId, sessionKey]));
}

// Closes a payment that has not succeeded (gateway error, failure, cancel)
// and frees its promo reservation. A later verified success still settles.
async function closeOpenPayment(publicId, status) {
  return database.withCloudTransaction(async (client) => {
    const closed = await client.query(`
      UPDATE premium_payments SET status = $2, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE public_id = $1::uuid AND status IN ('INITIATED', 'PENDING')
      RETURNING payment_id AS "paymentId"
    `, [publicId, status]);
    if (closed.rows[0]) {
      await client.query(`
        UPDATE premium_promo_redemptions SET status = 'RELEASED', released_at = CURRENT_TIMESTAMP
        WHERE payment_id = $1 AND status = 'RESERVED'
      `, [closed.rows[0].paymentId]);
    }
    return Boolean(closed.rows[0]);
  });
}

async function findPaymentForUpdate(client, publicId) {
  const result = await client.query(`
    SELECT pp.payment_id AS "paymentId", pp.public_id::text AS "publicId", pp.user_id AS "userId",
      pp.plan_id AS "planId", pp.status, pp.final_amount_bdt AS "finalAmountBdt",
      p.duration_days AS "durationDays", p.name AS "planName", p.plan_code AS "planCode"
    FROM premium_payments pp
    JOIN premium_plans p ON p.plan_id = pp.plan_id
    WHERE pp.public_id = $1::uuid
    FOR UPDATE OF pp
  `, [publicId]);
  return result.rows[0] || null;
}

// Settles one verified payment inside the caller's transaction. The start is
// the later of now and the account's current access end (paid or trial), so a
// purchase while active extends rather than overlaps. ON CONFLICT on the
// unique payment_id is the last guard against granting time twice.
async function grantPaidAccess(client, payment, gateway) {
  await client.query('SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE', [payment.userId]);
  await client.query(`
    UPDATE premium_payments SET status = 'SUCCEEDED', completed_at = CURRENT_TIMESTAMP,
      gateway_transaction_id = $2, gateway_validation_id = $3, updated_at = CURRENT_TIMESTAMP
    WHERE payment_id = $1
  `, [payment.paymentId, gateway.transactionId, gateway.validationId]);
  await client.query(`
    UPDATE premium_promo_redemptions SET status = 'REDEEMED', redeemed_at = CURRENT_TIMESTAMP, released_at = NULL
    WHERE payment_id = $1 AND status <> 'REDEEMED'
  `, [payment.paymentId]);
  const access = await client.query(`
    INSERT INTO premium_access_periods (user_id, plan_id, payment_id, starts_at, ends_at)
    SELECT $1, $2, $3, s.start_at, s.start_at + make_interval(days => $4::int)
    FROM (
      SELECT GREATEST(
        CURRENT_TIMESTAMP,
        COALESCE((SELECT MAX(ends_at) FROM premium_access_periods WHERE user_id = $1 AND revoked_at IS NULL), CURRENT_TIMESTAMP),
        COALESCE((SELECT ends_at FROM premium_trial_claims WHERE user_id = $1 AND revoked_at IS NULL), CURRENT_TIMESTAMP)
      ) AS start_at
    ) s
    ON CONFLICT (payment_id) DO NOTHING
    RETURNING starts_at AS "startsAt", ends_at AS "endsAt"
  `, [payment.userId, payment.planId, payment.paymentId, payment.durationDays]);
  if (access.rows[0]) {
    await client.query(`
      INSERT INTO notifications (user_id, notification_type, title, message, related_entity_type, related_entity_id)
      VALUES ($1, 'PREMIUM_PURCHASE', 'Premium is active', $2, 'ACCOUNT', $1)
    `, [payment.userId, `Thank you. ${payment.planName} has been added to your account. Prepaid access, no automatic renewal.`]);
  }
  return access.rows[0] || null;
}

async function findOwnPayment(userId, publicId) {
  const result = await database.cloudQuery(`
    SELECT pp.public_id::text AS "publicId", pp.status, p.plan_code AS "planCode", p.name AS "planName",
      p.duration_days AS "durationDays", pp.base_amount_bdt AS "baseAmount",
      pp.discount_amount_bdt AS "discountAmount", pp.final_amount_bdt AS "finalAmount",
      pp.initiated_at AS "initiatedAt", pp.completed_at AS "completedAt",
      ap.starts_at AS "accessStartsAt", ap.ends_at AS "accessEndsAt"
    FROM premium_payments pp
    JOIN premium_plans p ON p.plan_id = pp.plan_id
    LEFT JOIN premium_access_periods ap ON ap.payment_id = pp.payment_id
    WHERE pp.public_id = $1::uuid AND pp.user_id = $2
  `, [publicId, userId]);
  return result.rows[0] || null;
}

// ---- Profile views ------------------------------------------------------

async function recordProfileView(profileUserId, viewerUserId) {
  await database.withTransaction((client) => client.query(`
    INSERT INTO profile_views (profile_user_id, viewer_user_id)
    SELECT $1, $2 WHERE $1::bigint <> $2::bigint
    ON CONFLICT (profile_user_id, viewer_user_id, view_date)
    DO UPDATE SET last_viewed_at = CURRENT_TIMESTAMP, view_count = profile_views.view_count + 1
  `, [profileUserId, viewerUserId]));
}

async function findViewSummary(userId) {
  const result = await database.query(`
    SELECT COUNT(DISTINCT pv.viewer_user_id)::int AS "signedInViewersLast30Days",
      COALESCE(SUM(pv.view_count), 0)::int AS "totalViewEventsLast30Days"
    FROM profile_views pv
    JOIN users v ON v.user_id = pv.viewer_user_id AND v.account_status = 'ACTIVE'
    WHERE pv.profile_user_id = $1 AND pv.view_date >= CURRENT_DATE - 29
  `, [userId]);
  return result.rows[0];
}

async function findViewers(userId, { limit, offset }) {
  const [rows, total] = await Promise.all([
    database.query(`
      SELECT v.user_id AS "userId", v.full_name AS "fullName", v.avatar_path AS "avatarPath",
        v.updated_at AS "updatedAt", v.headline, MAX(pv.last_viewed_at) AS "lastViewedAt"
      FROM profile_views pv
      JOIN users v ON v.user_id = pv.viewer_user_id AND v.account_status = 'ACTIVE'
      WHERE pv.profile_user_id = $1 AND pv.view_date >= CURRENT_DATE - 29
      GROUP BY v.user_id
      ORDER BY MAX(pv.last_viewed_at) DESC, v.user_id
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]),
    database.query(`
      SELECT COUNT(DISTINCT pv.viewer_user_id)::int AS total
      FROM profile_views pv
      JOIN users v ON v.user_id = pv.viewer_user_id AND v.account_status = 'ACTIVE'
      WHERE pv.profile_user_id = $1 AND pv.view_date >= CURRENT_DATE - 29
    `, [userId])
  ]);
  return { items: rows.rows, total: total.rows[0].total };
}

// ---- Premium AI usage ------------------------------------------------------

async function countAiUsageToday(userId, featureType) {
  const result = await database.query(`
    SELECT COUNT(*)::int AS used FROM premium_ai_usage
    WHERE user_id = $1 AND feature_type = $2 AND created_at >= date_trunc('day', CURRENT_TIMESTAMP)
  `, [userId, featureType]);
  return result.rows[0].used;
}

async function recordAiUsage({ userId, featureType, model, inputTokens = null, outputTokens = null }) {
  await database.withTransaction((client) => client.query(`
    INSERT INTO premium_ai_usage (user_id, feature_type, model, input_tokens, output_tokens)
    VALUES ($1, $2, $3, $4, $5)
  `, [userId, featureType, model, inputTokens, outputTokens]));
}

// ---- Recruiter talent list -------------------------------------------------

// Order is visibility only: active Premium first, then how complete the
// profile is, then how recently it changed. Nothing here scores a person.
async function findTalent({ excludeUserId, search = null, limit, offset }) {
  const params = [excludeUserId, search ? `%${search}%` : null, limit, offset];
  const result = await database.query(`
    WITH profiles AS (
      SELECT u.user_id, u.full_name, u.avatar_path, u.updated_at, u.headline, u.bio,
        (u.headline IS NOT NULL)::int + (u.bio IS NOT NULL)::int + (u.avatar_path IS NOT NULL)::int
          + EXISTS (SELECT 1 FROM user_experience x WHERE x.user_id = u.user_id)::int
          + EXISTS (SELECT 1 FROM user_education x WHERE x.user_id = u.user_id)::int
          + EXISTS (SELECT 1 FROM user_skills x WHERE x.user_id = u.user_id)::int AS filled,
        CASE
          WHEN EXISTS (SELECT 1 FROM premium_access_periods ap WHERE ap.user_id = u.user_id
            AND ap.revoked_at IS NULL AND ap.starts_at <= CURRENT_TIMESTAMP AND ap.ends_at > CURRENT_TIMESTAMP) THEN 'PAID'
          WHEN EXISTS (SELECT 1 FROM premium_trial_claims t WHERE t.user_id = u.user_id
            AND t.revoked_at IS NULL AND t.starts_at <= CURRENT_TIMESTAMP AND t.ends_at > CURRENT_TIMESTAMP) THEN 'TRIAL'
        END AS premium
      FROM users u
      WHERE u.account_status = 'ACTIVE' AND u.account_role = 'USER' AND u.user_id <> $1
        AND ($2::varchar IS NULL OR u.full_name ILIKE $2 ESCAPE '\\' OR u.headline ILIKE $2 ESCAPE '\\')
    )
    SELECT user_id AS "userId", full_name AS "fullName", avatar_path AS "avatarPath", updated_at AS "updatedAt",
      headline, LEFT(bio, 220) AS "bioExcerpt", premium, ROUND(filled * 100.0 / 6)::int AS "profileCompleteness",
      ARRAY(SELECT s.skill_name FROM user_skills us JOIN skills s ON s.skill_id = us.skill_id
            WHERE us.user_id = profiles.user_id ORDER BY LOWER(s.skill_name) LIMIT 8) AS skills,
      COUNT(*) OVER ()::int AS "totalCount"
    FROM profiles
    WHERE filled > 0
    ORDER BY (premium IS NOT NULL) DESC, filled DESC, updated_at DESC, user_id
    LIMIT $3 OFFSET $4
  `, params);
  return result.rows;
}

// ---- Administration ------------------------------------------------------

async function findPromoCodes() {
  const result = await database.query(`
    SELECT ${PROMO_COLUMNS}, c.created_at AS "createdAt",
      (SELECT COUNT(*)::int FROM premium_promo_redemptions r WHERE r.promo_code_id = c.promo_code_id AND r.status = 'REDEEMED') AS "redeemedCount",
      (SELECT COUNT(*)::int FROM premium_promo_redemptions r WHERE r.promo_code_id = c.promo_code_id
        AND r.status = 'RESERVED' AND r.reserved_at > CURRENT_TIMESTAMP - INTERVAL '${RESERVATION_MINUTES} minutes') AS "reservedCount"
    FROM premium_promo_codes c
    ORDER BY c.created_at DESC, c.promo_code_id DESC
  `);
  return result.rows;
}

async function insertPromoCode(promo) {
  const result = await database.withCloudTransaction((client) => client.query(`
    INSERT INTO premium_promo_codes (code, description, discount_type, discount_value, max_discount_bdt,
      applicable_plan_code, max_redemptions, per_user_limit, valid_from, valid_until, is_active, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, CURRENT_TIMESTAMP), $10, TRUE, $11)
    RETURNING promo_code_id AS "promoCodeId", code
  `, [promo.code, promo.description, promo.discountType, promo.discountValue, promo.maxDiscountBdt,
    promo.applicablePlanCode, promo.maxRedemptions, promo.perUserLimit, promo.validFrom, promo.validUntil, promo.createdBy]));
  return result.rows[0];
}

async function setPromoActive(promoCodeId, isActive) {
  const result = await database.withCloudTransaction((client) => client.query(`
    UPDATE premium_promo_codes SET is_active = $2, updated_at = CURRENT_TIMESTAMP
    WHERE promo_code_id = $1 RETURNING promo_code_id AS "promoCodeId", is_active AS "isActive"
  `, [promoCodeId, isActive]));
  return result.rows[0] || null;
}

async function findOverview() {
  const [totals, statuses, plans, recent] = await Promise.all([
    database.query(`
      SELECT
        (SELECT COUNT(DISTINCT user_id)::int FROM premium_access_periods
          WHERE revoked_at IS NULL AND starts_at <= CURRENT_TIMESTAMP AND ends_at > CURRENT_TIMESTAMP) AS "activePaid",
        (SELECT COUNT(*)::int FROM premium_trial_claims
          WHERE revoked_at IS NULL AND starts_at <= CURRENT_TIMESTAMP AND ends_at > CURRENT_TIMESTAMP) AS "activeTrials",
        (SELECT COUNT(*)::int FROM premium_trial_claims) AS "trialsClaimed",
        (SELECT COALESCE(SUM(final_amount_bdt), 0) FROM premium_payments WHERE status = 'SUCCEEDED') AS "revenueBdt"
    `),
    database.query('SELECT status, COUNT(*)::int AS count FROM premium_payments GROUP BY status ORDER BY status'),
    database.query(`
      SELECT p.plan_code AS "planCode", p.name,
        COUNT(pp.payment_id) FILTER (WHERE pp.status = 'SUCCEEDED')::int AS "successfulPayments"
      FROM premium_plans p LEFT JOIN premium_payments pp ON pp.plan_id = p.plan_id
      GROUP BY p.plan_id ORDER BY p.sort_order
    `),
    database.query(`
      SELECT pp.public_id::text AS "publicId", u.full_name AS "fullName", p.name AS "planName",
        pp.final_amount_bdt AS "finalAmount", pp.discount_amount_bdt AS "discountAmount", pp.status,
        pp.created_at AS "createdAt", pp.completed_at AS "completedAt"
      FROM premium_payments pp
      JOIN users u ON u.user_id = pp.user_id
      JOIN premium_plans p ON p.plan_id = pp.plan_id
      ORDER BY pp.created_at DESC, pp.payment_id DESC
      LIMIT 20
    `)
  ]);
  return { ...totals.rows[0], statusCounts: statuses.rows, planDistribution: plans.rows, recentPayments: recent.rows };
}

module.exports = {
  RESERVATION_MINUTES,
  findAccess, findBadgeSources, claimTrial,
  findActivePlans, findPlanByCode, findPromo, findPromoUsage, releaseStaleReservations,
  withCloudTransaction, insertPayment, insertReservation, markSessionCreated, closeOpenPayment,
  findPaymentForUpdate, grantPaidAccess, findOwnPayment,
  recordProfileView, findViewSummary, findViewers,
  countAiUsageToday, recordAiUsage,
  findTalent,
  findPromoCodes, insertPromoCode, setPromoActive, findOverview
};
