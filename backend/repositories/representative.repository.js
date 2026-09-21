const database = require('../config/database');
const { insertNotification } = require('./notification.repository');

function repositoryError(code, message) {
  const error = new Error(message);
  error.sapleCode = code;
  return error;
}

const ASSIGNMENT_SELECT = `
  SELECT cr.assignment_id AS "assignmentId", cr.user_id AS "userId",
    u.full_name AS "representativeName", u.email AS "representativeEmail",
    u.account_status AS "accountStatus",
    cr.company_id AS "companyId", c.company_name AS "companyName",
    cr.job_title AS "jobTitle", cr.assignment_status AS "assignmentStatus",
    cr.request_note AS "requestNote", cr.decision_note AS "decisionNote",
    cr.approved_by AS "approvedBy", cr.approved_at AS "approvedAt",
    cr.revoked_by AS "revokedBy", cr.revoked_at AS "revokedAt",
    cr.created_at AS "createdAt", cr.updated_at AS "updatedAt"
  FROM company_representatives cr
  JOIN users u ON u.user_id = cr.user_id
  JOIN companies c ON c.company_id = cr.company_id
`;

// Authorization source of truth. Called on every protected request for an
// account holding the representative role, so a revoked scope stops working
// immediately even while an older JWT is still within its lifetime.
async function findActiveScopesByUserId(userId) {
  const result = await database.query(`
    SELECT cr.assignment_id AS "assignmentId", cr.company_id AS "companyId",
      c.company_name AS "companyName", cr.job_title AS "jobTitle",
      cr.approved_at AS "approvedAt"
    FROM company_representatives cr
    JOIN companies c ON c.company_id = cr.company_id
    JOIN users u ON u.user_id = cr.user_id
    WHERE cr.user_id = $1
      AND cr.assignment_status = 'ACTIVE'
      AND u.account_status = 'ACTIVE'
    ORDER BY c.company_name
  `, [userId]);
  return result.rows;
}

async function findAssignmentsByUserId(userId) {
  const result = await database.query(`
    ${ASSIGNMENT_SELECT}
    WHERE cr.user_id = $1
    ORDER BY cr.created_at DESC, cr.assignment_id DESC
  `, [userId]);
  return result.rows;
}

async function findAssignmentById(assignmentId) {
  const result = await database.query(
    `${ASSIGNMENT_SELECT} WHERE cr.assignment_id = $1`,
    [assignmentId]
  );
  return result.rows[0] || null;
}

async function findAssignments({ status = null, companyId = null, search = null, limit, offset }) {
  const result = await database.query(`
    ${ASSIGNMENT_SELECT}
    WHERE ($1::varchar IS NULL OR cr.assignment_status = $1)
      AND ($2::bigint IS NULL OR cr.company_id = $2)
      AND ($3::varchar IS NULL
        OR LOWER(u.full_name) LIKE '%' || LOWER($3) || '%'
        OR LOWER(u.email) LIKE '%' || LOWER($3) || '%'
        OR LOWER(c.company_name) LIKE '%' || LOWER($3) || '%')
    ORDER BY
      CASE cr.assignment_status WHEN 'PENDING' THEN 0 ELSE 1 END,
      cr.created_at DESC, cr.assignment_id DESC
    LIMIT $4 OFFSET $5
  `, [status, companyId, search, limit, offset]);
  return result.rows;
}

async function countAssignments({ status = null, companyId = null, search = null }) {
  const result = await database.query(`
    SELECT COUNT(*)::int AS "total"
    FROM company_representatives cr
    JOIN users u ON u.user_id = cr.user_id
    JOIN companies c ON c.company_id = cr.company_id
    WHERE ($1::varchar IS NULL OR cr.assignment_status = $1)
      AND ($2::bigint IS NULL OR cr.company_id = $2)
      AND ($3::varchar IS NULL
        OR LOWER(u.full_name) LIKE '%' || LOWER($3) || '%'
        OR LOWER(u.email) LIKE '%' || LOWER($3) || '%'
        OR LOWER(c.company_name) LIKE '%' || LOWER($3) || '%')
  `, [status, companyId, search]);
  return result.rows[0].total;
}

