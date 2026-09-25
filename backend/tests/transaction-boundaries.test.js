const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const database = require('../config/database');
const userRepository = require('../repositories/user.repository');
const announcementRepository = require('../repositories/announcement.repository');
const notificationRepository = require('../repositories/notification.repository');

// The department checklist asks for explicit transaction control on every DML
// operation, including the single-statement ones. These tests prove the
// helper's BEGIN/COMMIT/ROLLBACK/release behaviour, prove that the previously
// implicit repository writes now use it, and guard against a new repository
// quietly going back to database.query for a write.

const originalGetClient = database.getClient;

function mockClient(execute) {
  const state = { commits: 0, rollbacks: 0, releases: 0, statements: [] };
  return {
    state,
    async query(sql, values) {
      state.statements.push(sql);
      if (sql === 'BEGIN') return {};
      if (sql === 'COMMIT') { state.commits += 1; return {}; }
      if (sql === 'ROLLBACK') { state.rollbacks += 1; return {}; }
      return execute(sql, values);
    },
    release() { state.releases += 1; }
  };
}

test.afterEach(() => {
  database.getClient = originalGetClient;
});

// ---------------------------------------------------------------------------
// The helper itself
// ---------------------------------------------------------------------------

test('withTransaction commits the work and always releases the client', async () => {
  const client = mockClient(async () => ({ rows: [{ ok: 1 }] }));
  database.getClient = async () => client;

  const result = await database.withTransaction(async (transactionClient) => {
    const query = await transactionClient.query('UPDATE users SET full_name = $1', ['Synthetic Name']);
    return query.rows[0];
  });

  assert.deepEqual(result, { ok: 1 });
  assert.deepEqual(client.state.statements.slice(0, 1), ['BEGIN']);
  assert.equal(client.state.statements.at(-1), 'COMMIT');
  assert.deepEqual(
    { commits: client.state.commits, rollbacks: client.state.rollbacks, releases: client.state.releases },
    { commits: 1, rollbacks: 0, releases: 1 }
  );
});

test('withTransaction rolls back on failure, releases, and rethrows the original error', async () => {
  const client = mockClient(async () => { throw new Error('write failed'); });
  database.getClient = async () => client;

  await assert.rejects(
    database.withTransaction((transactionClient) => transactionClient.query('DELETE FROM notifications')),
    /write failed/
  );
  assert.deepEqual(
    { commits: client.state.commits, rollbacks: client.state.rollbacks, releases: client.state.releases },
    { commits: 0, rollbacks: 1, releases: 1 }
  );
});

test('a failing ROLLBACK never hides the error that caused it', async () => {
  const client = {
    released: false,
    async query(sql) {
      if (sql === 'BEGIN') return {};
      if (sql === 'ROLLBACK') throw new Error('connection lost');
      throw new Error('original failure');
    },
    release() { this.released = true; }
  };
  database.getClient = async () => client;

  await assert.rejects(database.withTransaction((c) => c.query('UPDATE users SET full_name = $1', ['x'])), /original failure/);
  assert.equal(client.released, true);
});

test('withTransaction joins an existing transaction instead of nesting a new one', async () => {
  const outer = mockClient(async () => ({ rows: [] }));
  database.getClient = async () => { throw new Error('must not open a second client'); };

  await database.withTransaction(
    (client) => client.query('INSERT INTO notifications (user_id) VALUES ($1)', [1]),
    outer
  );

  // No BEGIN, COMMIT or ROLLBACK of its own: the caller owns those.
  assert.deepEqual(outer.state.commits, 0);
  assert.deepEqual(outer.state.rollbacks, 0);
  assert.equal(outer.state.releases, 0, 'the owner of the client releases it');
  assert.deepEqual(outer.state.statements, ['INSERT INTO notifications (user_id) VALUES ($1)']);
});

// ---------------------------------------------------------------------------
// The repository writes that used to run without an explicit transaction
// ---------------------------------------------------------------------------

