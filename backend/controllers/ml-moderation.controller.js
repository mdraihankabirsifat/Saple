const repository = require('../repositories/ml-screening.repository');
const { sendSuccess } = require('../utils/apiResponse');
const createHttpError = require('../utils/httpError');

function positiveId(value) {
  const id = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(id) || id < 1) {
    throw createHttpError(400, 'Invalid screening ID');
  }
  return id;
}

async function queue(req, res, next) {
  try {
    return sendSuccess(res, 200, 'Pending screening queue retrieved',
      await repository.findPendingScreenings());
  } catch (error) { return next(error); }
}

async function decide(req, res, next) {
  try {
    const screeningId = positiveId(req.params.screeningId);
    const status = req.body?.status;
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (!['APPROVED', 'REJECTED'].includes(status)) throw createHttpError(400, 'Decision must be APPROVED or REJECTED');
    if (note.length > 1000 || (status === 'REJECTED' && !note)) {
      throw createHttpError(400, 'A rejection note is required and must be at most 1000 characters');
    }
    const record = await repository.findScreening(screeningId);
    if (!record) throw createHttpError(404, 'Screening not found');
    if (!['PROFILE', 'JOB'].includes(record.entity_type)) {
      throw createHttpError(400, 'Use the submission moderation panel for this content');
    }
    const result = record.entity_type === 'PROFILE'
      ? await repository.decideProfileScreening({ screeningId, moderatorUserId: req.user.userId, status, note })
      : await repository.decideJobScreening({ screeningId, moderatorUserId: req.user.userId, status, note });
    if (!result) throw createHttpError(409, 'This screening has already been reviewed');
    return sendSuccess(res, 200, 'Human review recorded', result);
  } catch (error) { return next(error); }
}

module.exports = { queue, decide };
