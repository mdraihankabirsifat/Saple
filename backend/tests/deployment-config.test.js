const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the Blueprint creates a new service and declares every private variable', () => {
  const blueprint = YAML.parse(read('render.yaml'));
  const service = blueprint.services[0];

  // Never the old, flagged service name.
  assert.equal(service.name, 'saple-academic');
  assert.notEqual(service.name, 'saple');

  const env = Object.fromEntries(service.envVars.map((item) => [item.key, item]));
  for (const name of [
    'DATABASE_URL', 'FRONTEND_URL', 'CORS_ORIGINS', 'SECURITY_CONTACT',
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
    'AI_ENABLED', 'AI_API_KEY', 'AI_API_BASE_URL', 'AI_MODEL', 'AI_TIMEOUT_MS', 'AI_MAX_OUTPUT_TOKENS'
  ]) {
    assert.deepEqual(env[name], { key: name, sync: false }, `${name} is entered privately`);
  }
  assert.deepEqual(env.JWT_SECRET, { key: 'JWT_SECRET', generateValue: true });
});

test('the env example lists every variable with placeholders only', () => {
  const example = read('backend/.env.example');

  for (const name of [
    'DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL', 'CORS_ORIGINS', 'SECURITY_CONTACT',
    'SMTP_HOST', 'SMTP_PASS', 'AI_ENABLED', 'AI_API_KEY', 'AI_API_BASE_URL', 'AI_MODEL'
  ]) {
    assert.match(example, new RegExp(`^${name}=`, 'm'), name);
  }
  assert.match(example, /^AI_ENABLED=false$/m);
  for (const line of example.split(/\r?\n/)) {
    const [name, value = ''] = line.split('=');
    // Secret-bearing names only; PASSWORD_RESET_TOKEN_TTL_MINUTES is a number.
    if (/(_PASS|_PASSWORD|_SECRET|_API_KEY)$/.test(name) && value) {
      assert.match(value, /^replace_with_/, `${name} holds a placeholder`);
    }
  }
});

test('CI runs the tests and static checks without any secret', () => {
  const workflow = YAML.parse(read('.github/workflows/ci.yml'));
  const source = read('.github/workflows/ci.yml');

  assert.deepEqual(Object.keys(workflow.jobs).sort(), ['ml', 'node', 'static']);
  assert.match(source, /npm test/);
  assert.match(source, /npm audit --omit=dev --audit-level=high/);
  assert.match(source, /python -m unittest discover -s tests -v/);
  assert.match(source, /git diff --check/);
  assert.doesNotMatch(source, /secrets\./, 'no repository secret is referenced');
  assert.deepEqual(workflow.permissions, { contents: 'read' });
});
