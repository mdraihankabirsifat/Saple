const repository = require('../repositories/professional-profile.repository');
const createHttpError = require('../utils/httpError');

// Enough for any real career, and a bound on what one public profile returns.
const LIMITS = { education: 20, experience: 40, skills: 50 };

function recordId(value) {
  if (!/^\d+$/.test(String(value))) throw createHttpError(400, 'Invalid profile record ID');
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw createHttpError(400, 'Invalid profile record ID');
  return id;
}

function recordInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createHttpError(400, 'Profile record must be an object');
  }
  return value;
}

function text(value, label, limit, required = false) {
  if (value !== null && value !== undefined && typeof value !== 'string') {
    throw createHttpError(400, `${label} must be text`);
  }
  const result = value?.trim() || null;
  if (required && !result) throw createHttpError(400, `${label} is required`);
  if (result && result.length > limit) throw createHttpError(400, `${label} is too long`);
  return result;
}

function date(value, label, required = false) {
  if (!value && !required) return null;
  if (!value) throw createHttpError(400, `${label} is required`);
  if (typeof value !== 'string') throw createHttpError(400, `${label} must be a date`);
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value);
  if (!match) throw createHttpError(400, `${label} must be a year or date`);
  const year = Number(match[1]);
  const month = Number(match[2] || 1);
  const day = Number(match[3] || 1);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2100 || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
    throw createHttpError(400, `${label} is invalid`);
  }
  return `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function period(input, currentField) {
  if (typeof input[currentField] !== 'boolean') throw createHttpError(400, 'Current status must be true or false');
  const startDate = date(input.startDate, 'Start date', true);
  const endDate = input[currentField] ? null : date(input.endDate, 'End date', true);
  if (endDate && endDate < startDate) throw createHttpError(400, 'End date must follow start date');
  return { startDate, endDate, [currentField]: input[currentField] };
}

function educationValue(input = {}) {
  input = recordInput(input);
  return {
    institution: text(input.institution, 'Institution', 180, true),
    degree: text(input.degree, 'Degree', 160, true),
    fieldOfStudy: text(input.fieldOfStudy, 'Field of study', 160, true),
    ...period(input, 'currentlyStudying'),
    description: text(input.description, 'Description', 2000)
  };
}

function experienceValue(input = {}) {
  input = recordInput(input);
  return {
    organization: text(input.organization, 'Organization', 180, true),
    jobTitle: text(input.jobTitle, 'Job title', 160, true),
    employmentType: text(input.employmentType, 'Employment type', 60),
    location: text(input.location, 'Location', 160),
    ...period(input, 'currentlyWorking'),
    description: text(input.description, 'Description', 2000)
  };
}

function created(record, label, limit) {
  if (!record) throw createHttpError(400, `A profile can list at most ${limit} ${label}`);
  return record;
}

async function createEducation(userId, input) {
  return created(await repository.createEducation(userId, educationValue(input), LIMITS.education),
    'education records', LIMITS.education);
}
async function updateEducation(userId, id, input) {
  const record = await repository.updateEducation(userId, recordId(id), educationValue(input));
  if (!record) throw createHttpError(404, 'Education record not found');
  return record;
}
async function deleteEducation(userId, id) {
  if (!await repository.deleteEducation(userId, recordId(id))) throw createHttpError(404, 'Education record not found');
}
async function createExperience(userId, input) {
  return created(await repository.createExperience(userId, experienceValue(input), LIMITS.experience),
    'experience records', LIMITS.experience);
}
async function updateExperience(userId, id, input) {
  const record = await repository.updateExperience(userId, recordId(id), experienceValue(input));
  if (!record) throw createHttpError(404, 'Experience record not found');
  return record;
}
async function deleteExperience(userId, id) {
  if (!await repository.deleteExperience(userId, recordId(id))) throw createHttpError(404, 'Experience record not found');
}
async function addSkill(userId, input) {
  const name = text(recordInput(input).name, 'Skill', 80, true).replace(/\s+/g, ' ');
  return created(await repository.addSkill(userId, name, LIMITS.skills), 'skills', LIMITS.skills);
}
async function removeSkill(userId, id) {
  if (!await repository.removeSkill(userId, recordId(id))) throw createHttpError(404, 'Skill not found on this profile');
}

module.exports = { LIMITS, educationValue, experienceValue, recordId, createEducation, updateEducation,
  deleteEducation, createExperience, updateExperience, deleteExperience, addSkill, removeSkill };
