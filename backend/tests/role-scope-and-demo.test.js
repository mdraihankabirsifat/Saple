const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const database = require('../config/database');
const salaryRepository = require('../repositories/salary.repository');

const projectRoot = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const originalGetClient = database.getClient;

test.afterEach(() => {
  database.getClient = originalGetClient;
});

test('final schema directly creates nullable role-scoped verification integrity objects', () => {
  const sql = read('database/sql/01_final_schema.sql');
  const table = sql.match(/CREATE TABLE employment_verifications\s*\([\s\S]*?\n\);/i)?.[0];

  assert.ok(table);
  assert.match(table, /^\s*role_id\s+NUMBER\s*,\s*$/im);
  assert.match(table, /CONSTRAINT fk_emp_verify_role FOREIGN KEY \(role_id\)[\s\S]*?REFERENCES job_roles \(role_id\)/i);
  assert.doesNotMatch(table, /^\s*role_id\s+NUMBER\s+NOT NULL/im);
  assert.match(sql, /CREATE INDEX ix_emp_verify_scope_status\s+ON employment_verifications \(employee_id, company_id, role_id, verification_status\)/i);
});

test('all three contribution repositories enforce role ID in the transactional verification query', () => {
  for (const filename of [
    'backend/repositories/salary.repository.js',
    'backend/repositories/review.repository.js',
    'backend/repositories/interview.repository.js'
  ]) {
    const source = read(filename);
    assert.match(source, /ev?\.role_id = \$3/);
    assert.match(source, /verification_status = 'VERIFIED'/);
    assert.match(source, /expires_at IS NULL OR .*expires_at > CURRENT_TIMESTAMP/);
    assert.match(source, /client\.query\('COMMIT'\)/);
    assert.match(source, /client\.query\('ROLLBACK'\)/);
  }
});

test('a scope becoming invalid before salary insertion rejects and rolls back without a parent row', async () => {
  const calls = [];
  const state = { commits: 0, rollbacks: 0, releases: 0 };
  database.getClient = async () => ({
    query: async (sql, values) => {
      if (sql === 'BEGIN') return {};
      if (sql === 'COMMIT') { state.commits += 1; return {}; }
      if (sql === 'ROLLBACK') { state.rollbacks += 1; return {}; }
      calls.push({ sql, values });
      return { rows: [] };
    },
    release: () => { state.releases += 1; }
  });

  await assert.rejects(
    salaryRepository.createSalarySubmission({
      userId: 8, companyId: 1, roleId: 12, baseSalary: 70000,
      additionalCompensation: 5000, currency: 'BDT', payPeriod: 'MONTHLY',
      yearsOfExperience: 3, employmentType: 'FULL_TIME', workMode: 'HYBRID',
      salaryYear: 2026, isAnonymous: true
    }),
    (error) => error.sapleCode === 'VERIFICATION_REQUIRED'
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /ev\.role_id = \$3/);
  assert.deepEqual(calls[0].values, [8, 1, 12]);
  assert.deepEqual(state, { commits: 0, rollbacks: 1, releases: 1 });
});

test('verified-scope frontend controls never load arbitrary contribution roles', () => {
  const helper = read('frontend/js/contribution-access.js');
  assert.match(helper, /verifiedScopes/);
  assert.match(helper, /scope\.companyId/);
  assert.match(helper, /scope\.roleId/);
  assert.match(helper, /Select a verified designation/);

  for (const filename of [
    'frontend/js/submit-salary.js',
    'frontend/js/review.js',
    'frontend/js/interview.js'
  ]) {
    const source = read(filename);
    assert.match(source, /populateVerifiedScopeSelects/);
    assert.doesNotMatch(source, /fetchApi\('\/api\/job-roles'\)/);
  }
});

test('consolidated demonstration data is guarded, synthetic, role-scoped, and dense by construction', () => {
  const sql = read('database/sql/02_final_demo_data.sql');
  assert.match(sql, /saple\.demo\.c.*@example\.invalid/i);
  assert.match(sql, /FOR salary_number IN 1\.\.5 LOOP/i);
  assert.match(sql, /FOR review_number IN 1\.\.3 LOOP/i);
  assert.match(sql, /role_id, verification_method/i);
  assert.match(sql, /WHERE NOT EXISTS/gi);
  assert.match(sql, /ROLLBACK;\s*RAISE;/i);
  assert.doesNotMatch(sql, /\bDELETE\b/i);
  assert.match(sql, /must never be used as trustworthy ML training data/i);
});
