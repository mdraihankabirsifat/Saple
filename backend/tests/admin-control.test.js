const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const database = require('../config/database');
const authConfig = require('../config/auth');

const schema = fs.readFileSync(path.resolve(__dirname, '../../database/postgres/01_final_schema_postgres.sql'), 'utf8');
const saved = {};
let pg;
let server;
let origin;
let ids;

function token(userId, role = 'USER', tokenVersion = 0) {
  return jwt.sign({ userId, role, tokenVersion }, process.env.JWT_SECRET, {
    algorithm: authConfig.JWT_ALGORITHM, issuer: authConfig.JWT_ISSUER,
    audience: authConfig.JWT_AUDIENCE, expiresIn: '10m'
  });
}
async function request(url, auth, options = {}) {
  const result = await fetch(`${origin}${url}`, { ...options, headers: {
    ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    ...(options.body ? { 'Content-Type': 'application/json' } : {})
  } });
  return { status: result.status, body: await result.json() };
}
const one = async (sql, params = []) => (await pg.query(sql, params)).rows[0];

test.before(async () => {
  process.env.JWT_SECRET = 'admin-control-local-test-only-secret-123456789';
  const { PGlite } = await import('@electric-sql/pglite');
  pg = new PGlite(); await pg.exec(schema);
  let tail = Promise.resolve();
  const acquire = () => {
    let release;
    const next = new Promise((resolve) => { release = resolve; });
    const ready = tail.then(() => release); tail = tail.then(() => next); return ready;
  };
  for (const name of ['query','getClient','cloudQuery','cloudClient','withCloudTransaction']) saved[name] = database[name];
  database.query = async (sql, values) => { const release = await acquire(); try { return await pg.query(sql, values); } finally { release(); } };
  database.cloudQuery = database.query;
  database.getClient = async () => {
    const release = await acquire(); let done = false;
    return { query: (sql, values) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql) ? pg.exec(sql) : pg.query(sql, values),
      release() { if (!done) { done = true; release(); } } };
  };
  database.cloudClient = database.getClient;
  database.withCloudTransaction = (work) => database.withTransaction(work);
  async function add(name, role = 'USER') {
    return (await one(`INSERT INTO users (full_name,email,password_hash,account_role)
      VALUES ($1,$2,$3,$4) RETURNING user_id AS id`,
    [name, `${name.replace(/\s+/g, '.').toLowerCase()}@example.invalid`, 'x'.repeat(60), role])).id;
  }
  ids = { admin: await add('A Admin','ADMIN'), second: await add('B Admin','ADMIN'),
    user: await add('C User'), representative: await add('D Representative','COMPANY_REPRESENTATIVE') };
  const app = require('../app'); server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const [name, value] of Object.entries(saved)) database[name] = value;
  delete process.env.JWT_SECRET;
  await pg.close();
});

test('admin APIs reject anonymous, user and representative while listing safe paginated account data', async () => {
  assert.equal((await request('/api/admin/users', null)).status, 401);
  assert.equal((await request('/api/admin/users', token(ids.user))).status, 403);
  assert.equal((await request('/api/admin/users', token(ids.representative, 'COMPANY_REPRESENTATIVE'))).status, 403);
  const result = await request('/api/admin/users?pageSize=2&search=admin&sort=name', token(ids.admin, 'ADMIN'));
  assert.equal(result.status, 200);
  assert.equal(result.body.data.items.length, 2);
  assert.equal(result.body.data.total, 2);
  assert.ok(!JSON.stringify(result.body).includes('passwordHash'));
  assert.equal((await request('/api/admin/users?pageSize=100000', token(ids.admin, 'ADMIN'))).status, 400);
  const detail = await request(`/api/admin/users/${ids.user}`, token(ids.admin, 'ADMIN'));
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.data.contributions, []);
  for (const endpoint of ['/api/admin/submissions', '/api/admin/verifications/table',
    '/api/admin/reports/table', '/api/admin/subscriptions']) {
    const response = await request(`${endpoint}?pageSize=2`, token(ids.admin, 'ADMIN'));
    assert.equal(response.status, 200, endpoint);
    assert.ok(Array.isArray(response.body.data.items), endpoint);
  }
});

test('suspension invalidates sessions, retains audit, and cannot disable the last admin', async () => {
  const adminToken = token(ids.admin, 'ADMIN');
  const userToken = token(ids.user);
  const suspend = await request(`/api/admin/users/${ids.user}/status`, adminToken, {
    method: 'PATCH', body: JSON.stringify({ status: 'SUSPENDED', reason: 'Test moderation decision' })
  });
  assert.equal(suspend.status, 200);
  assert.equal((await request('/api/auth/me', userToken)).status, 401);
  assert.equal((await one('SELECT token_version AS version FROM users WHERE user_id=$1', [ids.user])).version, 1);
  const reactivate = await request(`/api/admin/users/${ids.user}/status`, adminToken, {
    method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE', reason: 'Review complete' })
  });
  assert.equal(reactivate.status, 200);
  assert.equal((await request('/api/auth/me', userToken)).status, 401);
  assert.equal((await one(`SELECT count(*)::int AS count FROM admin_actions WHERE target_id=$1 AND target_type='USER'`, [ids.user])).count, 2);
  assert.equal((await request(`/api/admin/users/${ids.second}/status`, adminToken, {
    method: 'PATCH', body: JSON.stringify({ status: 'SUSPENDED', reason: 'Missing typed confirmation' })
  })).status, 400);
  assert.equal((await request(`/api/admin/users/${ids.second}/status`, adminToken, {
    method: 'PATCH', body: JSON.stringify({ status: 'SUSPENDED', reason: 'Test second admin', confirmEmail: 'b.admin@example.invalid' })
  })).status, 200);
  assert.equal((await request(`/api/admin/users/${ids.admin}/status`, adminToken, {
    method: 'PATCH', body: JSON.stringify({ status: 'SUSPENDED', reason: 'Attempt last admin', confirmEmail: 'a.admin@example.invalid' })
  })).status, 409);
});

test('manual Premium grant and revoke preserve payment history and update entitlement immediately', async () => {
  const adminToken = token(ids.admin, 'ADMIN');
  const grant = await request(`/api/admin/subscriptions/${ids.user}/grant`, adminToken, {
    method: 'POST', body: JSON.stringify({ days: 30, reason: 'Awarded for test' })
  });
  assert.equal(grant.status, 200);
  const period = await one(`SELECT source_type AS source, payment_id AS payment, revoked_at AS revoked
    FROM premium_access_periods WHERE user_id=$1`, [ids.user]);
  assert.equal(period.source, 'ADMIN_GRANT'); assert.equal(period.payment, null);
  assert.equal((await one('SELECT count(*)::int AS count FROM premium_payments WHERE user_id=$1', [ids.user])).count, 0);
  const premium = require('../services/premium.service');
  assert.equal((await premium.getPremiumAccess(ids.user)).hasPremium, true);
  const revoke = await request(`/api/admin/subscriptions/${ids.user}/revoke`, adminToken, {
    method: 'POST', body: JSON.stringify({ reason: 'Test access revoked' })
  });
  assert.equal(revoke.status, 200);
  assert.equal((await premium.getPremiumAccess(ids.user)).hasPremium, false);
  assert.ok((await one('SELECT revoked_at AS revoked FROM premium_access_periods WHERE user_id=$1', [ids.user])).revoked);
  assert.equal((await one('SELECT count(*)::int AS count FROM premium_payments WHERE user_id=$1', [ids.user])).count, 0);
});
