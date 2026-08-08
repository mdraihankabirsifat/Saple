const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const database = require('../config/database');
const salaryRepository = require('../repositories/salary.repository');

const projectRoot = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const originalGetConnection = database.getConnection;

test.afterEach(() => {
  database.getConnection = originalGetConnection;
});

test('migration 07 preserves unresolved legacy rows and installs exact-scope integrity objects', () => {
  const sql = read('database/07_add_role_scoped_verification.sql');
  assert.match(sql, /ADD \(\s*role_id NUMBER\s*\)/i);
  assert.match(sql, /HAVING COUNT\(DISTINCT role_id\) = 1/i);
  assert.match(sql, /FOREIGN KEY \(role_id\) REFERENCES job_roles \(role_id\)/i);
  assert.match(sql, /employee_id,\s*company_id,\s*role_id,\s*verification_status/i);
  assert.doesNotMatch(sql, /role_id NUMBER NOT NULL/i);
});

test('all three contribution repositories enforce role ID in the transactional verification query', () => {
  for (const filename of [
    'backend/repositories/salary.repository.js',
    'backend/repositories/review.repository.js',
    'backend/repositories/interview.repository.js'
  ]) {
    const source = read(filename);
    assert.match(source, /ev?\.role_id = :roleId/);
    assert.match(source, /verification_status = 'VERIFIED'/);
    assert.match(source, /expires_at IS NULL OR .*expires_at > SYSTIMESTAMP/);
    assert.match(source, /connection\.commit\(\)/);
    assert.match(source, /connection\.rollback\(\)/);
  }
});

test('a scope becoming invalid before salary insertion rejects and rolls back without a parent row', async () => {
  const calls = [];
  const state = { commits: 0, rollbacks: 0, closes: 0 };
  database.getConnection = async () => ({
    execute: async (sql, binds) => {
      calls.push({ sql, binds });
      return { rows: [] };
    },
    commit: async () => { state.commits += 1; },
    rollback: async () => { state.rollbacks += 1; },
    close: async () => { state.closes += 1; }
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
  assert.match(calls[0].sql, /ev\.role_id = :roleId/);
  assert.deepEqual(calls[0].binds, { userId: 8, companyId: 1, roleId: 12 });
  assert.deepEqual(state, { commits: 0, rollbacks: 1, closes: 1 });
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

test('seed 08 is guarded, synthetic, role-scoped, and dense by construction', () => {
  const sql = read('database/08_seed_demo_salary_reviews.sql');
  assert.match(sql, /saple\.demo\.c.*@example\.invalid/i);
  assert.match(sql, /FOR salary_number IN 1\.\.5 LOOP/i);
  assert.match(sql, /FOR review_number IN 1\.\.3 LOOP/i);
  assert.match(sql, /role_id, verification_method/i);
  assert.match(sql, /WHERE NOT EXISTS/gi);
  assert.match(sql, /ROLLBACK;\s*RAISE;/i);
  assert.doesNotMatch(sql, /\bDELETE\b/i);
  assert.match(sql, /must never be used as trustworthy ML training data/i);
});
