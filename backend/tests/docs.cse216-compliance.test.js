const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The compliance guide is what the team will defend during evaluation, so it
// must keep pointing at objects, files and tests that really exist.

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const guide = read('docs/cse216-final-compliance.md');

test('the guide covers all eight checklist items', () => {
  for (const heading of [
    '## 1. Authentication is Saple',
    '## 2. Authentication is validated on every protected page and request',
    '## 3. Every DML operation uses explicit transaction control',
    '## 4. Trigger',
    '## 5. Function returning a computed value',
    '## 6. Procedure for a multi-step workflow',
    '## 7. At least three complex queries',
    '## 8. Features used only where appropriate'
  ]) {
    assert.ok(guide.includes(heading), heading);
  }
  assert.match(guide, /## Evaluation sequence/);
});

test('every file and test the guide names exists', () => {
  const referenced = [...guide.matchAll(/`((?:backend|frontend|database|docs)\/[\w./-]+|tests\/[\w.-]+)`/g)]
    .map((match) => (match[1].startsWith('tests/') ? `backend/${match[1]}` : match[1]));

  for (const file of new Set(referenced)) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} is named in the guide but missing`);
  }
});

test('every database object the guide names exists in both SQL paths', () => {
  const migration = read('database/postgres/migrations/005_cse216_final_database_features.sql');
  const schema = read('database/postgres/01_final_schema_postgres.sql');

  const objects = [...guide.matchAll(/`(saple_[a-z_]+)\(/g)].map((match) => match[1]);
  const triggers = [...guide.matchAll(/`(trg_[a-z_]+)`/g)].map((match) => match[1]);

  assert.ok(objects.length >= 3, 'the guide names the trigger function, function and procedure');
  assert.equal(triggers.length >= 7, true, 'the guide names every trigger');

  for (const name of new Set([...objects, ...triggers])) {
    assert.ok(migration.includes(name), `${name} missing from migration 005`);
    assert.ok(schema.includes(name), `${name} missing from the fresh schema`);
  }
});

test('the guide claims no third-party authentication, and the code agrees', () => {
  assert.match(guide, /no Firebase, Auth0, Supabase Auth, Google or Microsoft sign-in/);

  const searched = ['backend', 'frontend'];
  const pattern = /firebase|auth0|supabase-js|signInWith|@supabase|gapi\.auth/i;
  const offenders = [];

  const walk = (directory) => {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        // node_modules is third-party code, and this test file names the
        // very strings it searches for.
        if (entry.name === 'node_modules' || relative === 'backend/tests') continue;
        walk(relative);
      } else if (/\.(js|html|json)$/.test(entry.name)) {
        if (pattern.test(read(relative))) offenders.push(relative);
      }
    }
  };
  searched.forEach(walk);

  assert.deepEqual(offenders, [], 'a third-party authentication reference appeared');
});

test('README and backend README point at the guide and name the objects', () => {
  const readme = read('README.md');
  const backendReadme = read('backend/README.md');

  assert.match(readme, /docs\/cse216-final-compliance\.md/);
  assert.match(backendReadme, /docs\/cse216-final-compliance\.md/);
  for (const name of ['saple_set_updated_at', 'saple_company_insight_summary', 'saple_apply_application_decision']) {
    assert.ok(readme.includes(name), `README names ${name}`);
    assert.ok(backendReadme.includes(name), `backend README names ${name}`);
  }
  // A hard-coded test count goes stale the moment a test is added.
  assert.doesNotMatch(readme, /\b2\d\d tests\b/);
  assert.doesNotMatch(guide, /\b2\d\d tests\b/);
});

test('the guide never publishes a credential or a live demonstration against real data', () => {
  assert.doesNotMatch(guide, /password\s*[:=]\s*["'][^"'<]{6,}["']/i);
  assert.doesNotMatch(guide, /postgres(ql)?:\/\/[^\s<]*:[^\s<@]+@/i);
  assert.match(guide, /disposable/i);
  assert.match(guide, /[Nn]ever\s+demonstrate the procedure against live data/);
});
