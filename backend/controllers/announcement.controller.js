const announcementService = require('../services/announcement.service');
const { sendSuccess } = require('../utils/apiResponse');

async function listActive(request, response, next) {
  try {
    const announcements = await announcementService.listActiveAnnouncements();
    return sendSuccess(response, 200, 'Active announcements retrieved successfully', announcements);
  } catch (error) { return next(error); }
}

async function listAll(request, response, next) {
  try {
    const result = await announcementService.listAllAnnouncements(request.query);
    return sendSuccess(response, 200, 'Announcements retrieved successfully', result);
  } catch (error) { return next(error); }
}

async function create(request, response, next) {
  try {
    const result = await announcementService.createAnnouncement(request.user.userId, request.body);
    return sendSuccess(response, 201, 'Announcement created successfully', result);
  } catch (error) { return next(error); }
}

async function update(request, response, next) {
  try {
    const result = await announcementService.updateAnnouncement(request.params.announcementId, request.body);
    return sendSuccess(response, 200, 'Announcement updated successfully', result);
  } catch (error) { return next(error); }
}

async function setActive(request, response, next) {
  try {
    const result = await announcementService.setAnnouncementActive(
      request.params.announcementId, request.body
    );
    return sendSuccess(response, 200, 'Announcement visibility updated successfully', result);
  } catch (error) { return next(error); }
}

module.exports = { listActive, listAll, create, update, setActive };
