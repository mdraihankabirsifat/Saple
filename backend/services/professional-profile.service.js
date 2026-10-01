const repository = require('../repositories/professional-profile.repository');
const createHttpError = require('../utils/httpError');
const mlScreening = require('./ml-screening.service');
const profileModeration = require('./profile-moderation.service');

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

async function moderatedChange(userId, change) {
  if (!mlScreening.enabled()) return { result: await change(null), moderation: null };
  const previous = await profileModeration.loadSnapshot(userId);
  if (!previous) throw createHttpError(401, 'Authenticated account is unavailable');
  const proposed = change(previous);
  const moderation = await profileModeration.submit(userId, previous, proposed);
  if (!moderation.applied) return { result: null, moderation };
  return { result: await repository.listSections(userId), moderation };
}

function pending(moderation) {
  return { pendingReview: true, moderation: {
    state: moderation.publicationState,
    screeningStatus: moderation.screening?.screeningStatus || null,
    reasonCodes: moderation.screening?.reasonCodes || []
  } };
}

async function createEducation(userId, input) {
  const value = educationValue(input);
  if (!mlScreening.enabled()) return created(await repository.createEducation(userId, value, LIMITS.education),
    'education records', LIMITS.education);
  const output = await moderatedChange(userId, (current) => {
    if (current.education.length >= LIMITS.education) throw createHttpError(400, `A profile can list at most ${LIMITS.education} education records`);
    return { ...current, education: [...current.education, value] };
  });
  if (!output.moderation.applied) return pending(output.moderation);
  return output.result.education.at(-1);
}
async function updateEducation(userId, id, input) {
  const educationId = recordId(id); const value = educationValue(input);
  if (!mlScreening.enabled()) {
    const record = await repository.updateEducation(userId, educationId, value);
    if (!record) throw createHttpError(404, 'Education record not found');
    return record;
  }
  const output = await moderatedChange(userId, (current) => {
    if (!current.education.some((item) => Number(item.educationId) === educationId)) throw createHttpError(404, 'Education record not found');
    return { ...current, education: current.education.map((item) => Number(item.educationId) === educationId ? { ...item, ...value } : item) };
  });
  if (!output.moderation.applied) return pending(output.moderation);
  return output.result.education.find((item) => item.institution === value.institution) || output.result.education[0];
}
async function deleteEducation(userId, id) {
  const educationId = recordId(id);
  if (!mlScreening.enabled()) {
    if (!await repository.deleteEducation(userId, educationId)) throw createHttpError(404, 'Education record not found');
    return { deleted: true };
  }
  const output = await moderatedChange(userId, (current) => {
    if (!current.education.some((item) => Number(item.educationId) === educationId)) throw createHttpError(404, 'Education record not found');
    return { ...current, education: current.education.filter((item) => Number(item.educationId) !== educationId) };
  });
  return output.moderation.applied ? { deleted: true } : pending(output.moderation);
}
async function createExperience(userId, input) {
  const value = experienceValue(input);
  if (!mlScreening.enabled()) return created(await repository.createExperience(userId, value, LIMITS.experience),
    'experience records', LIMITS.experience);
  const output = await moderatedChange(userId, (current) => {
    if (current.experience.length >= LIMITS.experience) throw createHttpError(400, `A profile can list at most ${LIMITS.experience} experience records`);
    return { ...current, experience: [...current.experience, value] };
  });
  if (!output.moderation.applied) return pending(output.moderation);
  return output.result.experience.at(-1);
}
async function updateExperience(userId, id, input) {
  const experienceId = recordId(id); const value = experienceValue(input);
  if (!mlScreening.enabled()) {
    const record = await repository.updateExperience(userId, experienceId, value);
    if (!record) throw createHttpError(404, 'Experience record not found');
    return record;
  }
  const output = await moderatedChange(userId, (current) => {
    if (!current.experience.some((item) => Number(item.experienceId) === experienceId)) throw createHttpError(404, 'Experience record not found');
    return { ...current, experience: current.experience.map((item) => Number(item.experienceId) === experienceId ? { ...item, ...value } : item) };
  });
  if (!output.moderation.applied) return pending(output.moderation);
  return output.result.experience.find((item) => item.organization === value.organization) || output.result.experience[0];
}
async function deleteExperience(userId, id) {
  const experienceId = recordId(id);
  if (!mlScreening.enabled()) {
    if (!await repository.deleteExperience(userId, experienceId)) throw createHttpError(404, 'Experience record not found');
    return { deleted: true };
  }
  const output = await moderatedChange(userId, (current) => {
    if (!current.experience.some((item) => Number(item.experienceId) === experienceId)) throw createHttpError(404, 'Experience record not found');
    return { ...current, experience: current.experience.filter((item) => Number(item.experienceId) !== experienceId) };
  });
  return output.moderation.applied ? { deleted: true } : pending(output.moderation);
}
async function addSkill(userId, input) {
  const name = text(recordInput(input).name, 'Skill', 80, true).replace(/\s+/g, ' ');
  if (!mlScreening.enabled()) return created(await repository.addSkill(userId, name, LIMITS.skills), 'skills', LIMITS.skills);
  const output = await moderatedChange(userId, (current) => {
    if (current.skills.some((item) => item.name.toLowerCase() === name.toLowerCase())) return current;
    if (current.skills.length >= LIMITS.skills) throw createHttpError(400, `A profile can list at most ${LIMITS.skills} skills`);
    return { ...current, skills: [...current.skills, { name }] };
  });
  if (!output.moderation.applied) return pending(output.moderation);
  return output.result.skills.find((item) => item.name.toLowerCase() === name.toLowerCase());
}
async function removeSkill(userId, id) {
  const skillId = recordId(id);
  if (!mlScreening.enabled()) {
    if (!await repository.removeSkill(userId, skillId)) throw createHttpError(404, 'Skill not found on this profile');
    return { deleted: true };
  }
  const output = await moderatedChange(userId, (current) => {
    if (!current.skills.some((item) => Number(item.skillId) === skillId)) throw createHttpError(404, 'Skill not found on this profile');
    return { ...current, skills: current.skills.filter((item) => Number(item.skillId) !== skillId) };
  });
  return output.moderation.applied ? { deleted: true } : pending(output.moderation);
}

module.exports = { LIMITS, educationValue, experienceValue, recordId, createEducation, updateEducation,
  deleteEducation, createExperience, updateExperience, deleteExperience, addSkill, removeSkill };
