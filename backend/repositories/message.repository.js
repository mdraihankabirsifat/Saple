const database = require('../config/database');

async function profile(userId) {
  const result = await database.query(`
    SELECT user_id AS "userId", full_name AS "fullName", account_role AS "accountRole",
      avatar_path AS "avatarPath", updated_at AS "updatedAt"
    FROM users WHERE user_id = $1 AND account_status = 'ACTIVE'
  `, [userId]);
  return result.rows[0] || null;
}

async function conversations(userId) {
  const result = await database.cloudQuery(`
    WITH ranked AS (
      SELECT m.*, CASE WHEN m.sender_user_id = $1 THEN m.recipient_user_id ELSE m.sender_user_id END AS peer_id,
        ROW_NUMBER() OVER (PARTITION BY CASE WHEN m.sender_user_id = $1 THEN m.recipient_user_id ELSE m.sender_user_id END ORDER BY m.message_id DESC) AS position
      FROM direct_messages m
      WHERE m.sender_user_id = $1 OR m.recipient_user_id = $1
    ), unread AS (
      SELECT sender_user_id AS peer_id, COUNT(*)::integer AS count
      FROM direct_messages WHERE recipient_user_id = $1 AND read_at IS NULL AND deleted_at IS NULL
      GROUP BY sender_user_id
    )
    SELECT r.peer_id AS "userId", u.full_name AS "fullName", u.avatar_path AS "avatarPath",
      u.updated_at AS "avatarUpdatedAt", u.account_role AS "accountRole",
      CASE WHEN r.deleted_at IS NULL THEN LEFT(r.message_body, 100) ELSE 'Message deleted' END AS "lastMessagePreview",
      r.created_at AS "lastMessageAt", r.sender_user_id AS "lastMessageSenderUserId",
      COALESCE(unread.count, 0) AS "unreadCount"
    FROM ranked r JOIN users u ON u.user_id = r.peer_id AND u.account_status = 'ACTIVE'
    LEFT JOIN unread ON unread.peer_id = r.peer_id
    WHERE r.position = 1 ORDER BY r.message_id DESC LIMIT 50
  `, [userId]);
  return result.rows;
}

async function history(userId, peerId, beforeMessageId = null) {
  const client = await database.cloudClient();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE direct_messages SET read_at = CURRENT_TIMESTAMP
      WHERE sender_user_id = $1 AND recipient_user_id = $2 AND read_at IS NULL`, [peerId, userId]);
    const result = await client.query(`
      SELECT message_id AS "messageId", sender_user_id AS "senderUserId",
        recipient_user_id AS "recipientUserId", message_body AS "messageBody",
        created_at AS "createdAt", edited_at AS "editedAt", deleted_at AS "deletedAt", read_at AS "readAt"
      FROM direct_messages
      WHERE ((sender_user_id = $1 AND recipient_user_id = $2) OR (sender_user_id = $2 AND recipient_user_id = $1))
        AND ($3::bigint IS NULL OR message_id < $3)
      ORDER BY message_id DESC LIMIT 41
    `, [userId, peerId, beforeMessageId]);
    await client.query('COMMIT');
    return { messages: result.rows.slice(0, 40).reverse(), hasMore: result.rows.length > 40 };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { await Promise.resolve(client.release()); }
}

async function send(senderId, recipientId, body) {
  const result = await database.withCloudTransaction((client) => client.query(`
    INSERT INTO direct_messages (sender_user_id, recipient_user_id, message_body)
    SELECT $1, $2, $3 FROM users WHERE user_id = $2 AND account_status = 'ACTIVE'
    RETURNING message_id AS "messageId", sender_user_id AS "senderUserId",
      recipient_user_id AS "recipientUserId", message_body AS "messageBody",
      created_at AS "createdAt", edited_at AS "editedAt", deleted_at AS "deletedAt", read_at AS "readAt"
  `, [senderId, recipientId, body]));
  return result.rows[0] || null;
}

async function edit(senderId, messageId, body) {
  const result = await database.withCloudTransaction((client) => client.query(`
    UPDATE direct_messages SET message_body = $3, edited_at = CURRENT_TIMESTAMP
    WHERE message_id = $2 AND sender_user_id = $1 AND deleted_at IS NULL
    RETURNING message_id AS "messageId", sender_user_id AS "senderUserId",
      recipient_user_id AS "recipientUserId", message_body AS "messageBody",
      created_at AS "createdAt", edited_at AS "editedAt", deleted_at AS "deletedAt", read_at AS "readAt"
  `, [senderId, messageId, body]));
  return result.rows[0] || null;
}

async function remove(senderId, messageId) {
  const result = await database.withCloudTransaction((client) => client.query(`
    UPDATE direct_messages SET message_body = NULL, deleted_at = CURRENT_TIMESTAMP
    WHERE message_id = $2 AND sender_user_id = $1 AND deleted_at IS NULL
    RETURNING message_id AS "messageId", deleted_at AS "deletedAt"
  `, [senderId, messageId]));
  return result.rows[0] || null;
}

async function unreadCount(userId) {
  const result = await database.cloudQuery(`SELECT COUNT(*)::integer AS count FROM direct_messages
    WHERE recipient_user_id = $1 AND read_at IS NULL AND deleted_at IS NULL`, [userId]);
  return result.rows[0].count;
}

async function companyContacts(companyId) {
  const result = await database.cloudQuery(`
    SELECT DISTINCT u.user_id AS "userId", u.full_name AS "fullName", u.avatar_path AS "avatarPath",
      u.updated_at AS "updatedAt", cr.job_title AS "jobTitle"
    FROM company_representatives cr JOIN users u ON u.user_id = cr.user_id
    WHERE cr.company_id = $1 AND cr.assignment_status = 'ACTIVE' AND u.account_status = 'ACTIVE'
    ORDER BY u.user_id, cr.job_title
  `, [companyId]);
  return result.rows;
}
module.exports = { profile, conversations, history, send, edit, remove, unreadCount, companyContacts };
