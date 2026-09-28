const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const database = require('../config/database');
const service = require('../services/professional-profile.service');
const messages = require('../services/message.service');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const rejectsWith = (status) => (error) => error.statusCode === status;

const education = (overrides = {}) => ({ institution: 'BUET', degree: 'BSc', fieldOfStudy: 'CSE',
  startDate: '2021-02', endDate: '2025-06', currentlyStudying: false, ...overrides });
const experience = (overrides = {}) => ({ organization: 'Saple Labs', jobTitle: 'Engineer',
  startDate: '2025-07', currentlyWorking: true, ...overrides });

test('education and experience input is validated before it reaches the database', () => {
  assert.deepEqual(service.educationValue(education({ description: '  Thesis on maps  ' })), {
    institution: 'BUET', degree: 'BSc', fieldOfStudy: 'CSE', startDate: '2021-02-01',
    endDate: '2025-06-01', currentlyStudying: false, description: 'Thesis on maps'
  });
  // A year alone is enough, and a current record never keeps an end date.
  const current = service.experienceValue(experience({ startDate: '2024', endDate: '2025-01' }));
  assert.equal(current.startDate, '2024-01-01');
  assert.equal(current.endDate, null);
  assert.equal(current.employmentType, null);

  for (const bad of [
    education({ institution: '  ' }), education({ degree: undefined }), education({ fieldOfStudy: 7 }),
    education({ startDate: '' }), education({ startDate: '2021-13' }), education({ startDate: '2021-02-30' }),
    education({ endDate: '2020-01' }), education({ endDate: null }), education({ currentlyStudying: 'yes' }),
    education({ description: 'x'.repeat(2001) }), education({ institution: 'x'.repeat(181) })
  ]) {
    assert.throws(() => service.educationValue(bad), rejectsWith(400), JSON.stringify(bad));
  }
  for (const bad of [experience({ jobTitle: '' }), experience({ location: 'x'.repeat(161) }),
    experience({ employmentType: ['Full-time'] }), experience({ currentlyWorking: undefined })]) {
    assert.throws(() => service.experienceValue(bad), rejectsWith(400), JSON.stringify(bad));
  }
  for (const bad of [null, [], 'text']) assert.throws(() => service.educationValue(bad), rejectsWith(400));
  for (const id of ['0', '-1', '1.5', '1abc', '99999999999999999999']) {
    assert.throws(() => service.recordId(id), rejectsWith(400), id);
  }
});

