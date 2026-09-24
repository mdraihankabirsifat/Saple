const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The CSE216 trigger, function and procedure are executed here against a real
// PostgreSQL engine (PGlite, PostgreSQL compiled to WebAssembly), not matched
// as text. No server, container or DATABASE_URL is needed, so this runs in CI
// exactly as it runs locally.

const root = path.resolve(__dirname, '../..');
const sqlDirectory = path.join(root, 'database/postgres');
const readSql = (file) => fs.readFileSync(path.join(sqlDirectory, file), 'utf8');

const MIGRATION = 'migrations/005_cse216_final_database_features.sql';

async function createDatabase({ migrate = false } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = new PGlite();
  const schema = readSql('01_final_schema_postgres.sql');

  if (migrate) {
    // The upgrade path: the schema as it was before this work, then 005.
    const marker = schema.indexOf('-- CSE216 final database features');
    const withoutObjects = `${schema.slice(0, schema.lastIndexOf('-- ====', marker))}\nCOMMIT;`;
    await database.exec(withoutObjects);
    await database.exec(readSql('02_final_demo_data_postgres.sql'));
    await database.exec(readSql(MIGRATION));
  } else {
    await database.exec(schema);
    await database.exec(readSql('02_final_demo_data_postgres.sql'));
  }
  return database;
}

async function installedObjects(database) {
  const routines = await database.query(`
    SELECT p.proname, p.prokind, p.provolatile
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'saple%'
    ORDER BY p.proname
  `);
  const triggers = await database.query(`
    SELECT c.relname AS table_name, t.tgname AS trigger_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal
    ORDER BY c.relname, t.tgname
  `);
  return { routines: routines.rows, triggers: triggers.rows };
}

let shared;
const database = async () => {
  if (!shared) shared = await createDatabase();
  return shared;
};

// ---------------------------------------------------------------------------
// Installation: a fresh database and an upgraded one agree
// ---------------------------------------------------------------------------

test('a fresh install and migration 005 produce the same objects, 21 tables and 5 views', async () => {
  const fresh = await database();
  const migrated = await createDatabase({ migrate: true });

  const freshObjects = await installedObjects(fresh);
  const migratedObjects = await installedObjects(migrated);

  assert.deepEqual(freshObjects.routines.map((row) => row.proname), [
    'saple_apply_application_decision', 'saple_company_insight_summary', 'saple_set_updated_at'
  ]);
  assert.deepEqual(freshObjects.routines.map((row) => row.prokind), ['p', 'f', 'f']);
  // The statistics function reads the database, so it is STABLE ('s'), not VOLATILE.
  assert.equal(freshObjects.routines.find((row) => row.proname === 'saple_company_insight_summary').provolatile, 's');
  assert.equal(freshObjects.triggers.length, 7);
  assert.deepEqual(freshObjects, migratedObjects);

  for (const instance of [fresh, migrated]) {
    const counts = await instance.query(`
      SELECT
        (SELECT COUNT(*)::int FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tables,
        (SELECT COUNT(*)::int FROM information_schema.views WHERE table_schema = 'public') AS views
    `);
    assert.deepEqual(counts.rows[0], { tables: 21, views: 5 });
  }
  await migrated.close();
});

test('migration 005 can be applied twice without error or data loss', async () => {
  const upgraded = await createDatabase({ migrate: true });
  const before = await upgraded.query('SELECT COUNT(*)::int AS users FROM users');

  await upgraded.exec(readSql(MIGRATION));

  const after = await upgraded.query('SELECT COUNT(*)::int AS users FROM users');
  assert.deepEqual(after.rows[0], before.rows[0]);
  assert.equal((await installedObjects(upgraded)).triggers.length, 7);
  await upgraded.close();
});

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

test('the trigger sets updated_at even when the UPDATE never mentions the column', async () => {
  const instance = await database();
  const before = (await instance.query(
    'SELECT user_id, full_name, updated_at FROM users ORDER BY user_id LIMIT 1'
  )).rows[0];

  await new Promise((resolve) => setTimeout(resolve, 15));
  // Exactly the kind of write that happens outside Express: no updated_at.
  await instance.query('UPDATE users SET full_name = $1 WHERE user_id = $2', [before.full_name, before.user_id]);

  const after = (await instance.query('SELECT updated_at FROM users WHERE user_id = $1', [before.user_id])).rows[0];
  assert.ok(new Date(after.updated_at) > new Date(before.updated_at), 'updated_at moved forward');
});

