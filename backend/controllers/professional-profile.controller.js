const repository = require('../repositories/professional-profile.repository');
const service = require('../services/professional-profile.service');
const { sendSuccess } = require('../utils/apiResponse');
const createHttpError = require('../utils/httpError');

function handle(work) { return async (request, response, next) => {
  try { return await work(request, response); }
  catch (error) {
    if (['42P01', '42703'].includes(error.code)) {
      return next(createHttpError(503, 'Professional profiles are temporarily unavailable'));
    }
    return next(error);
  }
}; }

const own = handle(async (req, res) => sendSuccess(res, 200, 'Profile sections retrieved',
  await repository.listSections(req.user.userId)));
const addEducation = handle(async (req, res) => sendSuccess(res, 201, 'Education added',
  { education: await service.createEducation(req.user.userId, req.body) }));
const editEducation = handle(async (req, res) => sendSuccess(res, 200, 'Education updated',
  { education: await service.updateEducation(req.user.userId, req.params.recordId, req.body) }));
const removeEducation = handle(async (req, res) => {
  await service.deleteEducation(req.user.userId, req.params.recordId);
  return sendSuccess(res, 200, 'Education removed', { deleted: true });
});
const addExperience = handle(async (req, res) => sendSuccess(res, 201, 'Experience added',
  { experience: await service.createExperience(req.user.userId, req.body) }));
const editExperience = handle(async (req, res) => sendSuccess(res, 200, 'Experience updated',
  { experience: await service.updateExperience(req.user.userId, req.params.recordId, req.body) }));
const removeExperience = handle(async (req, res) => {
  await service.deleteExperience(req.user.userId, req.params.recordId);
  return sendSuccess(res, 200, 'Experience removed', { deleted: true });
});
const addSkill = handle(async (req, res) => sendSuccess(res, 201, 'Skill added',
  { skill: await service.addSkill(req.user.userId, req.body) }));
const removeSkill = handle(async (req, res) => {
  await service.removeSkill(req.user.userId, req.params.skillId);
  return sendSuccess(res, 200, 'Skill removed', { deleted: true });
});

module.exports = { own, addEducation, editEducation, removeEducation,
  addExperience, editExperience, removeExperience, addSkill, removeSkill };
