const database = require('../config/database');
const { insertNotification } = require('./notification.repository');

function failure(code, message) { const error = new Error(message); error.sapleCode = code; return error; }

async function summary() {
  const result = await database.query(`SELECT
    (SELECT count(*)::int FROM users) AS users,
    (SELECT count(*)::int FROM submissions WHERE submission_status = 'PENDING') AS submissions,
    (SELECT count(*)::int FROM employment_verifications WHERE verification_status = 'PENDING') AS verifications,
    (SELECT count(*)::int FROM reports WHERE report_status IN ('OPEN','REVIEWING')) AS reports,
    (SELECT count(*)::int FROM users u WHERE EXISTS
      (SELECT 1 FROM premium_access_periods ap WHERE ap.user_id = u.user_id AND ap.revoked_at IS NULL
        AND ap.starts_at <= CURRENT_TIMESTAMP AND ap.ends_at > CURRENT_TIMESTAMP)
      OR EXISTS (SELECT 1 FROM premium_trial_claims t WHERE t.user_id = u.user_id AND t.revoked_at IS NULL
        AND t.starts_at <= CURRENT_TIMESTAMP AND t.ends_at > CURRENT_TIMESTAMP)) AS premium`);
  return result.rows[0];
}

async function submissions({ limit, offset, search, type, status, sort }) {
  const params = [search ? `%${search.replace(/[\\%_]/g, '\\$&')}%` : null, type || null, status || null, limit, offset];
  const from = `FROM submissions s JOIN users u ON u.user_id = s.user_id
    JOIN companies c ON c.company_id = s.company_id
    LEFT JOIN salary_submissions ss ON ss.submission_id = s.submission_id
    LEFT JOIN company_reviews cr ON cr.submission_id = s.submission_id
    LEFT JOIN interview_experiences ie ON ie.submission_id = s.submission_id
    LEFT JOIN job_roles jr ON jr.role_id = COALESCE(ss.role_id, cr.role_id, ie.role_id)`;
  const where = `WHERE ($1::text IS NULL OR s.submission_id::text = trim(both '%' from $1)
    OR c.company_name ILIKE $1 ESCAPE '\\' OR jr.role_name ILIKE $1 ESCAPE '\\')
    AND ($2::text IS NULL OR s.submission_type = $2)
    AND ($3::text IS NULL OR s.submission_status = $3)`;
  const order = { oldest: 's.submitted_at ASC, s.submission_id ASC', newest: 's.submitted_at DESC, s.submission_id DESC', company: 'c.company_name ASC, s.submission_id ASC', type: 's.submission_type ASC, s.submission_id ASC' }[sort];
  const [rows, count] = await Promise.all([
    database.query(`SELECT s.submission_id AS "submissionId", c.company_name AS "companyName",
      s.submission_type AS "submissionType", s.submission_status AS "submissionStatus",
      s.verification_status AS "verificationStatus", jr.role_name AS "roleName",
      u.full_name AS "submitterName", s.submitted_at AS "submittedAt",
      (SELECT count(*)::int FROM reports r WHERE r.submission_id = s.submission_id) AS "reportCount"
      ${from} ${where} ORDER BY ${order} LIMIT $4 OFFSET $5`, params),
    database.query(`SELECT count(*)::int AS total ${from} ${where}`, params.slice(0, 3))
  ]);
  return { items: rows.rows, total: count.rows[0].total };
}

async function verifications({ limit, offset, search, status }) {
  const params = [search ? `%${search.replace(/[\\%_]/g, '\\$&')}%` : null, status || null, limit, offset];
  const from = `FROM employment_verifications ev JOIN employees e ON e.employee_id = ev.employee_id
    JOIN users u ON u.user_id = e.user_id JOIN companies c ON c.company_id = ev.company_id
    LEFT JOIN job_roles jr ON jr.role_id = ev.role_id`;
  const where = `WHERE ($1::text IS NULL OR ev.verification_id::text = trim(both '%' from $1)
    OR u.full_name ILIKE $1 ESCAPE '\\' OR c.company_name ILIKE $1 ESCAPE '\\')
    AND ($2::text IS NULL OR ev.verification_status = $2)`;
  const [rows, count] = await Promise.all([
    database.query(`SELECT ev.verification_id AS "verificationId", u.full_name AS "employeeName",
      c.company_name AS "companyName", jr.role_name AS "roleName",
      ev.verification_status AS "verificationStatus", ev.requested_at AS "requestedAt",
      ev.reviewed_by AS "reviewedBy" ${from} ${where}
      ORDER BY CASE WHEN ev.verification_status = 'PENDING' THEN 0 ELSE 1 END, ev.requested_at ASC, ev.verification_id ASC
      LIMIT $3 OFFSET $4`, params),
    database.query(`SELECT count(*)::int AS total ${from} ${where}`, params.slice(0, 2))
  ]);
  return { items: rows.rows, total: count.rows[0].total };
}

