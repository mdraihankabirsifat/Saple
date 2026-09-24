const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migrationsDirectory = path.join(root, 'database/postgres/migrations');

const schema = read('database/postgres/01_final_schema_postgres.sql');
const demoData = read('database/postgres/02_final_demo_data_postgres.sql');
const validation = read('database/postgres/03_schema_and_data_demo_postgres.sql');

const NEW_TABLES = [
  'company_representatives',
  'representative_assignment_actions',
  'job_postings',
  'job_applications',
  'job_application_status_history',
  'announcements',
  'notifications'
];

function migrations() {
  return fs.readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

function allMigrationSql() {
  return migrations().map((name) => read(`database/postgres/migrations/${name}`)).join('\n');
}

// ---------------------------------------------------------------------------
// Migration ordering and safety
// ---------------------------------------------------------------------------

test('migrations are numbered, ordered and each runs in one transaction', () => {
  const files = migrations();
  assert.deepEqual(files, [
    '001_account_roles_and_company_representatives.sql',
    '002_jobs_and_applications.sql',
    '003_announcements_and_notifications.sql',
    '004_public_job_views_and_grants.sql',
    '005_cse216_final_database_features.sql'
  ]);

  for (const file of files) {
    const source = read(`database/postgres/migrations/${file}`);
    assert.match(source, /^BEGIN;/m, file);
    assert.match(source, /^COMMIT;/m, file);
  }
});

test('no migration destroys existing data', () => {
  const source = allMigrationSql();

  // Additive only. The one permitted ALTER widens a column and replaces its
  // CHECK with a wider one, which every existing row already satisfies.
  assert.doesNotMatch(source, /DROP TABLE|DROP VIEW|DROP COLUMN|TRUNCATE/i);
  assert.doesNotMatch(source, /^\s*DELETE FROM/im);
  assert.doesNotMatch(source, /^\s*UPDATE \w+ SET/im);

  assert.match(source, /ALTER TABLE users\s*\n\s*ALTER COLUMN account_role TYPE VARCHAR\(25\)/);
  assert.match(source, /DROP CONSTRAINT IF EXISTS ck_users_role/);
  assert.match(source, /account_role IN \('USER', 'ADMIN', 'COMPANY_REPRESENTATIVE'\)/);

  const alters = source.match(/ALTER TABLE \w+/g) || [];
  for (const alter of alters) {
    assert.match(alter, /ALTER TABLE users/, `${alter} touches an existing table`);
  }
});

test('re-running a migration is harmless', () => {
  const source = allMigrationSql();
  const creates = source.match(/CREATE (?:UNIQUE )?(?:TABLE|INDEX|VIEW)[^;]*/g) || [];

  for (const statement of creates) {
    const guarded = /IF NOT EXISTS/.test(statement) || /CREATE OR REPLACE VIEW/.test(statement);
    assert.ok(guarded, statement.slice(0, 80));
  }

  // A routine or trigger is made repeatable by CREATE OR REPLACE, or by a
  // DROP ... IF EXISTS immediately before it.
  for (const statement of source.match(/CREATE (?:OR REPLACE )?(?:TRIGGER|FUNCTION|PROCEDURE) [\w.]+/g) || []) {
    const name = statement.split(/\s+/).pop();
    const guarded = /CREATE OR REPLACE/.test(statement)
      || new RegExp(`DROP (?:TRIGGER|FUNCTION|PROCEDURE) IF EXISTS ${name}`).test(source);
    assert.ok(guarded, statement);
  }
});

test('migration 005 adds only database objects, never a table or a row', () => {
  const source = read('database/postgres/migrations/005_cse216_final_database_features.sql');

  assert.doesNotMatch(source, /CREATE TABLE|ALTER TABLE|DROP TABLE|TRUNCATE/i);

  // The only DML in the file is inside the procedure body, where it belongs.
  const beforeProcedure = source.slice(0, source.indexOf('CREATE PROCEDURE'));
  const procedure = source.slice(source.indexOf('CREATE PROCEDURE'));
  assert.doesNotMatch(beforeProcedure, /^\s*(INSERT INTO|DELETE FROM|UPDATE )/im);
  assert.match(procedure, /UPDATE job_applications/);
  assert.match(procedure, /INSERT INTO job_application_status_history/);
  assert.doesNotMatch(procedure, /^\s*DELETE FROM/im);
});

test('the fresh schema and migration 005 declare the same trigger, function and procedure', () => {
  const migration = read('database/postgres/migrations/005_cse216_final_database_features.sql');
  const objects = [
    /CREATE OR REPLACE FUNCTION saple_set_updated_at\(\)/,
    /CREATE FUNCTION saple_company_insight_summary\(p_company_id BIGINT\)/,
    /CREATE PROCEDURE saple_apply_application_decision\(/
  ];
  const triggeredTables = [
    'users', 'companies', 'submissions', 'company_representatives',
    'job_postings', 'job_applications', 'announcements'
  ];

  for (const source of [migration, schema]) {
    for (const object of objects) assert.match(source, object, String(object));
    for (const table of triggeredTables) {
      assert.match(source, new RegExp(`CREATE TRIGGER trg_${table}_set_updated_at\\s*\\n\\s*BEFORE UPDATE ON ${table}`), table);
    }
    // The statistics function must stay STABLE and approved-only.
    assert.match(source, /RETURNS TABLE \([\s\S]*?\)\s*LANGUAGE sql\s*STABLE/);
    assert.equal((source.match(/submission_status = 'APPROVED'/g) || []).length >= 5, true);
  }
});

test('audit and application rows are never cascade-deleted', () => {
  const source = allMigrationSql() + schema;

  // CASCADE is allowed only where a row is genuinely private to one account.
  const cascades = source.match(/fk_\w+ FOREIGN KEY \([^)]+\)\s*\n\s*REFERENCES [^,]*ON DELETE CASCADE/g) || [];
  for (const cascade of cascades) {
    assert.match(
      cascade,
      /fk_(company_rep_user|notifications_user|employees_user|password_reset_user|emp_verify_\w+|company_benefits_\w+|salary_submission|review_submission|interview_submission|reports_submission|mod_actions_submission)/,
      cascade.slice(0, 90)
    );
  }

  // Every new history and application relationship restricts instead.
  for (const constraint of [
    'fk_rep_action_assignment',
    'fk_application_job',
    'fk_application_history_application',
    'fk_job_company'
  ]) {
    assert.match(
      allMigrationSql(),
      new RegExp(`${constraint} FOREIGN KEY[\\s\\S]{0,120}ON DELETE RESTRICT`),
      constraint
    );
  }
});

// ---------------------------------------------------------------------------
// Both installation paths reach the same state
// ---------------------------------------------------------------------------

test('a fresh install and a migrated install declare the same new tables', () => {
  const migrationSql = allMigrationSql();

  for (const table of NEW_TABLES) {
    assert.match(schema, new RegExp(`CREATE TABLE ${table} \\(`), `${table} in fresh schema`);
    assert.match(migrationSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`), `${table} in migrations`);
  }

  assert.equal((schema.match(/^CREATE TABLE /gm) || []).length, 21);
  assert.equal((schema.match(/^CREATE OR REPLACE VIEW /gm) || []).length, 5);
  assert.match(schema, /CREATE OR REPLACE VIEW vw_public_open_jobs/);
  assert.match(migrationSql, /CREATE OR REPLACE VIEW vw_public_open_jobs/);
});

test('every constraint in the migrations also exists in the fresh schema', () => {
  const migrationSql = allMigrationSql();
  // 'DROP CONSTRAINT IF EXISTS' also matches, so the SQL keyword is skipped.
  const constraints = [...migrationSql.matchAll(/CONSTRAINT (\w+)/g)]
    .map((match) => match[1])
    .filter((name) => name !== 'IF');
  const unique = [...new Set(constraints)];

  assert.ok(unique.length >= 40, `expected many constraints, found ${unique.length}`);
  for (const name of unique) {
    assert.match(schema, new RegExp(`CONSTRAINT ${name}\\b`), name);
  }
});

test('every index in the migrations also exists in the fresh schema', () => {
  const migrationSql = allMigrationSql();
  const indexes = [...migrationSql.matchAll(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS (\w+)/g)].map((match) => match[1]);

  assert.ok(indexes.length >= 15, `expected many indexes, found ${indexes.length}`);
  for (const name of indexes) {
    assert.match(schema, new RegExp(`INDEX ${name}\\b`), name);
  }
});

// ---------------------------------------------------------------------------
// The rules the new tables enforce
// ---------------------------------------------------------------------------

test('one open representative scope per account and company, closed rows kept for audit', () => {
  for (const source of [schema, allMigrationSql()]) {
    assert.match(
      source,
      /UNIQUE INDEX (?:IF NOT EXISTS )?uk_company_rep_open_scope\s*\n\s*ON company_representatives \(user_id, company_id\)\s*\n\s*WHERE assignment_status IN \('PENDING', 'ACTIVE'\)/
    );
  }
});

test('a job cannot store a partial, inverted or unlabelled salary range', () => {
  const constraint = schema.match(/CONSTRAINT ck_job_salary_range CHECK \([\s\S]*?\n    \),/)[0];

  assert.match(constraint, /salary_min IS NULL AND salary_max IS NULL AND salary_currency IS NULL AND salary_period IS NULL/);
  assert.match(constraint, /salary_min > 0 AND salary_max >= salary_min/);
  assert.match(schema, /ck_job_salary_currency CHECK \([\s\S]*?LENGTH\(salary_currency\) = 3/);
  assert.match(schema, /ck_job_salary_period CHECK \([\s\S]*?IN \('MONTHLY', 'YEARLY'\)/);
});

test('job lifecycle timestamps must match the job status', () => {
  assert.match(schema, /ck_job_published_at CHECK \(\s*\n\s*\(job_status = 'DRAFT' AND published_at IS NULL\)/);
  assert.match(schema, /ck_job_closed_at CHECK \(\s*\n\s*\(job_status IN \('CLOSED', 'ARCHIVED'\) AND closed_at IS NOT NULL\)/);
  assert.match(schema, /ck_job_status CHECK \(job_status IN \('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'\)\)/);
});

test('one application per applicant and job, with reviewer identity tied to the status', () => {
  assert.match(schema, /CONSTRAINT uk_job_applications_once UNIQUE \(job_id, applicant_user_id\)/);
  assert.match(schema, /ck_application_review CHECK \(\s*\n\s*\(application_status IN \('SUBMITTED', 'WITHDRAWN'\) AND reviewed_by IS NULL AND reviewed_at IS NULL\)/);
  assert.match(schema, /ck_application_cover_letter\s*\n\s*CHECK \(LENGTH\(TRIM\(cover_letter\)\) BETWEEN 30 AND 4000\)/);

  // Saple stores no uploaded documents, so there is no resume column at all.
  const applications = schema.match(/CREATE TABLE job_applications \([\s\S]*?\n\);/)[0];
  assert.doesNotMatch(applications, /resume|attachment|file_url|document_url/i);
});

test('representative decisions always record who acted and why', () => {
  assert.match(schema, /ck_company_rep_approval CHECK \([\s\S]*?assignment_status IN \('ACTIVE', 'REVOKED'\) AND approved_by IS NOT NULL AND approved_at IS NOT NULL/);
  assert.match(schema, /ck_company_rep_revocation CHECK \([\s\S]*?assignment_status = 'REVOKED' AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL/);
  assert.match(schema, /ck_company_rep_decision_note CHECK \(\s*\n\s*assignment_status NOT IN \('REJECTED', 'REVOKED'\) OR decision_note IS NOT NULL/);
});

test('a notification belongs to one account and links only to a known entity kind', () => {
  assert.match(schema, /fk_notifications_user FOREIGN KEY \(user_id\)\s*\n\s*REFERENCES users \(user_id\) ON DELETE CASCADE/);
  assert.match(schema, /ck_notifications_entity CHECK \([\s\S]*?related_entity_id IS NOT NULL AND related_entity_id > 0/);
  assert.match(schema, /ix_notifications_unread ON notifications \(user_id\) WHERE read_at IS NULL/);
});

test('the public jobs view exposes no applicant or representative data', () => {
  const view = schema.match(/CREATE OR REPLACE VIEW vw_public_open_jobs AS[\s\S]*?;/)[0];

  assert.match(view, /job_status = 'PUBLISHED'/);
  assert.match(view, /application_deadline >= CURRENT_DATE/);
  for (const column of ['created_by_user_id', 'created_by_assignment_id', 'applicant', 'cover_letter']) {
    assert.equal(view.includes(column), false, column);
  }
});

// ---------------------------------------------------------------------------
// Demonstration data and the validation script
// ---------------------------------------------------------------------------

test('the new demonstration data is synthetic, guarded and re-runnable', () => {
  assert.match(demoData, /must never be treated as production claims/i);
  assert.match(demoData, /Synthetic academic demonstration/);

  const newSection = demoData.slice(demoData.indexOf('SECTION 4: REPRESENTATIVES'));
  const inserts = newSection.match(/INSERT INTO (\w+)/g) || [];
  assert.ok(inserts.length >= 7);
  // Every new insert is guarded, so loading the file twice adds nothing twice.
  assert.equal(
    (newSection.match(/ON CONFLICT \([\w, ]+\) DO NOTHING/g) || []).length,
    inserts.length
  );

  // Identity sequences are synchronised after explicit IDs, for every new table.
  for (const [table, column] of [
    ['company_representatives', 'assignment_id'],
    ['representative_assignment_actions', 'action_id'],
    ['job_postings', 'job_id'],
    ['job_applications', 'application_id'],
    ['job_application_status_history', 'history_id'],
    ['announcements', 'announcement_id'],
    ['notifications', 'notification_id']
  ]) {
    assert.match(demoData, new RegExp(`pg_get_serial_sequence\\('${table}', '${column}'\\)`), table);
  }
});

test('identity sequences are synchronised after the rows they must skip past', () => {
  // A setval that runs before its explicit-ID inserts leaves the sequence at 1,
  // and the first real insert then collides with demo row 1.
  const section4 = demoData.indexOf('SECTION 4: REPRESENTATIVES');
  for (const table of [
    'company_representatives', 'representative_assignment_actions', 'job_postings',
    'job_applications', 'job_application_status_history', 'announcements', 'notifications'
  ]) {
    const insert = demoData.indexOf(`INSERT INTO ${table} (`);
    const setval = demoData.lastIndexOf(`pg_get_serial_sequence('${table}'`);
    assert.ok(insert > section4, `${table} rows are inserted in section 4`);
    assert.ok(setval > insert, `${table} sequence is synchronised after its rows`);
    assert.equal(
      demoData.indexOf(`pg_get_serial_sequence('${table}'`),
      setval,
      `${table} is synchronised exactly once`
    );
  }
  assert.ok(demoData.lastIndexOf("pg_get_serial_sequence('users'") > demoData.indexOf('INSERT INTO users (user_id', section4));
});

test('section 4 finds its own accounts by email, never by a fixed user_id', () => {
  // Section 3 generates synthetic users whose identities occupy 8 and up, so a
  // fixed id here would be silently skipped by ON CONFLICT and every later row
  // would attach to an unrelated synthetic account.
  const newSection = demoData.slice(demoData.indexOf('SECTION 4: REPRESENTATIVES'), demoData.indexOf('-- Explicit and generated IDs'));
  const userInsert = newSection.match(/INSERT INTO users \(([^)]*)\)/);
  assert.ok(userInsert, 'section 4 adds accounts');
  assert.equal(userInsert[1].includes('user_id'), false, 'no explicit user_id column');
  assert.match(newSection, /ON CONFLICT \(email\) DO NOTHING/);
  for (const email of ['rep.one@example.test', 'rep.two@example.test', 'admin.two@example.test', 'rep.pending@example.test']) {
    assert.ok(newSection.includes(`SELECT user_id FROM users WHERE email = '${email}'`), email);
  }
  assert.match(validation, /-- 26\. Every ACTIVE representative scope belongs to an active account holding/);
});

test('the demonstration data shows the rules rather than only the happy path', () => {
  const newSection = demoData.slice(demoData.indexOf('SECTION 4: REPRESENTATIVES'));

  // Two active representatives at different companies make cross-company
  // denial demonstrable, and a pending one exercises the admin queue.
  assert.match(newSection, /'People Operations Lead', 'ACTIVE'/);
  assert.match(newSection, /'Talent Acquisition Manager', 'ACTIVE'/);
  assert.match(newSection, /'HR Generalist', 'PENDING'/);

  // A second administrator proves nothing is hard-coded to one admin account.
  assert.equal((newSection.match(/'ADMIN'/g) || []).length, 1);
  assert.match(newSection, /'COMPANY_REPRESENTATIVE'/);

  // Draft, published and closed vacancies, and an application that survived a
  // closure, so the visibility rules can be seen rather than taken on trust.
  for (const status of ["'DRAFT'", "'PUBLISHED'", "'CLOSED'"]) {
    assert.ok(newSection.includes(status), status);
  }
  assert.match(newSection, /application kept after the vacancy was closed/);

  // Published deadlines are relative, so the demo stays open whenever it loads.
  assert.match(newSection, /CURRENT_DATE \+ 45, 'PUBLISHED'/);

  // An expired announcement proves the public schedule filter does something.
  assert.match(newSection, /window has already ended/);
});

test('the read-only validation script checks the final shape and the new rules', () => {
  assert.match(validation, /21 base tables and 5 views/);
  for (const table of NEW_TABLES) {
    assert.ok(validation.includes(`'${table}'`), table);
  }
  assert.match(validation, /'vw_public_open_jobs'/);

  // Workflow checks, not just a table list.
  assert.match(validation, /duplicate_count[\s\S]*HAVING COUNT\(\*\) > 1/);
  assert.match(validation, /public_open_job_count/);
  assert.match(validation, /history_row_count/);
  assert.match(validation, /is_public_now/);
  assert.match(validation, /unread_count/);

  // It stays read-only.
  assert.doesNotMatch(validation, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i);
});

test('the migration guide tells the owner to rehearse before touching live data', () => {
  const guide = read('database/postgres/migrations/README.md');

  assert.match(guide, /001_account_roles_and_company_representatives\.sql/);
  assert.match(guide, /004_public_job_views_and_grants\.sql/);
  assert.match(guide, /backup/i);
  assert.match(guide, /21 base tables and 5 views/);
  assert.match(guide, /ON DELETE RESTRICT/);
});
