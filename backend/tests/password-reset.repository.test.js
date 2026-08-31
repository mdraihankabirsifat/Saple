const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../config/database');
const repository = require('../repositories/password-reset.repository');

const originalGetClient = database.getClient;
test.afterEach(() => { database.getClient = originalGetClient; });

function mockClient(execute) {
  const state = { commits: 0, rollbacks: 0, releases: 0 };
  return {
    state,
    async query(sql, values) {
      if (sql === 'BEGIN') return {};
      if (sql === 'COMMIT') { state.commits += 1; return {}; }
      if (sql === 'ROLLBACK') { state.rollbacks += 1; return {}; }
      return execute(sql, values);
    },
    release() { state.releases += 1; }
  };
}

test('SMTP delivery failure rolls back token creation', async () => {
  let execution = 0;
  const client = mockClient(async (sql, values) => {
    execution += 1;
    if (execution === 1) return { rows: [{ accountStatus: 'ACTIVE' }] };
    if (execution === 2) return { rowCount: 1, rows: [] };
    assert.match(values[1], /^[a-f0-9]{64}$/);
    return { rows: [{ resetTokenId: 9 }] };
  });
  database.getClient = async () => client;
  await assert.rejects(repository.createTokenWithDelivery({
    userId: 8, tokenHash: 'a'.repeat(64), expiresMinutes: 15,
    deliver: async () => { throw new Error('simulated delivery failure'); }
  }), /simulated delivery failure/);
  assert.deepEqual(client.state, { commits: 0, rollbacks: 1, releases: 1 });
});

test('successful token delivery commits only after delivery completes', async () => {
  const order = [];
  let execution = 0;
  const client = mockClient(async () => {
    execution += 1;
    if (execution === 1) return { rows: [{ accountStatus: 'ACTIVE' }] };
    if (execution === 2) return { rowCount: 1, rows: [] };
    return { rows: [{ resetTokenId: 10 }] };
  });
  const originalQuery = client.query.bind(client);
  client.query = async (sql, values) => {
    if (sql === 'COMMIT') order.push('commit');
    return originalQuery(sql, values);
  };
  const originalRelease = client.release.bind(client);
  client.release = () => { order.push('release'); originalRelease(); };
  database.getClient = async () => client;

  await repository.createTokenWithDelivery({
    userId: 8, tokenHash: 'b'.repeat(64), expiresMinutes: 15,
    deliver: async () => { order.push('deliver'); }
  });
  assert.deepEqual(order, ['deliver', 'commit', 'release']);
});

test('password update, token consumption, revocation, and token-version change are atomic', async () => {
  let execution = 0;
  const client = mockClient(async (sql, values) => {
    execution += 1;
    if (execution === 1) {
      assert.equal(values[0], 'c'.repeat(64));
      return { rows: [{
        resetTokenId: 11, userId: 8, usedAt: null, revokedAt: null,
        isExpired: 0, accountStatus: 'ACTIVE'
      }] };
    }
    if (execution === 2) {
      assert.match(sql, /token_version = token_version \+ 1/);
      return { rowCount: 1, rows: [] };
    }
    return { rowCount: 1, rows: [] };
  });
  database.getClient = async () => client;
  const result = await repository.consumeTokenAndUpdatePassword({
    tokenHash: 'c'.repeat(64),
    passwordHash: '$2b$12$abcdefghijklmnopqrstuvwxyz1234567890123456789012'
  });
  assert.deepEqual(result, { userId: 8, passwordReset: true });
  assert.deepEqual(client.state, { commits: 1, rollbacks: 0, releases: 1 });
});

test('failure while consuming a token rolls back the password update', async () => {
  let execution = 0;
  const client = mockClient(async () => {
    execution += 1;
    if (execution === 1) return { rows: [{
      resetTokenId: 11, userId: 8, usedAt: null, revokedAt: null,
      isExpired: 0, accountStatus: 'ACTIVE'
    }] };
    if (execution === 2) return { rowCount: 1, rows: [] };
    throw new Error('simulated token-consumption failure');
  });
  database.getClient = async () => client;
  await assert.rejects(repository.consumeTokenAndUpdatePassword({
    tokenHash: 'd'.repeat(64), passwordHash: 'hashed-password-value'
  }), /simulated token-consumption failure/);
  assert.deepEqual(client.state, { commits: 0, rollbacks: 1, releases: 1 });
});