async function reports({ limit, offset, search, status }) {
  const params = [search ? `%${search.replace(/[\\%_]/g, '\\$&')}%` : null, status || null, limit, offset];
  const from = `FROM reports r JOIN users u ON u.user_id = r.reporter_user_id
    JOIN submissions s ON s.submission_id = r.submission_id JOIN companies c ON c.company_id = s.company_id`;
  const where = `WHERE ($1::text IS NULL OR r.report_id::text = trim(both '%' from $1)
    OR c.company_name ILIKE $1 ESCAPE '\\' OR u.full_name ILIKE $1 ESCAPE '\\')
    AND ($2::text IS NULL OR r.report_status = $2)`;
  const [rows, count] = await Promise.all([
    database.query(`SELECT r.report_id AS "reportId", r.submission_id AS "submissionId",
      c.company_name AS "companyName", s.submission_type AS "submissionType",
      r.reason_category AS "reasonCategory", u.full_name AS "reporterName",
      r.report_status AS "reportStatus", r.reported_at AS "reportedAt"
      ${from} ${where} ORDER BY CASE WHEN r.report_status IN ('OPEN','REVIEWING') THEN 0 ELSE 1 END,
      r.reported_at DESC, r.report_id DESC LIMIT $3 OFFSET $4`, params),
    database.query(`SELECT count(*)::int AS total ${from} ${where}`, params.slice(0, 2))
  ]);
  return { items: rows.rows, total: count.rows[0].total };
}

async function screening(submissionId) {
  try {
    const result = await database.query(`SELECT entity_type AS "entityType", revision_no AS "revisionNo",
      screening_status AS "screeningStatus", publication_state AS "publicationState",
      risk_probability AS "riskProbability", confidence, reason_codes AS "reasonCodes",
      model_key AS "modelKey", model_version AS "modelVersion", screened_at AS "screenedAt"
      FROM content_screenings WHERE entity_id = $1 AND entity_type IN ('SALARY','REVIEW','INTERVIEW')
      ORDER BY revision_no DESC LIMIT 1`, [submissionId]);
    return result.rows[0] || null;
  } catch (error) { if (error.code === '42P01') return null; throw error; }
}

const USER_COLUMNS = `u.user_id AS "userId", u.full_name AS "fullName", u.email,
  u.account_role AS "accountRole", u.account_status AS "accountStatus",
  u.user_type AS "userType", u.headline, u.bio, u.avatar_path AS "avatarPath",
  u.created_at AS "createdAt", u.status_reason AS "statusReason",
  u.status_changed_at AS "statusChangedAt",
  (SELECT count(*)::int FROM employment_verifications ev JOIN employees e ON e.employee_id = ev.employee_id
    WHERE e.user_id = u.user_id AND ev.verification_status = 'VERIFIED') AS "verifiedScopes",
  (SELECT string_agg(c.company_name, ', ' ORDER BY c.company_name) FROM company_representatives cr
    JOIN companies c ON c.company_id = cr.company_id WHERE cr.user_id = u.user_id AND cr.assignment_status = 'ACTIVE') AS "representativeCompanies",
  (SELECT source_type FROM premium_access_periods ap WHERE ap.user_id = u.user_id AND ap.revoked_at IS NULL
    AND ap.starts_at <= CURRENT_TIMESTAMP AND ap.ends_at > CURRENT_TIMESTAMP
    ORDER BY ap.ends_at DESC LIMIT 1) AS "premiumSource",
  EXISTS (SELECT 1 FROM premium_trial_claims t WHERE t.user_id = u.user_id AND t.revoked_at IS NULL
    AND t.starts_at <= CURRENT_TIMESTAMP AND t.ends_at > CURRENT_TIMESTAMP) AS "trialActive",
  (SELECT t.ends_at FROM premium_trial_claims t WHERE t.user_id = u.user_id AND t.revoked_at IS NULL
    AND t.starts_at <= CURRENT_TIMESTAMP AND t.ends_at > CURRENT_TIMESTAMP) AS "trialEndsAt"`;

