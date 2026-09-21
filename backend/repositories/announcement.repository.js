const database = require('../config/database');

const ANNOUNCEMENT_SELECT = `
  SELECT a.announcement_id AS "announcementId", a.title, a.message, a.severity,
    a.is_dismissible AS "isDismissible", a.is_active AS "isActive",
    a.starts_at AS "startsAt", a.ends_at AS "endsAt",
    a.created_by AS "createdBy", a.created_at AS "createdAt",
    a.updated_at AS "updatedAt"
  FROM announcements a
`;

// The public endpoint applies the schedule in SQL, so a scheduled or expired
// announcement is never sent to a browser at all.
async function findActiveAnnouncements() {
  const result = await database.query(`
    SELECT announcement_id AS "announcementId", title, message, severity,
      is_dismissible AS "isDismissible", starts_at AS "startsAt", ends_at AS "endsAt",
      updated_at AS "updatedAt"
    FROM announcements
    WHERE is_active = TRUE
      AND starts_at <= CURRENT_TIMESTAMP
      AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
    ORDER BY
      CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END,
      starts_at DESC, announcement_id DESC
    LIMIT 5
  `);
  return result.rows;
}

async function findAllAnnouncements({ limit, offset }) {
  const result = await database.query(`
    ${ANNOUNCEMENT_SELECT}
    ORDER BY a.starts_at DESC, a.announcement_id DESC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);
  return result.rows;
}

async function countAllAnnouncements() {
  const result = await database.query('SELECT COUNT(*)::int AS "total" FROM announcements');
  return result.rows[0].total;
}

async function findAnnouncementById(announcementId) {
  const result = await database.query(
    `${ANNOUNCEMENT_SELECT} WHERE a.announcement_id = $1`,
    [announcementId]
  );
  return result.rows[0] || null;
}

async function createAnnouncement(input) {
  const result = await database.query(`
    INSERT INTO announcements (
      title, message, severity, is_dismissible, is_active, starts_at, ends_at, created_by
    ) VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_TIMESTAMP), $7, $8)
    RETURNING announcement_id AS "announcementId"
  `, [
    input.title, input.message, input.severity, input.isDismissible,
    input.isActive, input.startsAt, input.endsAt, input.createdBy
  ]);
  return { announcementId: result.rows[0].announcementId };
}

async function updateAnnouncement(announcementId, input) {
  const result = await database.query(`
    UPDATE announcements SET
      title = $1, message = $2, severity = $3, is_dismissible = $4,
      is_active = $5, starts_at = COALESCE($6, starts_at), ends_at = $7,
      updated_at = CURRENT_TIMESTAMP
    WHERE announcement_id = $8
    RETURNING announcement_id AS "announcementId"
  `, [
    input.title, input.message, input.severity, input.isDismissible,
    input.isActive, input.startsAt, input.endsAt, announcementId
  ]);
  return result.rows[0] || null;
}

async function setAnnouncementActive(announcementId, isActive) {
  const result = await database.query(`
    UPDATE announcements SET is_active = $1, updated_at = CURRENT_TIMESTAMP
    WHERE announcement_id = $2
    RETURNING announcement_id AS "announcementId", is_active AS "isActive"
  `, [isActive, announcementId]);
  return result.rows[0] || null;
}

module.exports = {
  findActiveAnnouncements,
  findAllAnnouncements,
  countAllAnnouncements,
  findAnnouncementById,
  createAnnouncement,
  updateAnnouncement,
  setAnnouncementActive
};
