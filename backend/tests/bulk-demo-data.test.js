const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const postgres = path.resolve(__dirname, '../../database/postgres');
const read = (file) => fs.readFileSync(path.join(postgres, file), 'utf8');
const bulk = read('04_bulk_demo_data_postgres.sql');
const cleanup = read('05_remove_bulk_demo_data.sql');
const MARKER = '$2b$10$SAPLE.BULK.DEMO.ACCOUNT.NO.LOGIN';

test('the bulk demo data only adds rows and is not a migration', () => {
  assert.equal(fs.existsSync(path.join(postgres, 'migrations/04_bulk_demo_data_postgres.sql')), false);
  assert.match(bulk, /^BEGIN;/m);
  assert.match(bulk, /^COMMIT;/m);
  // No statement drops, truncates, deletes or alters a real table.
  assert.doesNotMatch(bulk, /^\s*(DROP|TRUNCATE|DELETE)\b/im);
  assert.doesNotMatch(bulk, /ALTER TABLE (?!bulk_)/i);
  assert.doesNotMatch(bulk, /CREATE (TABLE|INDEX|VIEW|FUNCTION|PROCEDURE|TRIGGER) (?!pg_temp\.)(?!ON COMMIT)/i);
  // Helpers and working tables are session-only.
  assert.equal((bulk.match(/CREATE TEMP TABLE bulk_\w+ ON COMMIT DROP/g) || []).length > 10, true);
  assert.doesNotMatch(bulk, /CREATE OR REPLACE FUNCTION (?!pg_temp\.)/);
  // Nothing is addressed by a fixed ID.
  assert.doesNotMatch(bulk, /(company|user|role|job|submission)_id\s*=\s*\d/i);
  // Reference data never overwrites existing rows.
  for (const table of ['companies', 'job_roles', 'benefits']) {
    assert.match(bulk, new RegExp(`INSERT INTO ${table} [\\s\\S]*?ON CONFLICT \\(\\w+\\) DO NOTHING`), table);
  }
  assert.match(bulk, /ON CONFLICT \(email\) DO NOTHING/);
  // Synthetic people use reserved addresses and the unusable marker hash.
  assert.match(bulk, /'@example\.test'/);
  assert.ok(bulk.includes(MARKER) && cleanup.includes(MARKER));
  assert.match(bulk, /SYNTHETIC ACADEMIC DEMO DATA/);
});