async function users({ limit, offset, search, role, status, premium, sort }) {
  const order = { newest: 'u.created_at DESC, u.user_id DESC', oldest: 'u.created_at ASC, u.user_id ASC', name: 'u.full_name ASC, u.user_id ASC' }[sort];
  const params = [search ? `%${search.replace(/[\\%_]/g, '\\$&')}%` : null, role || null, status || null, premium || null, limit, offset];
  const where = `WHERE ($1::text IS NULL OR u.full_name ILIKE $1 ESCAPE '\\' OR u.email ILIKE $1 ESCAPE '\\'
    OR u.user_id::text = trim(both '%' from $1))
    AND ($2::text IS NULL OR u.account_role = $2)
    AND ($3::text IS NULL OR u.account_status = $3)
    AND ($4::text IS NULL OR CASE $4
      WHEN 'PREMIUM' THEN EXISTS (SELECT 1 FROM premium_access_periods ap WHERE ap.user_id = u.user_id
        AND ap.revoked_at IS NULL AND ap.starts_at <= CURRENT_TIMESTAMP AND ap.ends_at > CURRENT_TIMESTAMP)
      WHEN 'TRIAL' THEN EXISTS (SELECT 1 FROM premium_trial_claims t WHERE t.user_id = u.user_id AND t.revoked_at IS NULL
        AND t.starts_at <= CURRENT_TIMESTAMP AND t.ends_at > CURRENT_TIMESTAMP)
      ELSE NOT EXISTS (SELECT 1 FROM premium_access_periods ap WHERE ap.user_id = u.user_id
        AND ap.revoked_at IS NULL AND ap.starts_at <= CURRENT_TIMESTAMP AND ap.ends_at > CURRENT_TIMESTAMP)
        AND NOT EXISTS (SELECT 1 FROM premium_trial_claims t WHERE t.user_id = u.user_id AND t.revoked_at IS NULL
        AND t.starts_at <= CURRENT_TIMESTAMP AND t.ends_at > CURRENT_TIMESTAMP) END)`;
  const [rows, count] = await Promise.all([
    database.query(`SELECT ${USER_COLUMNS} FROM users u ${where} ORDER BY ${order} LIMIT $5 OFFSET $6`, params),
    database.query(`SELECT count(*)::int AS total FROM users u ${where}`, params.slice(0, 4))
  ]);
  return { items: rows.rows, total: count.rows[0].total };
}

async function userDetail(userId) {
  const result = await database.query(`SELECT ${USER_COLUMNS},
    (SELECT count(*)::int FROM submissions s WHERE s.user_id = u.user_id AND s.submission_type = 'SALARY') AS "salaryCount",
    (SELECT count(*)::int FROM submissions s WHERE s.user_id = u.user_id AND s.submission_type = 'REVIEW') AS "reviewCount",
    (SELECT count(*)::int FROM submissions s WHERE s.user_id = u.user_id AND s.submission_type = 'INTERVIEW') AS "interviewCount",
    (SELECT count(*)::int FROM job_applications ja WHERE ja.applicant_user_id = u.user_id) AS "applicationCount",
    (SELECT count(*)::int FROM reports r WHERE r.reporter_user_id = u.user_id) AS "reportCount",
    EXISTS (SELECT 1 FROM premium_trial_claims t WHERE t.user_id = u.user_id) AS "trialUsed"
    FROM users u WHERE u.user_id = $1`, [userId]);
  if (!result.rows[0]) return null;
  const [assignments, verifications, periods, contributions] = await Promise.all([
    database.query(`SELECT cr.assignment_id AS "assignmentId", c.company_name AS "companyName",
      cr.assignment_status AS status, cr.created_at AS "createdAt", cr.approved_by AS "approvedBy",
      cr.approved_at AS "approvedAt", cr.revoked_at AS "revokedAt"
      FROM company_representatives cr JOIN companies c ON c.company_id = cr.company_id
      WHERE cr.user_id = $1 ORDER BY cr.created_at DESC LIMIT 25`, [userId]),
    database.query(`SELECT ev.verification_id AS "verificationId", c.company_name AS "companyName",
      ev.verification_status AS status, ev.requested_at AS "requestedAt"
      FROM employment_verifications ev JOIN employees e ON e.employee_id = ev.employee_id
      JOIN companies c ON c.company_id = ev.company_id WHERE e.user_id = $1 ORDER BY ev.requested_at DESC LIMIT 25`, [userId]),
    database.query(`SELECT ap.access_id AS "accessId", ap.source_type AS source,
      p.plan_code AS "planCode", ap.starts_at AS "startsAt", ap.ends_at AS "endsAt",
      ap.revoked_at AS "revokedAt" FROM premium_access_periods ap
      JOIN premium_plans p ON p.plan_id = ap.plan_id WHERE ap.user_id = $1
      ORDER BY ap.created_at DESC LIMIT 25`, [userId]),
    database.query(`SELECT s.submission_id AS "submissionId", s.submission_type AS type,
      s.submission_status AS status, s.submitted_at AS "submittedAt", c.company_name AS "companyName"
      FROM submissions s JOIN companies c ON c.company_id = s.company_id
      WHERE s.user_id = $1 ORDER BY s.submitted_at DESC LIMIT 25`, [userId])
  ]);
  return { ...result.rows[0], assignments: assignments.rows, verifications: verifications.rows,
    accessPeriods: periods.rows, contributions: contributions.rows };
}

