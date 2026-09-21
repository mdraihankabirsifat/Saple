const notificationService = require('../services/notification.service');
const { sendSuccess } = require('../utils/apiResponse');

async function list(request, response, next) {
  try {
    const result = await notificationService.listOwnNotifications(request.user, request.query);
    return sendSuccess(response, 200, 'Notifications retrieved successfully', result);
  } catch (error) { return next(error); }
}

async function unreadCount(request, response, next) {
  try {
    const result = await notificationService.getUnreadCount(request.user);
    return sendSuccess(response, 200, 'Unread notification count retrieved successfully', result);
  } catch (error) { return next(error); }
}

async function markRead(request, response, next) {
  try {
    const result = await notificationService.markRead(request.user, request.params.notificationId);
    return sendSuccess(response, 200, 'Notification marked as read', result);
  } catch (error) { return next(error); }
}

async function markAllRead(request, response, next) {
  try {
    const result = await notificationService.markAllRead(request.user);
    return sendSuccess(response, 200, 'All notifications marked as read', result);
  } catch (error) { return next(error); }
}

module.exports = { list, unreadCount, markRead, markAllRead };