test('bulk demo data loads cleanly, is re-runnable, and the cleanup removes only what it added', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const one = async (sql) => (await db.query(sql)).rows[0];
  const counts = () => one(`SELECT
    (SELECT COUNT(*)::int FROM companies) AS companies, (SELECT COUNT(*)::int FROM users) AS users,
    (SELECT COUNT(*)::int FROM submissions) AS submissions, (SELECT COUNT(*)::int FROM salary_submissions) AS salaries,
    (SELECT COUNT(*)::int FROM company_reviews) AS reviews, (SELECT COUNT(*)::int FROM interview_experiences) AS interviews,
    (SELECT COUNT(*)::int FROM job_postings) AS jobs, (SELECT COUNT(*)::int FROM job_applications) AS applications,
    (SELECT COUNT(*)::int FROM employment_verifications) AS verifications,
    (SELECT COUNT(*)::int FROM company_representatives) AS representatives`);
  try {
    await db.exec(read('01_final_schema_postgres.sql'));
    await db.exec(read('02_final_demo_data_postgres.sql'));
    // Like the live project: one active administrator.
    await db.exec(`UPDATE users SET account_role = 'USER' WHERE account_role = 'ADMIN' AND user_id <> 6`);
    const baseline = await counts();

    await db.exec(bulk);
    const loaded = await counts();
    const added = Object.fromEntries(Object.keys(loaded).map((key) => [key, loaded[key] - baseline[key]]));
    assert.ok(loaded.companies >= 80 && loaded.companies <= 120, `companies ${loaded.companies}`);
    assert.ok(loaded.users >= 150 && loaded.users <= 250, `users ${loaded.users}`);
    assert.ok(added.salaries >= 500 && added.salaries <= 800, `salaries ${added.salaries}`);
    assert.ok(added.reviews >= 250 && added.reviews <= 400, `reviews ${added.reviews}`);
    assert.ok(added.interviews >= 200 && added.interviews <= 300, `interviews ${added.interviews}`);
    assert.ok(added.jobs >= 100 && added.jobs <= 160, `jobs ${added.jobs}`);
    assert.ok(added.applications >= 150 && added.applications <= 250, `applications ${added.applications}`);

    // Chronology and ownership hold for everything the script created.
    const integrity = await one(`SELECT
      (SELECT COUNT(*)::int FROM submissions s JOIN users u USING (user_id)
        WHERE u.password_hash = '${MARKER}' AND (s.submitted_at < u.created_at OR s.submitted_at > now()
          OR s.approved_at < s.submitted_at OR s.approved_at > now())) AS bad_submissions,
      (SELECT COUNT(*)::int FROM job_applications a JOIN job_postings j USING (job_id)
        WHERE a.submitted_at < j.published_at OR a.submitted_at > now()) AS bad_applications,
      (SELECT COUNT(*)::int FROM job_application_status_history h JOIN job_applications a USING (application_id)
        WHERE h.action_at < a.submitted_at OR h.action_at > now()) AS bad_history,
      (SELECT COUNT(*)::int FROM job_postings j JOIN users u ON u.user_id = j.created_by_user_id
        LEFT JOIN company_representatives cr ON cr.assignment_id = j.created_by_assignment_id
        WHERE u.password_hash = '${MARKER}' AND (cr.assignment_status IS DISTINCT FROM 'ACTIVE'
          OR cr.company_id <> j.company_id OR j.published_at < cr.approved_at)) AS jobs_without_assignment,
      (SELECT COUNT(*)::int FROM users WHERE password_hash = '${MARKER}' AND account_role = 'ADMIN') AS synthetic_admins,
      (SELECT COUNT(*)::int FROM users WHERE password_hash = '${MARKER}' AND email NOT LIKE '%@example.test') AS real_looking_emails`);
    assert.deepEqual(integrity, { bad_submissions: 0, bad_applications: 0, bad_history: 0,
      jobs_without_assignment: 0, synthetic_admins: 0, real_looking_emails: 0 });

    // Both salary ranges have data, and ratings are spread out.
    const shape = await one(`SELECT
      (SELECT COUNT(*)::int FROM vw_verified_salary_summary) AS verified_pairs,
      (SELECT COUNT(*)::int FROM vw_public_open_jobs) AS open_jobs,
      (SELECT COUNT(DISTINCT overall_rating)::int FROM company_reviews) AS rating_levels`);
    assert.ok(shape.verified_pairs > 50 && shape.open_jobs > 80 && shape.rating_levels >= 7, JSON.stringify(shape));

    // A second run adds nothing.
    await db.exec(bulk);
    assert.deepEqual(await counts(), loaded);

    // Real activity on synthetic data blocks the cleanup entirely.
    await db.exec(`INSERT INTO job_applications (job_id, applicant_user_id, cover_letter)
      SELECT j.job_id, 1, 'A real applicant writing a genuine cover letter.'
      FROM job_postings j JOIN users u ON u.user_id = j.created_by_user_id
      WHERE u.password_hash = '${MARKER}' AND j.job_status = 'PUBLISHED' LIMIT 1`);
    const withReal = await counts();
    await assert.rejects(db.exec(cleanup), /Nothing was removed/);
    await db.exec('ROLLBACK').catch(() => {});
    assert.deepEqual(await counts(), withReal);

    // Without it, the cleanup returns everything but reference data to the baseline.
    await db.exec(`DELETE FROM job_applications WHERE applicant_user_id = 1 AND cover_letter LIKE 'A real applicant%'`);
    await db.exec(cleanup);
    const cleaned = await counts();
    assert.deepEqual({ ...cleaned, companies: baseline.companies }, baseline);
    assert.equal(cleaned.companies, loaded.companies);
    assert.equal((await one(`SELECT COUNT(*)::int AS n FROM users WHERE account_role = 'ADMIN'`)).n, 1);
  } finally {
    await db.close();
  }
});