async function setUserStatus({ userId, actorId, status, reason, confirmEmail }) {
  return database.withCloudTransaction(async (client) => {
    // Lock all active admins in a stable order so concurrent suspensions
    // cannot both decide they are leaving one administrator behind.
    await client.query(`SELECT user_id FROM users WHERE account_role = 'ADMIN'
      AND account_status = 'ACTIVE' ORDER BY user_id FOR UPDATE`);
    const current = (await client.query(`SELECT user_id AS "userId", account_role AS "accountRole",
      account_status AS "accountStatus", email FROM users WHERE user_id = $1 FOR UPDATE`, [userId])).rows[0];
    if (!current) throw failure('NOT_FOUND', 'User not found');
    if (current.accountRole === 'ADMIN' && confirmEmail !== current.email) {
      throw failure('INVALID_CONFIRMATION', 'Confirm the administrator email to change this account');
    }
    if (current.accountStatus === status) throw failure('CONFLICT', 'Account already has this status');
    if (current.accountRole === 'ADMIN' && status !== 'ACTIVE' && current.accountStatus === 'ACTIVE') {
      const active = (await client.query(`SELECT count(*)::int AS count FROM users
        WHERE account_role = 'ADMIN' AND account_status = 'ACTIVE'`)).rows[0].count;
      if (active <= 1) throw failure('LAST_ADMIN', 'The last active administrator cannot be disabled');
    }
    await client.query(`UPDATE users SET account_status = $1, status_reason = $2,
      status_changed_by = $3, status_changed_at = CURRENT_TIMESTAMP,
      token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $4`,
    [status, reason, actorId, userId]);
    await client.query(`INSERT INTO admin_actions
      (admin_user_id, action_type, target_type, target_id, before_state, after_state, reason)
      VALUES ($1,$2,'USER',$3,$4::jsonb,$5::jsonb,$6)`,
    [actorId, `USER_${status === 'ACTIVE' ? 'REACTIVATE' : status === 'SUSPENDED' ? 'SUSPEND' : 'DEACTIVATE'}`,
      userId, JSON.stringify({ status: current.accountStatus }), JSON.stringify({ status }), reason]);
    await insertNotification(client, { userId, notificationType: 'SECURITY_EVENT', title: 'Account status changed',
      message: `Your Saple account is now ${status.toLowerCase()}.`, relatedEntityType: 'ACCOUNT', relatedEntityId: userId });
    return { userId, accountStatus: status };
  });
}