async function findAssignmentHistory(assignmentId) {
  const result = await database.query(`
    SELECT ra.action_id AS "actionId", ra.action_type AS "actionType",
      ra.previous_status AS "previousStatus", ra.new_status AS "newStatus",
      ra.action_note AS "actionNote", ra.action_at AS "actionAt",
      ra.actor_user_id AS "actorUserId", u.full_name AS "actorName"
    FROM representative_assignment_actions ra
    JOIN users u ON u.user_id = ra.actor_user_id
    WHERE ra.assignment_id = $1
    ORDER BY ra.action_at ASC, ra.action_id ASC
  `, [assignmentId]);
  return result.rows;
}

// A signed-in account asks to represent a company. This only ever creates a
// PENDING row: the account role is untouched until an administrator approves.
async function createAssignmentRequest({ userId, companyId, jobTitle, requestNote }) {
  const client = await database.getClient();

  try {
    await client.query('BEGIN');
    const accountResult = await client.query(`
      SELECT account_role AS "accountRole", account_status AS "accountStatus"
      FROM users WHERE user_id = $1 FOR UPDATE
    `, [userId]);
    const account = accountResult.rows[0];
    if (!account) throw repositoryError('ACCOUNT_NOT_FOUND', 'Account not found');
    if (account.accountStatus !== 'ACTIVE') {
      throw repositoryError('ACCOUNT_UNAVAILABLE', 'This account cannot request a company scope');
    }
    if (account.accountRole === 'ADMIN') {
      throw repositoryError(
        'ADMIN_NOT_ELIGIBLE',
        'Administrators oversee representatives and cannot hold a company scope'
      );
    }

    const companyResult = await client.query(
      'SELECT company_id AS "companyId" FROM companies WHERE company_id = $1',
      [companyId]
    );
    if (!companyResult.rows[0]) throw repositoryError('COMPANY_NOT_FOUND', 'Company not found');

    const existingResult = await client.query(`
      SELECT assignment_id AS "assignmentId", assignment_status AS "assignmentStatus"
      FROM company_representatives
      WHERE user_id = $1 AND company_id = $2
        AND assignment_status IN ('PENDING', 'ACTIVE')
      FOR UPDATE
    `, [userId, companyId]);
    if (existingResult.rows[0]) {
      throw repositoryError(
        'ACTIVE_ASSIGNMENT_EXISTS',
        'A pending or active representative scope already exists for this company'
      );
    }

    const insertResult = await client.query(`
      INSERT INTO company_representatives (user_id, company_id, job_title, assignment_status, request_note)
      VALUES ($1, $2, $3, 'PENDING', $4)
      RETURNING assignment_id AS "assignmentId"
    `, [userId, companyId, jobTitle, requestNote]);
    const assignmentId = insertResult.rows[0].assignmentId;

    await client.query(`
      INSERT INTO representative_assignment_actions (
        assignment_id, actor_user_id, action_type, previous_status, new_status, action_note
      ) VALUES ($1, $2, 'REQUEST', NULL, 'PENDING', $3)
    `, [assignmentId, userId, requestNote]);

    await insertNotification(client, {
      userId,
      notificationType: 'REPRESENTATIVE_DECISION',
      title: 'Representative request received',
      message: 'Your company representative request is waiting for administrator review.',
      relatedEntityType: 'ASSIGNMENT',
      relatedEntityId: assignmentId
    });

    await client.query('COMMIT');
    return { assignmentId, assignmentStatus: 'PENDING', companyId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const DECISIONS = Object.freeze({
  APPROVE: { newStatus: 'ACTIVE', allowedFrom: ['PENDING'] },
  REJECT: { newStatus: 'REJECTED', allowedFrom: ['PENDING'] },
  REVOKE: { newStatus: 'REVOKED', allowedFrom: ['ACTIVE'] }
});

const DECISION_MESSAGES = Object.freeze({
  APPROVE: 'Your representative scope is now active for ',
  REJECT: 'Your representative request was not approved for ',
  REVOKE: 'Your representative scope has been revoked for '
});

// One transaction covers the assignment row, the account role, the immutable
// audit record and the representative's notification.
async function decideAssignment({ assignmentId, actorUserId, action, note }) {
  const decision = DECISIONS[action];
  if (!decision) throw repositoryError('INVALID_ACTION', 'Unsupported assignment action');

  const client = await database.getClient();

  try {
    await client.query('BEGIN');
    const currentResult = await client.query(`
      SELECT assignment_id AS "assignmentId", user_id AS "userId",
        company_id AS "companyId", assignment_status AS "assignmentStatus"
      FROM company_representatives WHERE assignment_id = $1 FOR UPDATE
    `, [assignmentId]);
    const current = currentResult.rows[0];
    if (!current) throw repositoryError('ASSIGNMENT_NOT_FOUND', 'Representative assignment not found');
    if (!decision.allowedFrom.includes(current.assignmentStatus)) {
      throw repositoryError(
        'INVALID_TRANSITION',
        'This representative assignment cannot make that transition'
      );
    }

    const companyResult = await client.query(
      'SELECT company_name AS "companyName" FROM companies WHERE company_id = $1',
      [current.companyId]
    );
    const companyName = companyResult.rows[0]?.companyName || 'the assigned company';

    if (action === 'APPROVE') {
      await client.query(`
        UPDATE company_representatives
        SET assignment_status = 'ACTIVE', decision_note = $1,
          approved_by = $2, approved_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE assignment_id = $3
      `, [note, actorUserId, assignmentId]);
    } else if (action === 'REJECT') {
      await client.query(`
        UPDATE company_representatives
        SET assignment_status = 'REJECTED', decision_note = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE assignment_id = $2
      `, [note, assignmentId]);
    } else {
      await client.query(`
        UPDATE company_representatives
        SET assignment_status = 'REVOKED', decision_note = $1,
          revoked_by = $2, revoked_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE assignment_id = $3
      `, [note, actorUserId, assignmentId]);
    }

    // The account role follows the scopes that remain active. An account never
    // keeps the representative role after its last scope closes, and its token
    // version is bumped so existing sessions must re-authorize.
    const remainingResult = await client.query(`
      SELECT COUNT(*)::int AS "activeCount"
      FROM company_representatives
      WHERE user_id = $1 AND assignment_status = 'ACTIVE'
    `, [current.userId]);
    const activeCount = remainingResult.rows[0].activeCount;

    await client.query(`
      UPDATE users
      SET account_role = CASE
            WHEN account_role = 'ADMIN' THEN 'ADMIN'
            WHEN $1 > 0 THEN 'COMPANY_REPRESENTATIVE'
            ELSE 'USER'
          END,
        token_version = CASE
            WHEN account_role = 'ADMIN' THEN token_version
            WHEN ($1 > 0) <> (account_role = 'COMPANY_REPRESENTATIVE') THEN token_version + 1
            ELSE token_version
          END,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
    `, [activeCount, current.userId]);

    const actionResult = await client.query(`
      INSERT INTO representative_assignment_actions (
        assignment_id, actor_user_id, action_type, previous_status, new_status, action_note
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING action_id AS "actionId"
    `, [assignmentId, actorUserId, action, current.assignmentStatus, decision.newStatus, note]);

    await insertNotification(client, {
      userId: current.userId,
      notificationType: 'REPRESENTATIVE_DECISION',
      title: 'Representative scope updated',
      message: DECISION_MESSAGES[action] + companyName + '.',
      relatedEntityType: 'ASSIGNMENT',
      relatedEntityId: assignmentId
    });

    await client.query('COMMIT');
    return {
      assignmentId,
      previousStatus: current.assignmentStatus,
      assignmentStatus: decision.newStatus,
      actionId: actionResult.rows[0].actionId,
      activeScopeCount: activeCount
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  findActiveScopesByUserId,
  findAssignmentsByUserId,
  findAssignmentById,
  findAssignments,
  countAssignments,
  findAssignmentHistory,
  createAssignmentRequest,
  decideAssignment
};
