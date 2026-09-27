const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../config/database.js'), 'utf8');
function setup({ fallback = 'false', primaryError = null, localError = null } = {}) {
  const calls = { primary: [], local: [], ended: [] };
  const state = { primaryError, localError, transactionError: null };
  function connectivity() { return Object.assign(new Error('connection lost'), { code: 'ECONNRESET' }); }
  class Pool {
    constructor(config) { this.name = config.connectionString.includes('primary') ? 'primary' : 'local'; }
    on() {}
    async query(sql, values) {
      calls[this.name].push({ sql, values });
      if (state[`${this.name}Error`]) throw state[`${this.name}Error`];
      return { rows: [{ ok: 1 }] };
    }
    async connect() {
      if (state[`${this.name}Error`]) throw state[`${this.name}Error`];
      const owner = this;
      return { async query(sql) {
        calls[owner.name].push({ sql });
        if (state.transactionError && sql !== 'ROLLBACK') throw state.transactionError;
        return { rows: [] };
      }, release() {} };
    }
    async end() { calls.ended.push(this.name); }
  }
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: (name) => {
    if (name !== 'pg') throw Error(name);
    return { Pool, types: { setTypeParser() {} } };
  }, process: { env: { DATABASE_URL: 'postgres://primary', LOCAL_DATABASE_URL: 'postgres://local', DB_SSL: 'false', LOCAL_DB_SSL: 'false', DB_FALLBACK_ENABLED: fallback } }, console: { log() {}, warn() {}, error() {} } }, { filename: 'database.js' });
  return { database: module.exports, calls, state, connectivity };
}

test('fallback remains disabled by default and primary errors fail startup', async () => {
  const { database, calls, connectivity } = setup({ primaryError: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }) });
  await assert.rejects(database.initializePool());
  assert.equal(calls.local.length, 0);
});
test('a healthy primary stays selected when fallback is enabled', async () => {
  const { database, calls } = setup({ fallback: 'true' });
  await database.initializePool();
  assert.equal(database.getSource(), 'supabase');
  assert.equal(calls.local.length, 0);
  await database.closePool();
});
test('startup chooses local only for primary connectivity failure', async () => {
  const { database, calls, connectivity } = setup({ fallback: 'true', primaryError: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }) });
  await database.initializePool();
  assert.equal(database.getSource(), 'local');
  assert.equal(calls.local[0].sql, 'SELECT 1 AS ok');
  await database.closePool();
});
test('both unreachable fail startup clearly', async () => {
  const outage = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
  const { database } = setup({ fallback: 'true', primaryError: outage, localError: outage });
  await assert.rejects(database.initializePool(), /Neither primary nor local PostgreSQL is reachable/);
});
test('SQL errors never trigger failover', async () => {
  const { database, state, calls } = setup({ fallback: 'true' });
  await database.initializePool();
  state.primaryError = Object.assign(new Error('syntax'), { code: '42601' });
  await assert.rejects(database.query('BAD SQL'), /syntax/);
  assert.equal(database.getSource(), 'supabase');
  assert.equal(calls.local.length, 0);
  await database.closePool();
});
test('a runtime outage switches once, retries query and stays local', async () => {
  const { database, state, calls, connectivity } = setup({ fallback: 'true' });
  await database.initializePool();
  state.primaryError = connectivity();
  await database.query('SELECT 42');
  await database.query('SELECT 43');
  assert.equal(database.getSource(), 'local');
  assert.equal(calls.local.filter((item) => item.sql === 'SELECT 1 AS ok').length, 1);
  assert.deepEqual(calls.local.slice(-2).map((item) => item.sql), ['SELECT 42', 'SELECT 43']);
  await database.closePool();
});
test('a transaction is never replayed after BEGIN and cloud messages reject local mode', async () => {
  const { database, state, calls, connectivity } = setup({ fallback: 'true' });
  await database.initializePool();
  state.transactionError = connectivity();
  await assert.rejects(database.withTransaction((client) => client.query('INSERT INTO example')));
  assert.equal(calls.local.length, 0);
  state.transactionError = null;
  state.primaryError = connectivity();
  await database.query('SELECT 1');
  await assert.rejects(database.cloudQuery('SELECT 1'), (error) => error.statusCode === 503);
  await database.closePool();
});