async function subscriptions({ limit, offset, search, filter }) {
  const params = [search ? `%${search.replace(/[\\%_]/g, '\\$&')}%` : null, filter || null, limit, offset];
  const from = `FROM users u LEFT JOIN premium_trial_claims t ON t.user_id = u.user_id
    LEFT JOIN LATERAL (SELECT ap.access_id, ap.source_type, ap.starts_at, ap.ends_at, p.plan_code
      FROM premium_access_periods ap JOIN premium_plans p ON p.plan_id = ap.plan_id
      WHERE ap.user_id = u.user_id AND ap.revoked_at IS NULL
        AND ap.starts_at <= CURRENT_TIMESTAMP AND ap.ends_at > CURRENT_TIMESTAMP
      ORDER BY ap.ends_at DESC LIMIT 1) active ON TRUE`;
  const where = `WHERE ($1::text IS NULL OR u.full_name ILIKE $1 ESCAPE '\\' OR u.email ILIKE $1 ESCAPE '\\')
    AND ($2::text IS NULL OR CASE $2 WHEN 'PREMIUM' THEN active.access_id IS NOT NULL
      WHEN 'TRIAL' THEN active.access_id IS NULL AND t.revoked_at IS NULL AND t.starts_at <= CURRENT_TIMESTAMP AND t.ends_at > CURRENT_TIMESTAMP
      WHEN 'FREE' THEN active.access_id IS NULL AND (t.ends_at IS NULL OR t.ends_at <= CURRENT_TIMESTAMP OR t.revoked_at IS NOT NULL)
      WHEN 'ADMIN_GRANT' THEN active.source_type = 'ADMIN_GRANT'
      WHEN 'PAID' THEN active.source_type = 'PAID'
      ELSE active.access_id IS NULL AND (EXISTS (SELECT 1 FROM premium_access_periods old
        WHERE old.user_id = u.user_id AND old.ends_at <= CURRENT_TIMESTAMP)
        OR t.ends_at <= CURRENT_TIMESTAMP) END)`;
  const [rows, count] = await Promise.all([
    database.query(`SELECT u.user_id AS "userId", u.full_name AS "fullName", u.email,
      u.account_status AS "accountStatus", active.source_type AS source, active.plan_code AS "planCode",
      active.starts_at AS "startsAt", active.ends_at AS "endsAt", t.user_id IS NOT NULL AS "trialUsed",
      (SELECT pp.status FROM premium_payments pp WHERE pp.user_id = u.user_id
        ORDER BY pp.created_at DESC LIMIT 1) AS "paymentStatus",
      CASE WHEN t.revoked_at IS NULL THEN t.ends_at ELSE NULL END AS "trialEndsAt" ${from} ${where} ORDER BY u.created_at DESC, u.user_id DESC LIMIT $3 OFFSET $4`, params),
    database.query(`SELECT count(*)::int AS total ${from} ${where}`, params.slice(0, 2))
  ]);
  return { items: rows.rows, total: count.rows[0].total };
}

async function subscriptionDetail(userId) {
  const user = (await database.query(`SELECT user_id AS "userId", full_name AS "fullName", email,
    account_status AS "accountStatus" FROM users WHERE user_id = $1`, [userId])).rows[0];
  if (!user) return null;
  const [periods, payments, trial, promos] = await Promise.all([
    database.query(`SELECT ap.access_id AS "accessId", ap.source_type AS source, p.plan_code AS "planCode",
      ap.starts_at AS "startsAt", ap.ends_at AS "endsAt", ap.revoked_at AS "revokedAt",
      ap.created_at AS "createdAt" FROM premium_access_periods ap
      JOIN premium_plans p ON p.plan_id = ap.plan_id WHERE ap.user_id = $1 ORDER BY ap.created_at DESC LIMIT 50`, [userId]),
    database.query(`SELECT status, count(*)::int AS count FROM premium_payments WHERE user_id = $1 GROUP BY status`, [userId]),
    database.query(`SELECT claimed_at AS "claimedAt", starts_at AS "startsAt", ends_at AS "endsAt",
      revoked_at AS "revokedAt"
      FROM premium_trial_claims WHERE user_id = $1`, [userId]),
    database.query(`SELECT pc.code, pr.status, pr.discount_amount_bdt AS "discountAmountBdt",
      pr.reserved_at AS "reservedAt" FROM premium_promo_redemptions pr
      JOIN premium_promo_codes pc ON pc.promo_code_id = pr.promo_code_id
      WHERE pr.user_id = $1 ORDER BY pr.reserved_at DESC LIMIT 20`, [userId])
  ]);
  return { ...user, periods: periods.rows, paymentSummary: payments.rows,
    promoHistory: promos.rows, trial: trial.rows[0] || null };
}