test('the trigger leaves inserts and untriggered tables alone', async () => {
  const instance = await database();

  // An INSERT keeps the column default rather than being rewritten.
  const inserted = (await instance.query(`
    INSERT INTO companies (company_name, industry, headquarters_city, country, company_size, description)
    VALUES ('Trigger Test Company', 'Software', 'Dhaka', 'Bangladesh', '1-50', 'Synthetic row for a trigger test.')
    RETURNING company_id, created_at, updated_at
  `)).rows[0];
  assert.ok(Math.abs(new Date(inserted.updated_at) - new Date(inserted.created_at)) < 1000);

  // notifications has no updated_at and therefore no trigger.
  const triggered = await instance.query(`
    SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal
  `);
  const tables = triggered.rows.map((row) => row.relname);
  assert.equal(tables.includes('notifications'), false);
  assert.deepEqual([...tables].sort(), [
    'announcements', 'companies', 'company_representatives', 'job_applications',
    'job_postings', 'submissions', 'users'
  ]);

  await instance.query('DELETE FROM companies WHERE company_id = $1', [inserted.company_id]);
});

// ---------------------------------------------------------------------------
// Statistical function
// ---------------------------------------------------------------------------

test('saple_company_insight_summary returns the approved-only aggregates', async () => {
  const instance = await database();
  const companyId = (await instance.query(`
    SELECT s.company_id
    FROM submissions s
    JOIN company_reviews cr ON cr.submission_id = s.submission_id
    WHERE s.submission_status = 'APPROVED'
    GROUP BY s.company_id
    ORDER BY COUNT(*) DESC, s.company_id
    LIMIT 1
  `)).rows[0].company_id;

  const summary = (await instance.query('SELECT * FROM saple_company_insight_summary($1)', [companyId])).rows[0];
  // The same figures, computed independently from the tables.
  const expected = (await instance.query(`
    SELECT
      (SELECT COUNT(*)::int FROM submissions s JOIN company_reviews cr ON cr.submission_id = s.submission_id
        WHERE s.company_id = $1 AND s.submission_status = 'APPROVED') AS review_count,
      (SELECT ROUND(AVG(cr.overall_rating), 2) FROM submissions s JOIN company_reviews cr ON cr.submission_id = s.submission_id
        WHERE s.company_id = $1 AND s.submission_status = 'APPROVED') AS average_rating,
      (SELECT COUNT(*)::int FROM submissions s JOIN salary_submissions ss ON ss.submission_id = s.submission_id
        WHERE s.company_id = $1 AND s.submission_status = 'APPROVED') AS approved_salary_count,
      (SELECT MIN(ss.base_salary) FROM submissions s JOIN salary_submissions ss ON ss.submission_id = s.submission_id
        WHERE s.company_id = $1 AND s.submission_status = 'APPROVED') AS minimum_salary,
      (SELECT COUNT(*)::int FROM job_postings WHERE company_id = $1 AND job_status = 'PUBLISHED'
        AND application_deadline >= CURRENT_DATE) AS open_job_count
  `, [companyId])).rows[0];

  assert.equal(summary.review_count, expected.review_count);
  assert.ok(summary.review_count > 0, 'the chosen company has approved reviews');
  assert.equal(Number(summary.average_rating), Number(expected.average_rating));
  assert.ok(Number(summary.average_rating) >= 1 && Number(summary.average_rating) <= 5);
  assert.equal(summary.approved_salary_count, expected.approved_salary_count);
  assert.equal(Number(summary.minimum_salary), Number(expected.minimum_salary));
  assert.ok(Number(summary.maximum_salary) >= Number(summary.minimum_salary));
  assert.equal(summary.open_job_count, expected.open_job_count);

  // Joining several one-to-many tables at once would multiply the counts.
  const fanout = (await instance.query(`
    SELECT COUNT(*)::int AS rows
    FROM submissions s
    LEFT JOIN company_reviews cr ON cr.submission_id = s.submission_id
    LEFT JOIN salary_submissions ss ON ss.submission_id = s.submission_id
    WHERE s.company_id = $1 AND s.submission_status = 'APPROVED'
  `, [companyId])).rows[0].rows;
  assert.notEqual(summary.review_count, fanout);
});

