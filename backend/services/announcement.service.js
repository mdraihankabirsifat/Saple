const announcementRepository = require('../repositories/announcement.repository');
const createHttpError = require('../utils/httpError');
const validate = require('../utils/validation');

const SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'];

// Announcements are plain text end to end: rejected here, rejected again by a
// database CHECK, and rendered with textContent in the browser.
function plainText(value, label, options) {
  const text = options.paragraph
    ? validate.requiredParagraph(value, label, options)
    : validate.requiredText(value, label, options);

  if (/[<>]/.test(text)) {
    throw createHttpError(400, `${label} must be plain text without angle brackets`);
  }
  return text;
}

function parseAnnouncementInput(input = {}) {
  const startsAt = validate.optionalTimestamp(input.startsAt, 'Start time');
  const endsAt = validate.optionalTimestamp(input.endsAt, 'End time');

  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw createHttpError(400, 'The end time must be after the start time');
  }
  if (!startsAt && endsAt && new Date(endsAt) <= new Date()) {
    throw createHttpError(400, 'The end time must be in the future');
  }

  return {
    title: plainText(input.title, 'Title', { min: 4, max: 160 }),
    message: plainText(input.message, 'Message', { min: 10, max: 600, paragraph: true }),
    severity: validate.enumValue(input.severity || 'INFO', SEVERITIES, 'Severity'),
    isDismissible: validate.booleanValue(input.isDismissible, 'isDismissible', true),
    isActive: validate.booleanValue(input.isActive, 'isActive', true),
    startsAt,
    endsAt
  };
}

// Public. Returns only what is inside its schedule window right now.
async function listActiveAnnouncements() {
  return announcementRepository.findActiveAnnouncements();
}

async function listAllAnnouncements(query = {}) {
  const page = validate.pagination(query, { defaultSize: 20 });
  const [items, total] = await Promise.all([
    announcementRepository.findAllAnnouncements(page),
    announcementRepository.countAllAnnouncements()
  ]);
  return validate.paged(items, total, page);
}

async function createAnnouncement(actorUserId, input = {}) {
  const parsed = parseAnnouncementInput(input);
  return announcementRepository.createAnnouncement({ ...parsed, createdBy: actorUserId });
}

async function updateAnnouncement(announcementIdValue, input = {}) {
  const announcementId = validate.positiveId(announcementIdValue, 'announcement ID');
  const existing = await announcementRepository.findAnnouncementById(announcementId);
  if (!existing) throw createHttpError(404, 'Announcement not found');

  const parsed = parseAnnouncementInput(input);
  const updated = await announcementRepository.updateAnnouncement(announcementId, parsed);
  if (!updated) throw createHttpError(404, 'Announcement not found');
  return updated;
}

async function setAnnouncementActive(announcementIdValue, input = {}) {
  const announcementId = validate.positiveId(announcementIdValue, 'announcement ID');
  const isActive = validate.booleanValue(input.isActive, 'isActive', undefined);
  if (isActive === undefined) throw createHttpError(400, 'isActive must be true or false');

  const updated = await announcementRepository.setAnnouncementActive(announcementId, isActive);
  if (!updated) throw createHttpError(404, 'Announcement not found');
  return updated;
}

module.exports = {
  SEVERITIES,
  listActiveAnnouncements,
  listAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  setAnnouncementActive
};