test('profile sections are owned, constrained, deduplicated and capped in PostgreSQL', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  const original = { query: database.query, withTransaction: database.withTransaction };
  const limits = { ...service.LIMITS };
  database.query = (sql, values) => pg.query(sql, values);
  database.withTransaction = (work) => pg.transaction((client) => work(client));
  try {
    await pg.exec(read('database/postgres/01_final_schema_postgres.sql'));
    for (const [name, email] of [['Ada Profile', 'ada@example.invalid'], ['Alan Profile', 'alan@example.invalid']]) {
      await pg.query(`INSERT INTO users (full_name, email, password_hash, headline, bio)
        VALUES ($1, $2, $3, 'Engineer', 'About me')`, [name, email, 'x'.repeat(60)]);
    }

    const study = await service.createEducation(1, education());
    assert.equal(study.startDate, '2021-02');
    assert.equal(study.endDate, '2025-06');
    const job = await service.createExperience(1, experience({ location: 'Dhaka' }));
    assert.equal(job.currentlyWorking, true);
    assert.equal(job.endDate, null);

    // Editing switches a current role to a finished one.
    const edited = await service.updateExperience(1, job.experienceId,
      experience({ location: 'Dhaka', currentlyWorking: false, endDate: '2026-01' }));
    assert.equal(edited.endDate, '2026-01');

    // Another member can neither edit nor delete these records.
    await assert.rejects(service.updateEducation(2, study.educationId, education()), rejectsWith(404));
    await assert.rejects(service.deleteEducation(2, study.educationId), rejectsWith(404));
    await assert.rejects(service.deleteExperience(2, job.experienceId), rejectsWith(404));

    // Skills are one shared catalogue, matched ignoring case.
    const sql = await service.addSkill(1, { name: '  SQL  ' });
    assert.equal(sql.name, 'SQL');
    assert.deepEqual(await service.addSkill(1, { name: 'sql' }), sql);
    assert.equal((await service.addSkill(2, { name: 'sql' })).skillId, sql.skillId);
    await service.addSkill(1, { name: 'Data   modelling' });
    assert.equal((await pg.query('SELECT COUNT(*)::int AS count FROM skills')).rows[0].count, 2);
    await service.removeSkill(1, sql.skillId);
    await assert.rejects(service.removeSkill(1, sql.skillId), rejectsWith(404));
    // The link is gone; the catalogue entry another member still lists is not.
    assert.equal((await pg.query('SELECT COUNT(*)::int AS count FROM skills')).rows[0].count, 2);

    // The database enforces the same rules if the service is ever bypassed.
    for (const statement of [
      `INSERT INTO user_education (user_id, institution, degree, field_of_study, start_date, end_date)
        VALUES (1, 'X', 'Y', 'Z', '2024-01-01', '2023-01-01')`,
      `INSERT INTO user_experience (user_id, organization, job_title, start_date, end_date, currently_working)
        VALUES (1, 'X', 'Y', '2024-01-01', '2024-06-01', TRUE)`,
      `INSERT INTO user_experience (user_id, organization, job_title, start_date, currently_working)
        VALUES (1, ' ', 'Y', '2024-01-01', TRUE)`,
      "INSERT INTO skills (skill_name) VALUES ('Data Modelling')",
      `INSERT INTO user_skills (user_id, skill_id) VALUES (1, ${sql.skillId}), (1, ${sql.skillId})`
    ]) {
      await assert.rejects(pg.query(statement), undefined, statement);
    }
    await assert.rejects(pg.query(`DELETE FROM skills WHERE skill_id = ${sql.skillId}`));

    // Each profile is bounded.
    service.LIMITS.skills = 2;
    await service.addSkill(1, { name: 'Go' });
    await assert.rejects(service.addSkill(1, { name: 'Rust' }), rejectsWith(400));
    assert.equal((await service.addSkill(1, { name: 'go' })).name, 'Go');
    service.LIMITS.education = 1;
    await assert.rejects(service.createEducation(1, education()), rejectsWith(400));

    // The member-facing profile carries the sections and nothing private.
    const profile = await messages.userProfile(1, { includeSections: true });
    assert.deepEqual(Object.keys(profile).sort(), ['avatarUrl', 'bio', 'displayLabel', 'education',
      'experience', 'fullName', 'headline', 'skills', 'userId']);
    assert.equal(profile.headline, 'Engineer');
    assert.deepEqual(profile.skills.map((skill) => skill.name), ['Data modelling', 'Go']);
    assert.equal(profile.education[0].institution, 'BUET');
    assert.equal(profile.experience[0].location, 'Dhaka');
    assert.doesNotMatch(JSON.stringify(profile), /example\.invalid|password|x{60}/);

    // Deleting an account removes its private sections, never the shared catalogue.
    await service.deleteEducation(1, study.educationId);
    await pg.query('DELETE FROM users WHERE user_id = 1');
    for (const table of ['user_education', 'user_experience']) {
      assert.equal((await pg.query(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count, 0, table);
    }
    assert.equal((await pg.query('SELECT COUNT(*)::int AS count FROM user_skills')).rows[0].count, 1);
    assert.equal((await pg.query('SELECT COUNT(*)::int AS count FROM skills')).rows[0].count, 3);
  } finally {
    Object.assign(service.LIMITS, limits);
    Object.assign(database, original);
    await pg.close();
  }
});

test('every section route is signed-in only and writes are rate limited', () => {
  const routes = read('backend/routes/me.routes.js');
  const guard = routes.indexOf('router.use(authenticate)');
  assert.ok(guard > 0);
  for (const route of [
    "router.get('/professional-profile'", "router.post('/education', profileWriteLimit",
    "router.patch('/education/:recordId', profileWriteLimit", "router.delete('/education/:recordId', profileWriteLimit",
    "router.post('/experience', profileWriteLimit", "router.patch('/experience/:recordId', profileWriteLimit",
    "router.delete('/experience/:recordId', profileWriteLimit", "router.post('/skills', profileWriteLimit",
    "router.delete('/skills/:skillId', profileWriteLimit"
  ]) {
    assert.ok(routes.indexOf(route) > guard, route);
  }
  // Every write names the signed-in account; no route takes a user id to act on.
  const controller = read('backend/controllers/professional-profile.controller.js');
  assert.equal((controller.match(/req\.user\.userId/g) || []).length, 9);
  assert.doesNotMatch(controller, /req\.(params|body)\.userId/);
  // Profiles are public and read-only; people search for messaging stays signed-in.
  assert.match(read('backend/routes/user.routes.js'),
    /'\/:userId\/profile', searchLimit[\s\S]*router\.use\(authenticate\);[\s\S]*'\/search'/);
});

test('the migration adds the sections without a LinkedIn field', () => {
  const migration = read('database/postgres/migrations/008_public_profiles_and_search.sql');
  const schema = read('database/postgres/01_final_schema_postgres.sql');
  for (const source of [migration, schema]) {
    assert.doesNotMatch(source, /linkedin/i);
    assert.match(source, /headline\s+VARCHAR\(160\)/);
    assert.match(source, /bio\s+VARCHAR\(2000\)/);
    for (const table of ['user_education', 'user_experience', 'skills', 'user_skills']) {
      assert.match(source, new RegExp(`CREATE TABLE (IF NOT EXISTS )?${table} \\(`), table);
    }
    assert.match(source, /CONSTRAINT pk_user_skills PRIMARY KEY \(user_id, skill_id\)/);
    assert.match(source, /uk_skills_name_ci ON skills \(LOWER\(skill_name\)\)/);
  }
});

test('the profile pages edit and show sections without private data or unsafe HTML', () => {
  const page = read('frontend/profile.html');
  for (const id of ['profile-headline', 'profile-bio', 'profile-experience-form', 'profile-education-form',
    'profile-skills-form', 'experience-current', 'education-current', 'experience-cancel', 'education-cancel']) {
    assert.match(page, new RegExp(`id="${id}"`), id);
  }
  const own = read('frontend/js/professional-profile.js');
  const shown = read('frontend/js/user-profile.js');
  for (const source of [page, own, shown]) assert.doesNotMatch(source, /linkedin/i);
  for (const source of [own, shown]) assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|document\.write/);
  // The public view renders only the public fields the API returns.
  assert.doesNotMatch(shown, /\.email|verification|application|submission/i);
  for (const field of ['user.headline', 'user.bio', 'user.experience', 'user.education', 'user.skills']) {
    assert.ok(shown.includes(field), field);
  }
});
