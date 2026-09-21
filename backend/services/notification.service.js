const notificationRepository = require('../repositories/notification.repository');
const createHttpError = require('../utils/httpError');
const validate = require('../utils/validation');

// Where each notification type should send the reader inside Saple. These are
// fixed relative page names, never values taken from the database.
const ENTITY_LINKS = Object.freeze({
  APPLICATION: 'my-applications.html',
  JOB: 'jobs.html',
  ASSIGNMENT: 'representative.html',
  SUBMISSION: 'profile.html',
  VERIFICATION: 'employee-verification.html',
  REPORT: 'profile.html',
  ACCOUNT: 'profile.html'
});

const REPRESENTATIVE_ENTITY_LINKS = Object.freeze({
  APPLICATION: 'representative.html',
  JOB: 'representative.html'
});

function toNotification(row, role) {
  const links = role === 'COMPANY_REPRESENTATIVE'
    ? { ...ENTITY_LINKS, ...REPRESENTATIVE_ENTITY_LINKS }
    : ENTITY_LINKS;

  return {
    notificationId: row.notificationId,
    notificationType: row.notificationType,
    title: row.title,
    message: row.message,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    link: row.relatedEntityType ? links[row.relatedEntityType] || null : null,
    isRead: Boolean(row.readAt),
    readAt: row.readAt,
    createdAt: row.createdAt
  };
}

async function listOwnNotifications(user, query = {}) {
  const unreadOnly = validate.booleanValue(query.unreadOnly, 'unreadOnly', false);
  const page = validate.pagination(query, { defaultSize: 15 });

  const [rows, total, unreadCount] = await Promise.all([
    notificationRepository.findByOwner(user.userId, { ...page, unreadOnly }),
    notificationRepository.countByOwner(user.userId, { unreadOnly }),
    notificationRepository.countUnread(user.userId)
  ]);

  return {
    ...validate.paged(rows.map((row) => toNotification(row, user.role)), total, page),
    unreadCount
  };
}

async function getUnreadCount(user) {
  return { unreadCount: await notificationRepository.countUnread(user.userId) };
}

async function markRead(user, notificationIdValue) {
  const notificationId = validate.positiveId(notificationIdValue, 'notification ID');
  const result = await notificationRepository.markOneRead(user.userId, notificationId);

  // Ownership is enforced in the UPDATE itself, so another account's
  // notification is reported as missing rather than as forbidden.
  if (!result.updated && !result.exists) {
    throw createHttpError(404, 'Notification not found');
  }

  return {
    notificationId,
    isRead: true,
    unreadCount: await notificationRepository.countUnread(user.userId)
  };
}

async function markAllRead(user) {
  const result = await notificationRepository.markAllRead(user.userId);
  return { ...result, unreadCount: 0 };
}

module.exports = {
  ENTITY_LINKS,
  listOwnNotifications,
  getUnreadCount,
  markRead,
  markAllRead
};
