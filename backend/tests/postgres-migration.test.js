const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('PostgreSQL schema preserves 14 tables, four views, and token-version revocation', () => {
  const schema = read('database/postgres/01_final_schema_postgres.sql');
  assert.equal((schema.match(/^CREATE TABLE /gm) || []).length, 14);
  assert.equal((schema.match(/^CREATE OR REPLACE VIEW /gm) || []).length, 4);
  assert.match(schema, /token_version\s+INTEGER DEFAULT 0 NOT NULL/i);
  assert.match(schema, /ck_users_token_version CHECK \(token_version >= 0\)/i);
  assert.match(schema, /vw_verified_salary_summary[\s\S]*submission_status = 'APPROVED'[\s\S]*verification_status = 'VERIFIED'/i);
  assert.match(schema, /vw_community_salary_summary[\s\S]*submission_status = 'APPROVED'/i);
  assert.doesNotMatch(schema, /VARCHAR2|SYSTIMESTAMP|DBMS_LOB|FROM dual|\bNUMBER\b/i);
});

test('PostgreSQL demo data preserves reference density and synchronizes identities', () => {
  const seed = read('database/postgres/02_final_demo_data_postgres.sql');
  assert.match(seed, /INSERT INTO companies[\s\S]*ON CONFLICT \(company_name\) DO NOTHING/i);
  assert.match(seed, /INSERT INTO job_roles[\s\S]*ON CONFLICT \(role_name\) DO NOTHING/i);
  assert.match(seed, /FOR salary_number IN 1\.\.5 LOOP/i);
  assert.match(seed, /FOR review_number IN 1\.\.3 LOOP/i);
  assert.match(seed, /pg_get_serial_sequence\('users', 'user_id'\)/i);
  assert.match(seed, /must never be treated as production claims/i);
});

test('active repositories use pg parameters and contain no Oracle runtime imports', () => {
  const repositoryFiles = fs.readdirSync(path.join(root, 'backend/repositories'))
    .filter((name) => name.endsWith('.js'));
  for (const filename of repositoryFiles) {
    const source = read(`backend/repositories/${filename}`);
    assert.doesNotMatch(source, /require\(['"]oracledb['"]\)/);
    assert.doesNotMatch(source, /(?<!:):\w+|SYSTIMESTAMP|NVL\(|FROM dual|RETURNING .* INTO/i);
  }
  const packageJson = JSON.parse(read('backend/package.json'));
  assert.ok(packageJson.dependencies.pg);
  assert.equal(packageJson.dependencies.oracledb, undefined);
});

test('password changes and resets increment token_version in the same SQL update', () => {
  const users = read('backend/repositories/user.repository.js');
  const reset = read('backend/repositories/password-reset.repository.js');
  assert.match(users, /SET password_hash = \$1, token_version = token_version \+ 1/);
  assert.match(reset, /SET password_hash = \$1, token_version = token_version \+ 1/);
});

test('frontend logout calls the protected endpoint before clearing local auth', () => {
  const auth = read('frontend/js/auth.js');
  const nav = read('frontend/js/nav.js');
  assert.match(auth, /apiRequest\('\/api\/auth\/logout', \{ method: 'POST', auth: true \}\)/);
  assert.match(auth, /finally \{\s*clearSession\(\);\s*\}/);
  assert.match(nav, /await auth\.logout\(\)/);
});
