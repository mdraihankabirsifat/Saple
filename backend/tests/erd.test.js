const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const erd = require('../../docs/tools/build-erd');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the ERD generator reads the full active schema', () => {
  const { tables, views } = erd.parseSchema(read('database/postgres/01_final_schema_postgres.sql').replace(/\r\n/g, '\n'));

  assert.equal(tables.size, 39);
  assert.equal(views.length, 7);
  assert.deepEqual(tables.get('job_applications').uniqueKeys, [['job_id', 'applicant_user_id']]);
  assert.deepEqual(tables.get('company_representatives').partialUnique.columns, ['user_id', 'company_id']);

  const rels = erd.relationships(tables);
  const subtype = rels.find((item) => item.child === 'salary_submissions' && item.column === 'submission_id');
  assert.equal(subtype.oneToOne, true);
  assert.equal(subtype.optional, false);
  const application = rels.find((item) => item.child === 'job_applications' && item.column === 'job_id');
  assert.equal(application.onDelete, 'RESTRICT');
  assert.deepEqual(rels.filter((item) => item.child === 'direct_messages').map((item) => item.column).sort(),
    ['recipient_user_id', 'sender_user_id']);
});

test('the committed ERD is exactly what the current schema generates', () => {
  // Git may check these files out with CRLF on Windows; compare content only.
  const lf = (text) => text.replace(/\r\n/g, '\n');
  const before = { html: lf(read('docs/ERD.html')), md: lf(read('docs/ERD.md')) };
  erd.build();
  const after = { html: lf(read('docs/ERD.html')), md: lf(read('docs/ERD.md')) };

  // If this fails, the schema changed without `node docs/tools/build-erd.js`.
  assert.equal(after.html, before.html, 'docs/ERD.html is stale');
  assert.equal(after.md, before.md, 'docs/ERD.md is stale');
});

test('the ERD describes the PostgreSQL schema and every table', () => {
  const html = read('docs/ERD.html');
  const md = read('docs/ERD.md');

  assert.match(html, /<title>Saple PostgreSQL ERD<\/title>/);
  assert.doesNotMatch(html, /Oracle 19c Entity|Fourteen Oracle relations/);
  assert.match(md, /39 tables and 7 views/);

  for (const table of [
    'users', 'employees', 'companies', 'submissions', 'company_representatives',
    'representative_assignment_actions', 'job_postings', 'job_applications',
    'job_application_status_history', 'announcements', 'notifications', 'direct_messages'
  ]) {
    assert.match(html, new RegExp(`id="entity-${table}"`), table);
    assert.match(md, new RegExp(`\\b${table.toUpperCase()} \\{`), table);
  }

  assert.ok(fs.existsSync(path.join(root, 'ERD.pdf')));
});
