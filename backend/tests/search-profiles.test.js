const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const database = require('../config/database');
const search = require('../services/search.service');
const messages = require('../services/message.service');
const users = require('../repositories/user.repository');

test('search and public profiles expose only active, public records', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  const originalQuery = database.query;
  database.query = (sql, values) => pg.query(sql, values);
  try {
    await pg.exec(fs.readFileSync(path.join(__dirname, '../../database/postgres/01_final_schema_postgres.sql'), 'utf8'));
    for (const [name, email, status, headline] of [
      ['Ada Search', 'ada@example.invalid', 'ACTIVE', 'Analyst'],
      ['Alan Search', 'alan@example.invalid', 'ACTIVE', null],
      ['Hidden Search', 'hidden@example.invalid', 'SUSPENDED', null]
    ]) {
      await pg.query(`INSERT INTO users (full_name, email, password_hash, account_status, headline, bio)
        VALUES ($1, $2, $3, $4, $5, $6)`, [name, email, 'x'.repeat(60), status, headline, headline && 'About Ada']);
    }
    await pg.query(`INSERT INTO companies (company_name, industry, headquarters_city, country)
      VALUES ($1, $2, $3, $4)`, ['Search Labs', 'Technology', 'Dhaka', 'Bangladesh']);

    const people = await search.people('search', 1);
    assert.deepEqual(people.map((user) => user.fullName), ['Alan Search']);
    assert.deepEqual(Object.keys(people[0]).sort(), ['avatarUrl', 'displayLabel', 'fullName', 'userId']);
    const combined = await search.all('search', 1);
    assert.equal(combined.users.length, 1);
    assert.equal(combined.companies[0].companyName, 'Search Labs');
    assert.equal(combined.companies[0].industry, 'Technology');
    assert.deepEqual(Object.keys(combined.companies[0]).sort(),
      ['companyId', 'companyName', 'industry', 'logoUrl']);

    const profile = await messages.userProfile(1);
    assert.equal(profile.headline, 'Analyst');
    assert.equal(profile.bio, 'About Ada');
    assert.equal('email' in profile, false);
    assert.equal('passwordHash' in profile, false);
    await assert.rejects(messages.userProfile(3), (error) => error.statusCode === 404);
    assert.deepEqual(await search.people('se%_', 1), []);
    assert.throws(() => search.normalizeQuery('x'), (error) => error.statusCode === 400);

    // A code rollout can precede the owner's manual Supabase migration.
    await pg.exec('ALTER TABLE users DROP COLUMN headline, DROP COLUMN bio');
    assert.equal((await users.findUserByEmail('ada@example.invalid')).headline, null);
    assert.equal((await users.findSafeUserById(1)).bio, null);
    assert.equal((await messages.userProfile(1)).headline, null);
    await pg.exec('DROP TABLE user_skills, skills, user_experience, user_education');
    const bare = await messages.userProfile(1, { includeSections: true });
    assert.deepEqual([bare.education, bare.experience, bare.skills], [[], [], []]);
  } finally {
    database.query = originalQuery;
    await pg.close();
  }
});
