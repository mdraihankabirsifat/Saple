const database = require('../config/database');

const educationFields = `education_id AS "educationId", institution, degree,
  field_of_study AS "fieldOfStudy", TO_CHAR(start_date, 'YYYY-MM') AS "startDate",
  TO_CHAR(end_date, 'YYYY-MM') AS "endDate", currently_studying AS "currentlyStudying", description`;
const experienceFields = `experience_id AS "experienceId", organization, job_title AS "jobTitle",
  employment_type AS "employmentType", location,
  TO_CHAR(start_date, 'YYYY-MM') AS "startDate", TO_CHAR(end_date, 'YYYY-MM') AS "endDate",
  currently_working AS "currentlyWorking", description`;

async function listSections(userId) {
  try {
    const [education, experience, skills] = await Promise.all([
      database.query(`SELECT ${educationFields} FROM user_education
        WHERE user_id = $1 ORDER BY start_date DESC, education_id DESC`, [userId]),
      database.query(`SELECT ${experienceFields} FROM user_experience
        WHERE user_id = $1 ORDER BY start_date DESC, experience_id DESC`, [userId]),
      database.query(`SELECT s.skill_id AS "skillId", s.skill_name AS name
        FROM user_skills us JOIN skills s ON s.skill_id = us.skill_id
        WHERE us.user_id = $1 ORDER BY LOWER(s.skill_name), s.skill_id`, [userId])
    ]);
    return { education: education.rows, experience: experience.rows, skills: skills.rows };
  } catch (error) {
    // A code rollout can precede the owner's manual migration 008.
    if (error.code === '42P01') return { education: [], experience: [], skills: [] };
    throw error;
  }
}

// Serializes one account's writes on its users row, so two parallel requests
// cannot both pass the count check. False means the account is at its limit.
async function hasRoom(client, table, userId, limit) {
  await client.query('SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE', [userId]);
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE user_id = $1`, [userId]);
  return result.rows[0].count < limit;
}

async function createEducation(userId, value, limit) {
  return database.withTransaction(async (client) => {
    if (!await hasRoom(client, 'user_education', userId, limit)) return null;
    const result = await client.query(`INSERT INTO user_education
    (user_id, institution, degree, field_of_study, start_date, end_date, currently_studying, description)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING ${educationFields}`, [userId, value.institution, value.degree, value.fieldOfStudy,
    value.startDate, value.endDate, value.currentlyStudying, value.description]);
    return result.rows[0];
  });
}

async function updateEducation(userId, educationId, value) {
  const result = await database.query(`UPDATE user_education SET institution = $3, degree = $4,
    field_of_study = $5, start_date = $6, end_date = $7, currently_studying = $8,
    description = $9 WHERE user_id = $1 AND education_id = $2
    RETURNING ${educationFields}`, [userId, educationId, value.institution, value.degree,
    value.fieldOfStudy, value.startDate, value.endDate, value.currentlyStudying, value.description]);
  return result.rows[0] || null;
}

async function deleteEducation(userId, educationId) {
  const result = await database.query('DELETE FROM user_education WHERE user_id = $1 AND education_id = $2',
    [userId, educationId]);
  return result.rowCount === 1;
}

async function createExperience(userId, value, limit) {
  return database.withTransaction(async (client) => {
    if (!await hasRoom(client, 'user_experience', userId, limit)) return null;
    const result = await client.query(`INSERT INTO user_experience
    (user_id, organization, job_title, employment_type, location, start_date, end_date, currently_working, description)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING ${experienceFields}`, [userId, value.organization, value.jobTitle, value.employmentType,
    value.location, value.startDate, value.endDate, value.currentlyWorking, value.description]);
    return result.rows[0];
  });
}

async function updateExperience(userId, experienceId, value) {
  const result = await database.query(`UPDATE user_experience SET organization = $3, job_title = $4,
    employment_type = $5, location = $6, start_date = $7, end_date = $8,
    currently_working = $9, description = $10 WHERE user_id = $1 AND experience_id = $2
    RETURNING ${experienceFields}`, [userId, experienceId, value.organization, value.jobTitle,
    value.employmentType, value.location, value.startDate, value.endDate,
    value.currentlyWorking, value.description]);
  return result.rows[0] || null;
}

async function deleteExperience(userId, experienceId) {
  const result = await database.query('DELETE FROM user_experience WHERE user_id = $1 AND experience_id = $2',
    [userId, experienceId]);
  return result.rowCount === 1;
}

async function addSkill(userId, name, limit) {
  return database.withTransaction(async (client) => {
    // Adding a skill the profile already lists is a no-op, even at the limit.
    const linked = await client.query(`SELECT s.skill_id AS "skillId", s.skill_name AS name
      FROM user_skills us JOIN skills s ON s.skill_id = us.skill_id
      WHERE us.user_id = $1 AND LOWER(s.skill_name) = LOWER($2)`, [userId, name]);
    if (linked.rows[0]) return linked.rows[0];
    if (!await hasRoom(client, 'user_skills', userId, limit)) return null;
    const inserted = await client.query(`INSERT INTO skills (skill_name) VALUES ($1)
      ON CONFLICT DO NOTHING RETURNING skill_id AS "skillId", skill_name AS name`, [name]);
    const skill = inserted.rows[0] || (await client.query(`SELECT skill_id AS "skillId", skill_name AS name
      FROM skills WHERE LOWER(skill_name) = LOWER($1)`, [name])).rows[0];
    await client.query(`INSERT INTO user_skills (user_id, skill_id) VALUES ($1, $2)
      ON CONFLICT DO NOTHING`, [userId, skill.skillId]);
    return skill;
  });
}

async function removeSkill(userId, skillId) {
  const result = await database.query('DELETE FROM user_skills WHERE user_id = $1 AND skill_id = $2',
    [userId, skillId]);
  return result.rowCount === 1;
}

module.exports = { listSections, createEducation, updateEducation, deleteEducation,
  createExperience, updateExperience, deleteExperience, addSkill, removeSkill };