const SINGLE_STATEMENT_WRITES = [
  ['users.updateFullName', () => userRepository.updateFullName(7, 'Synthetic Name'), /UPDATE users/],
  ['users.incrementTokenVersion', () => userRepository.incrementTokenVersion(7), /token_version \+ 1/],
  ['announcements.createAnnouncement', () => announcementRepository.createAnnouncement({
    title: 'Synthetic', message: 'Synthetic', severity: 'INFO', isDismissible: true,
    isActive: true, startsAt: null, endsAt: null, createdBy: 7
  }), /INSERT INTO announcements/],
  ['announcements.updateAnnouncement', () => announcementRepository.updateAnnouncement(3, {
    title: 'Synthetic', message: 'Synthetic', severity: 'INFO', isDismissible: true,
    isActive: true, startsAt: null, endsAt: null
  }), /UPDATE announcements/],
  ['announcements.setAnnouncementActive', () => announcementRepository.setAnnouncementActive(3, false), /UPDATE announcements/],
  ['notifications.markOneRead', () => notificationRepository.markOneRead(7, 12), /UPDATE notifications/],
  ['notifications.markAllRead', () => notificationRepository.markAllRead(7), /UPDATE notifications/]
];

test('every single-statement repository write runs inside BEGIN and COMMIT', async () => {
  for (const [name, call, expectedSql] of SINGLE_STATEMENT_WRITES) {
    const client = mockClient(async () => ({ rowCount: 1, rows: [{ announcementId: 3, notificationId: 4, tokenVersion: 2 }] }));
    database.getClient = async () => client;

    await call();

    assert.equal(client.state.statements[0], 'BEGIN', name);
    assert.equal(client.state.statements.at(-1), 'COMMIT', name);
    assert.match(client.state.statements[1], expectedSql, name);
    assert.deepEqual(
      { commits: client.state.commits, rollbacks: client.state.rollbacks, releases: client.state.releases },
      { commits: 1, rollbacks: 0, releases: 1 },
      name
    );
  }
});

test('a failed single-statement write rolls back and releases', async () => {
  for (const [name, call] of SINGLE_STATEMENT_WRITES) {
    const client = mockClient(async () => { throw new Error('database unavailable'); });
    database.getClient = async () => client;

    await assert.rejects(call(), /database unavailable/, name);
    assert.deepEqual(
      { commits: client.state.commits, rollbacks: client.state.rollbacks, releases: client.state.releases },
      { commits: 0, rollbacks: 1, releases: 1 },
      name
    );
  }
});

// ---------------------------------------------------------------------------
// Guard: no repository may go back to an implicit transaction
// ---------------------------------------------------------------------------

test('no repository issues INSERT, UPDATE or DELETE outside a transaction client', () => {
  const directory = path.resolve(__dirname, '../repositories');
  const offenders = [];

  for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.js'))) {
    const contents = fs.readFileSync(path.join(directory, file), 'utf8').replace(/\r\n/g, '\n');
    const lines = contents.split('\n');
    lines.forEach((line, index) => {
      if (!/^\s*(INSERT INTO|UPDATE |DELETE FROM)/i.test(line)) return;

      // Walk back to whatever issues this statement: a query call, or the SQL
      // constant a caller runs.
      let issuer = 'unknown';
      for (let cursor = index; cursor >= 0 && cursor > index - 15; cursor -= 1) {
        const call = lines[cursor].match(/(database|client|transactionClient|executor)\.(query|withTransaction)/);
        if (call) { issuer = call[0]; break; }
        const constant = lines[cursor].match(/^const (\w+) = `/);
        if (constant) {
          // A shared SQL constant is acceptable only if every use of it runs
          // on a transaction client, never on the pool.
          const uses = [...contents.matchAll(new RegExp(`(\\w+)\\.query\\(\\s*${constant[1]}`, 'g'))];
          const onlyOnClients = uses.length > 0 && uses.every(([, receiver]) => receiver !== 'database');
          issuer = onlyOnClients ? `client.query via ${constant[1]}` : `constant ${constant[1]}`;
          break;
        }
      }
      if (issuer === 'database.query' || issuer === 'unknown' || issuer.startsWith('constant ')) {
        offenders.push(`${file}:${index + 1} (${issuer})`);
      }
    });
  }

  assert.deepEqual(offenders, [], 'these writes would run in an implicit transaction');
});

test('the transaction helper is exported and documented as the single write boundary', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../config/database.js'), 'utf8');

  assert.match(source, /async function withTransaction\(work, existingClient = null\)/);
  assert.match(source, /await client\.query\('BEGIN'\)/);
  assert.match(source, /await client\.query\('COMMIT'\)/);
  assert.match(source, /await client\.query\('ROLLBACK'\)/);
  assert.match(source, /client\.release\(\)/);
  assert.match(source, /module\.exports = \{[^}]*withTransaction/);
  assert.equal(typeof database.withTransaction, 'function');
});
