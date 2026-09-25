#!/usr/bin/env node
//
// Read-only database verification.
//
//   npm run verify:database --prefix backend
//
// Connects with DATABASE_URL, checks that the live database has the shape this
// repository expects, and reports anything missing or unexpected. It runs
// SELECTs only: no table, row, sequence or object is created, changed or
// dropped, and it never prints the connection string or any row of data.

require('dotenv').config({ quiet: true });

const database = require('../config/database');

const EXPECTED_TABLES = [
  'announcements', 'benefits', 'companies', 'company_benefits', 'company_representatives',
  'company_reviews', 'employees', 'employment_verifications', 'interview_experiences',
  'job_application_status_history', 'job_applications', 'job_postings', 'job_roles',
  'moderation_actions', 'notifications', 'password_reset_tokens', 'reports',
  'representative_assignment_actions', 'salary_submissions', 'submissions', 'users'
];

const EXPECTED_VIEWS = [
  'vw_community_salary_summary', 'vw_public_approved_reviews', 'vw_public_companies',
  'vw_public_open_jobs', 'vw_verified_salary_summary'
];

const EXPECTED_ROUTINES = [
  { name: 'saple_apply_application_decision', kind: 'p' },
  { name: 'saple_company_insight_summary', kind: 'f' },
  { name: 'saple_set_updated_at', kind: 'f' }
];

const EXPECTED_TRIGGERS = [
  'trg_announcements_set_updated_at', 'trg_companies_set_updated_at',
  'trg_company_representatives_set_updated_at', 'trg_job_applications_set_updated_at',
  'trg_job_postings_set_updated_at', 'trg_submissions_set_updated_at',
  'trg_users_set_updated_at'
];

// Constraints that carry a rule the project depends on.
const EXPECTED_CONSTRAINTS = [
  ['job_applications', 'uk_job_applications_once'],
  ['job_applications', 'ck_application_status'],
  ['job_application_status_history', 'fk_application_history_application'],
  ['submissions', 'ck_submissions_status'],
  ['users', 'ck_users_role']
];

const findings = [];
const note = (level, message) => findings.push({ level, message });

function compare(label, expected, actual) {
  const missing = expected.filter((name) => !actual.includes(name));
  const unexpected = actual.filter((name) => !expected.includes(name));
  if (missing.length) note('error', `${label}: missing ${missing.join(', ')}`);
  if (unexpected.length) note('warning', `${label}: unexpected ${unexpected.join(', ')}`);
  if (!missing.length && !unexpected.length) note('ok', `${label}: all ${expected.length} present`);
}

async function main() {
  await database.initializePool();

  const tables = (await database.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name
  `)).rows.map((row) => row.table_name);
  compare('Tables', EXPECTED_TABLES, tables);

  const views = (await database.query(`
    SELECT table_name FROM information_schema.views
    WHERE table_schema = 'public' ORDER BY table_name
  `)).rows.map((row) => row.table_name);
  compare('Views', EXPECTED_VIEWS, views);

  const routines = (await database.query(`
    SELECT p.proname, p.prokind FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'saple%'
    ORDER BY p.proname
  `)).rows;
  compare('Functions and procedures', EXPECTED_ROUTINES.map((r) => r.name), routines.map((r) => r.proname));
  for (const expected of EXPECTED_ROUTINES) {
    const found = routines.find((row) => row.proname === expected.name);
    if (found && found.prokind !== expected.kind) {
      note('error', `${expected.name}: expected ${expected.kind === 'p' ? 'a procedure' : 'a function'}`);
    }
  }

  const triggers = (await database.query(`
    SELECT t.tgname FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname = 'public' ORDER BY t.tgname
  `)).rows.map((row) => row.tgname);
  compare('Triggers', EXPECTED_TRIGGERS, triggers);

  const constraints = (await database.query(`
    SELECT rel.relname AS table_name, con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
  `)).rows.map((row) => `${row.table_name}.${row.constraint_name}`);
  const missingConstraints = EXPECTED_CONSTRAINTS
    .map(([table, name]) => `${table}.${name}`)
    .filter((key) => !constraints.includes(key));
  if (missingConstraints.length) note('error', `Constraints: missing ${missingConstraints.join(', ')}`);
  else note('ok', `Constraints: all ${EXPECTED_CONSTRAINTS.length} checked constraints present`);

  // Counts only: no row content is read or printed.
  const counts = (await database.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM companies) AS companies,
      (SELECT COUNT(*)::int FROM submissions WHERE submission_status = 'APPROVED') AS approved_submissions
  `)).rows[0];
  note('ok', `Row counts: ${counts.users} users, ${counts.companies} companies, ${counts.approved_submissions} approved submissions`);

  await database.closePool();

  console.log('\nSaple database verification (read-only)\n');
  for (const finding of findings) {
    const prefix = finding.level === 'ok' ? '  OK   ' : finding.level === 'warning' ? '  WARN ' : '  FAIL ';
    console.log(prefix + finding.message);
  }

  const failed = findings.filter((finding) => finding.level === 'error');
  console.log(failed.length
    ? `\n${failed.length} problem(s) found. Apply the migrations in database/postgres/migrations/ in order.\n`
    : '\nThe database matches the expected structure.\n');
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error) => {
  // Names and messages only: a connection string never reaches the output.
  console.error(`Verification could not run: ${error.message.replace(/postgres(ql)?:\/\/\S+/gi, '<connection string>')}`);
  process.exitCode = 1;
});
