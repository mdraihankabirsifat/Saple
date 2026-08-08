const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../config/database');
const passwordResetRepository = require('../repositories/password-reset.repository');

const originalGetConnection = database.getConnection;

test.afterEach(() => {
  database.getConnection = originalGetConnection;
});

test('SMTP delivery failure rolls back token creation and leaves no committed usable token', async () => {
  const calls = { execute: 0, commit: 0, rollback: 0, close: 0 };
  database.getConnection = async () => ({
    execute: async (sql, binds) => {
      calls.execute += 1;
      if (calls.execute === 1) return { rows: [{ accountStatus: 'ACTIVE' }] };
      if (calls.execute === 2) return { rowsAffected: 1 };
      assert.match(binds.tokenHash, /^[a-f0-9]{64}$/);
      return { outBinds: { resetTokenId: [9] } };
    },
    commit: async () => { calls.commit += 1; },
    rollback: async () => { calls.rollback += 1; },
    close: async () => { calls.close += 1; }
  });

  await assert.rejects(
    passwordResetRepository.createTokenWithDelivery({
      userId: 8,
      tokenHash: 'a'.repeat(64),
      expiresMinutes: 15,
      deliver: async () => { throw new Error('simulated delivery failure'); }
    }),
    /simulated delivery failure/
  );

  assert.deepEqual(calls, { execute: 3, commit: 0, rollback: 1, close: 1 });
});

test('successful token delivery commits only after delivery completes', async () => {
  const order = [];
  let execution = 0;
  database.getConnection = async () => ({
    execute: async () => {
      execution += 1;
      if (execution === 1) return { rows: [{ accountStatus: 'ACTIVE' }] };
      if (execution === 2) return { rowsAffected: 1 };
      return { outBinds: { resetTokenId: [10] } };
    },
    commit: async () => { order.push('commit'); },
    rollback: async () => { order.push('rollback'); },
    close: async () => { order.push('close'); }
  });

  await passwordResetRepository.createTokenWithDelivery({
    userId: 8,
    tokenHash: 'b'.repeat(64),
    expiresMinutes: 15,
    deliver: async () => { order.push('deliver'); }
  });

  assert.deepEqual(order, ['deliver', 'commit', 'close']);
});

test('password update, token consumption, and other-token revocation commit atomically', async () => {
  const calls = { execute: 0, commit: 0, rollback: 0, close: 0 };
  database.getConnection = async () => ({
    execute: async (sql, binds) => {
      calls.execute += 1;
      if (calls.execute === 1) {
        assert.equal(binds.tokenHash, 'c'.repeat(64));
        return { rows: [{
          resetTokenId: 11,
          userId: 8,
          usedAt: null,
          revokedAt: null,
          isExpired: 0,
          accountStatus: 'ACTIVE'
        }] };
      }
      if (calls.execute === 2) {
        assert.match(sql, /UPDATE users/);
        return { rowsAffected: 1 };
      }
      return { rowsAffected: 1 };
    },
    commit: async () => { calls.commit += 1; },
    rollback: async () => { calls.rollback += 1; },
    close: async () => { calls.close += 1; }
  });

  const result = await passwordResetRepository.consumeTokenAndUpdatePassword({
    tokenHash: 'c'.repeat(64),
    passwordHash: '$2b$12$abcdefghijklmnopqrstuvwxyz1234567890123456789012'
  });

  assert.deepEqual(result, { userId: 8, passwordReset: true });
  assert.deepEqual(calls, { execute: 4, commit: 1, rollback: 0, close: 1 });
});

test('failure while consuming a token rolls back the password update', async () => {
  let execution = 0;
  const calls = { commit: 0, rollback: 0, close: 0 };
  database.getConnection = async () => ({
    execute: async () => {
      execution += 1;
      if (execution === 1) return { rows: [{
        resetTokenId: 11, userId: 8, usedAt: null, revokedAt: null,
        isExpired: 0, accountStatus: 'ACTIVE'
      }] };
      if (execution === 2) return { rowsAffected: 1 };
      throw new Error('simulated token-consumption failure');
    },
    commit: async () => { calls.commit += 1; },
    rollback: async () => { calls.rollback += 1; },
    close: async () => { calls.close += 1; }
  });

  await assert.rejects(
    passwordResetRepository.consumeTokenAndUpdatePassword({
      tokenHash: 'd'.repeat(64), passwordHash: 'hashed-password-value'
    }),
    /simulated token-consumption failure/
  );
  assert.deepEqual(calls, { commit: 0, rollback: 1, close: 1 });
});