async function grantPremium({ userId, actorId, days, reason }) {
  return database.withCloudTransaction(async (client) => {
    const user = (await client.query(`SELECT account_status AS status FROM users WHERE user_id = $1 FOR UPDATE`, [userId])).rows[0];
    if (!user) throw failure('NOT_FOUND', 'User not found');
    if (user.status !== 'ACTIVE') throw failure('CONFLICT', 'Account is not active');
    const plan = (await client.query(`SELECT plan_id AS "planId" FROM premium_plans WHERE duration_days = $1 LIMIT 1`, [days])).rows[0];
    if (!plan) throw failure('CONFLICT', 'Premium plan is unavailable');
    const previous = (await client.query(`SELECT greatest(
      (SELECT max(ends_at) FROM premium_access_periods WHERE user_id = $1 AND revoked_at IS NULL AND ends_at > CURRENT_TIMESTAMP),
      (SELECT ends_at FROM premium_trial_claims WHERE user_id = $1 AND revoked_at IS NULL AND ends_at > CURRENT_TIMESTAMP)
      ) AS "endsAt"`, [userId])).rows[0].endsAt;
    const inserted = (await client.query(`INSERT INTO premium_access_periods
      (user_id, source_type, plan_id, starts_at, ends_at, granted_by, admin_reason)
      VALUES ($1,'ADMIN_GRANT',$2,GREATEST(CURRENT_TIMESTAMP,COALESCE($3::timestamptz,CURRENT_TIMESTAMP)),
        GREATEST(CURRENT_TIMESTAMP,COALESCE($3::timestamptz,CURRENT_TIMESTAMP)) + make_interval(days => $4::int),$5,$6)
      RETURNING access_id AS "accessId", starts_at AS "startsAt", ends_at AS "endsAt"`,
    [userId, plan.planId, previous, days, actorId, reason])).rows[0];
    await client.query(`INSERT INTO admin_actions
      (admin_user_id, action_type, target_type, target_id, before_state, after_state, reason)
      VALUES ($1,$2,'USER',$3,$4::jsonb,$5::jsonb,$6)`,
    [actorId, previous ? 'PREMIUM_EXTEND' : 'PREMIUM_GRANT', userId,
      JSON.stringify({ endsAt: previous }), JSON.stringify({ accessId: inserted.accessId, endsAt: inserted.endsAt }), reason]);
    await insertNotification(client, { userId, notificationType: 'SECURITY_EVENT', title: 'Premium access updated',
      message: `Saple Premium has been added to your account until ${new Date(inserted.endsAt).toLocaleDateString('en-GB')}.`,
      relatedEntityType: 'ACCOUNT', relatedEntityId: userId });
    return inserted;
  });
}

async function revokePremium({ userId, actorId, reason }) {
  return database.withCloudTransaction(async (client) => {
    const user = (await client.query('SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE', [userId])).rows[0];
    if (!user) throw failure('NOT_FOUND', 'User not found');
    const active = (await client.query(`UPDATE premium_access_periods SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2
      WHERE user_id = $1 AND revoked_at IS NULL AND ends_at > CURRENT_TIMESTAMP
      RETURNING access_id AS "accessId", source_type AS source`, [userId, actorId])).rows;
    const trial = (await client.query(`UPDATE premium_trial_claims SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2
      WHERE user_id = $1 AND revoked_at IS NULL AND starts_at <= CURRENT_TIMESTAMP AND ends_at > CURRENT_TIMESTAMP
      RETURNING user_id`, [userId, actorId])).rows;
    if (!active.length && !trial.length) throw failure('CONFLICT', 'No active Premium access to revoke');
    await client.query(`INSERT INTO admin_actions
      (admin_user_id, action_type, target_type, target_id, before_state, after_state, reason)
      VALUES ($1,'PREMIUM_REVOKE','USER',$2,$3::jsonb,$4::jsonb,$5)`,
    [actorId, userId, JSON.stringify({ accessIds: active.map((row) => row.accessId), trial: trial.length > 0 }), JSON.stringify({ revoked: true }), reason]);
    await insertNotification(client, { userId, notificationType: 'SECURITY_EVENT', title: 'Premium access updated',
      message: 'Your Saple Premium access was changed by an administrator.',
      relatedEntityType: 'ACCOUNT', relatedEntityId: userId });
    return { userId, revokedCount: active.length + trial.length };
  });
}

module.exports = { summary, submissions, verifications, reports, screening, users, userDetail, setUserStatus,
  subscriptions, subscriptionDetail, grantPremium, revokePremium };