test('the function counts only approved data and answers for an empty or unknown company', async () => {
  const instance = await database();
  const companyId = (await instance.query('SELECT MIN(company_id) AS id FROM companies')).rows[0].id;
  const userId = (await instance.query('SELECT MIN(user_id) AS id FROM users')).rows[0].id;
  const before = (await instance.query('SELECT * FROM saple_company_insight_summary($1)', [companyId])).rows[0];

  // A pending review must not move any public figure.
  const submission = (await instance.query(`
    INSERT INTO submissions (user_id, company_id, submission_type, submission_status, is_anonymous)
    VALUES ($1, $2, 'REVIEW', 'PENDING', 1)
    RETURNING submission_id
  `, [userId, companyId])).rows[0].submission_id;
  await instance.query(`
    INSERT INTO company_reviews (submission_id, review_title, overall_rating, work_life_balance_rating,
      career_growth_rating, management_rating, culture_rating, pros, cons, employment_status, review_date)
    VALUES ($1, 'Pending synthetic review', 5, 5, 5, 5, 5,
      'Synthetic pending pros for a database test.', 'Synthetic pending cons for a database test.',
      'CURRENT', CURRENT_DATE)
  `, [submission]);

  const after = (await instance.query('SELECT * FROM saple_company_insight_summary($1)', [companyId])).rows[0];
  assert.deepEqual(after, before, 'a PENDING review changes nothing public');

  // A company with no contributions still answers, with zeros and NULLs.
  const emptyCompany = (await instance.query(`
    INSERT INTO companies (company_name, industry, headquarters_city, country, company_size, description)
    VALUES ('Empty Insight Company', 'Software', 'Dhaka', 'Bangladesh', '1-50', 'Synthetic row with no contributions.')
    RETURNING company_id
  `)).rows[0].company_id;
  const empty = (await instance.query('SELECT * FROM saple_company_insight_summary($1)', [emptyCompany])).rows[0];
  assert.equal(empty.review_count, 0);
  assert.equal(empty.approved_salary_count, 0);
  assert.equal(empty.interview_count, 0);
  assert.equal(empty.average_rating, null);
  assert.equal(empty.minimum_salary, null);

  // An unknown company id is not an error; it simply has no row.
  const unknown = await instance.query('SELECT * FROM saple_company_insight_summary($1)', [99999999]);
  assert.equal(unknown.rows.length, 0);

  await instance.query('DELETE FROM company_reviews WHERE submission_id = $1', [submission]);
  await instance.query('DELETE FROM submissions WHERE submission_id = $1', [submission]);
  await instance.query('DELETE FROM companies WHERE company_id = $1', [emptyCompany]);
});

// ---------------------------------------------------------------------------
// Procedure
// ---------------------------------------------------------------------------

const CALL_DECISION = `
  CALL saple_apply_application_decision($1::bigint, $2::bigint, $3::varchar, $4::text,
    $5::varchar[], $6::boolean, NULL, NULL, NULL, NULL)
`;

async function anApplication(instance) {
  const row = (await instance.query(`
    SELECT ja.application_id, ja.application_status, ja.applicant_user_id, ja.updated_at
    FROM job_applications ja
    ORDER BY ja.application_id
    LIMIT 1
  `)).rows[0];
  const actor = (await instance.query(`SELECT user_id FROM users WHERE account_role = 'ADMIN' ORDER BY user_id LIMIT 1`)).rows[0].user_id;
  return { ...row, actor };
}

