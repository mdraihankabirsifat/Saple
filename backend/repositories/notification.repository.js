const database = require('../config/database');

// Notification text is plain text by construction. The database also rejects
// angle brackets, so a stored notification can never carry markup.
const INSERT_NOTIFICATION_SQL = `
  INSERT INTO notifications (
    user_id, notification_type, title, message, related_entity_type, related_entity_id
  ) VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING notification_id AS "notificationId"
`;

const NOTIFICATION_SELECT = `
  SELECT notification_id AS "notificationId", notification_type AS "notificationType",
    title, message, related_entity_type AS "relatedEntityType",
    related_entity_id AS "relatedEntityId", read_at AS "readAt", created_at AS "createdAt"
  FROM notifications
`;

// Callers inside an existing transaction pass their client so the notification
// commits or rolls back together with the decision that produced it.
async function insertNotification(client, notification) {
  const result = await client.query(INSERT_NOTIFICATION_SQL, [
    notification.userId,
    notification.notificationType,
    notification.title,
    notification.message,
    notification.relatedEntityType || null,
    notification.relatedEntityId || null
  ]);
  return result.rows[0].notificationId;
}

async function createNotification(notification) {
  const client = await database.getClient();
  try {
    await client.query('BEGIN');
    const notificationId = await insertNotification(client, notification);
    await client.query('COMMIT');
    return { notificationId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Ownership is expressed in SQL, never assumed from the request body.
async function findByOwner(userId, { limit, offset, unreadOnly = false }) {
  const result = await database.query(`
    ${NOTIFICATION_SELECT}
    WHERE user_id = $1
      AND ($2::boolean IS NOT TRUE OR read_at IS NULL)
    ORDER BY created_at DESC, notification_id DESC
    LIMIT $3 OFFSET $4
  `, [userId, unreadOnly, limit, offset]);
  return result.rows;
}

async function countByOwner(userId, { unreadOnly = false } = {}) {
  const result = await database.query(`
    SELECT COUNT(*)::int AS "total"
    FROM notifications
    WHERE user_id = $1
      AND ($2::boolean IS NOT TRUE OR read_at IS NULL)
  `, [userId, unreadOnly]);
  return result.rows[0].total;
}

async function countUnread(userId) {
  const result = await database.query(`
    SELECT COUNT(*)::int AS "unreadCount"
    FROM notifications WHERE user_id = $1 AND read_at IS NULL
  `, [userId]);
  return result.rows[0].unreadCount;
}

async function markOneRead(userId, notificationId) {
  const result = await database.withTransaction((client) => client.query(`
    UPDATE notifications SET read_at = CURRENT_TIMESTAMP
    WHERE notification_id = $1 AND user_id = $2 AND read_at IS NULL
    RETURNING notification_id AS "notificationId"
  `, [notificationId, userId]));

  if (result.rowCount === 1) return { updated: true };

  // Distinguish "already read" from "not yours": both stay 404-or-204 to the
  // caller, but the service needs to know the row exists and is owned.
  const owned = await database.query(`
    SELECT notification_id AS "notificationId"
    FROM notifications WHERE notification_id = $1 AND user_id = $2
  `, [notificationId, userId]);
  return { updated: false, exists: owned.rowCount === 1 };
}

async function markAllRead(userId) {
  const result = await database.withTransaction((client) => client.query(`
    UPDATE notifications SET read_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND read_at IS NULL
  `, [userId]));
  return { updatedCount: result.rowCount };
}

module.exports = {
  INSERT_NOTIFICATION_SQL,
  insertNotification,
  createNotification,
  findByOwner,
  countByOwner,
  countUnread,
  markOneRead,
  markAllRead
};