test('the procedure updates the application and writes its history row in one call', async () => {
  const instance = await database();
  const application = await anApplication(instance);
  const historyBefore = (await instance.query(
    'SELECT COUNT(*)::int AS rows FROM job_application_status_history WHERE application_id = $1',
    [application.application_id]
  )).rows[0].rows;

  await instance.exec('BEGIN');
  const call = await instance.query(CALL_DECISION, [
    application.application_id, application.actor, 'SHORTLISTED', 'Synthetic decision note',
    [application.application_status], true
  ]);
  await instance.exec('COMMIT');

  assert.equal(call.rows[0].io_previous_status, application.application_status);
  assert.equal(call.rows[0].io_applicant_user_id, application.applicant_user_id);
  assert.ok(call.rows[0].io_history_id > 0);

  const updated = (await instance.query(
    'SELECT application_status, reviewed_by, reviewed_at, updated_at FROM job_applications WHERE application_id = $1',
    [application.application_id]
  )).rows[0];
  assert.equal(updated.application_status, 'SHORTLISTED');
  assert.equal(updated.reviewed_by, application.actor);
  assert.ok(updated.reviewed_at, 'a reviewer decision records who decided and when');
  assert.ok(new Date(updated.updated_at) > new Date(application.updated_at));

  const history = (await instance.query(`
    SELECT previous_status, new_status, actor_user_id, action_note
    FROM job_application_status_history
    WHERE application_id = $1 ORDER BY history_id DESC LIMIT 1
  `, [application.application_id])).rows[0];
  assert.deepEqual(history, {
    previous_status: application.application_status,
    new_status: 'SHORTLISTED',
    actor_user_id: application.actor,
    action_note: 'Synthetic decision note'
  });
  const historyAfter = (await instance.query(
    'SELECT COUNT(*)::int AS rows FROM job_application_status_history WHERE application_id = $1',
    [application.application_id]
  )).rows[0].rows;
  assert.equal(historyAfter, historyBefore + 1, 'exactly one history row per decision');
});

test('the procedure refuses an unknown application and a transition the caller may not make', async () => {
  const instance = await database();
  const application = await anApplication(instance);

  await assert.rejects(
    instance.query(CALL_DECISION, [99999999, application.actor, 'SHORTLISTED', null, ['SUBMITTED'], true]),
    (error) => error.code === 'SA001'
  );
  await assert.rejects(
    instance.query(CALL_DECISION, [application.application_id, application.actor, 'ACCEPTED', null, ['WITHDRAWN'], true]),
    (error) => error.code === 'SA002'
  );

  // The refused calls changed nothing.
  const status = (await instance.query(
    'SELECT application_status FROM job_applications WHERE application_id = $1',
    [application.application_id]
  )).rows[0].application_status;
  assert.equal(status, 'SHORTLISTED');
});

test('a failure after the procedure rolls back both of its writes', async () => {
  const instance = await database();
  const application = await anApplication(instance);
  const before = (await instance.query(`
    SELECT
      (SELECT application_status FROM job_applications WHERE application_id = $1) AS status,
      (SELECT COUNT(*)::int FROM job_application_status_history WHERE application_id = $1) AS history
  `, [application.application_id])).rows[0];

  await instance.exec('BEGIN');
  await instance.query(CALL_DECISION, [
    application.application_id, application.actor, 'ACCEPTED', 'Rolled back note', [before.status], true
  ]);
  // Stands in for the applicant notification failing inside the same transaction.
  await assert.rejects(instance.query('INSERT INTO notifications (user_id, notification_type, title, message) VALUES (NULL, $1, $2, $3)',
    ['APPLICATION_STATUS', 'Title', 'Message']));
  await instance.exec('ROLLBACK');

  const after = (await instance.query(`
    SELECT
      (SELECT application_status FROM job_applications WHERE application_id = $1) AS status,
      (SELECT COUNT(*)::int FROM job_application_status_history WHERE application_id = $1) AS history
  `, [application.application_id])).rows[0];
  assert.deepEqual(after, before, 'neither table kept the rolled-back decision');
});

test('the procedure never commits, so its caller owns the transaction', () => {
  const source = readSql(MIGRATION);
  const procedure = source.slice(source.indexOf('CREATE PROCEDURE saple_apply_application_decision'));
  assert.doesNotMatch(procedure.slice(0, procedure.indexOf('$$;')), /\bCOMMIT\b|\bROLLBACK\b/);
});

test.after(async () => {
  if (shared) await shared.close();
});
