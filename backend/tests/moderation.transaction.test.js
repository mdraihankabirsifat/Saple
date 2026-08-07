const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../config/database');
const adminRepository = require('../repositories/admin.repository');

const originalGetConnection = database.getConnection;

test.afterEach(() => {
  database.getConnection = originalGetConnection;
});

function input(overrides = {}) {
  return {
    submissionId: 12,
    moderatorUserId: 6,
    newStatus: 'APPROVED',
    actionType: 'APPROVE',
    actionNote: null,
    allowedPreviousStatuses: ['PENDING'],
    ...overrides
  };
}

test('moderation locks, updates, audits, commits once, and closes', async () => {
  const sqlCalls = [];
  const calls = { commit: 0, rollback: 0, close: 0 };
  database.getConnection = async () => ({
    execute: async (sql) => {
      sqlCalls.push(sql);
      if (sqlCalls.length === 1) return { rows: [{ submissionStatus: 'PENDING' }] };
      if (sqlCalls.length === 2) return { rowsAffected: 1 };
      return { outBinds: { actionId: [4] } };
    },
    commit: async () => { calls.commit += 1; },
    rollback: async () => { calls.rollback += 1; },
    close: async () => { calls.close += 1; }
  });

  const result = await adminRepository.updateSubmissionStatusWithAudit(input());

  assert.match(sqlCalls[0], /FOR UPDATE/);
  assert.match(sqlCalls[1], /UPDATE submissions/);
  assert.match(sqlCalls[2], /INSERT INTO moderation_actions/);
  assert.equal(result.actionId, 4);
  assert.equal(result.previousStatus, 'PENDING');
  assert.deepEqual(calls, { commit: 1, rollback: 0, close: 1 });
});

test('moderation audit failure rolls back the submission update', async () => {
  let execution = 0;
  const calls = { commit: 0, rollback: 0, close: 0 };
  database.getConnection = async () => ({
    execute: async () => {
      execution += 1;
      if (execution === 1) return { rows: [{ submissionStatus: 'PENDING' }] };
      if (execution === 2) return { rowsAffected: 1 };
      throw new Error('simulated moderation audit failure');
    },
    commit: async () => { calls.commit += 1; },
    rollback: async () => { calls.rollback += 1; },
    close: async () => { calls.close += 1; }
  });

  await assert.rejects(
    adminRepository.updateSubmissionStatusWithAudit(input()),
    /simulated moderation audit failure/
  );
  assert.equal(execution, 3);
  assert.deepEqual(calls, { commit: 0, rollback: 1, close: 1 });
});

test('an already-processed submission is rejected while holding the row lock', async () => {
  const calls = { commit: 0, rollback: 0, close: 0 };
  database.getConnection = async () => ({
    execute: async () => ({ rows: [{ submissionStatus: 'APPROVED' }] }),
    commit: async () => { calls.commit += 1; },
    rollback: async () => { calls.rollback += 1; },
    close: async () => { calls.close += 1; }
  });

  await assert.rejects(
    adminRepository.updateSubmissionStatusWithAudit(input()),
    (error) => error.sapleCode === 'INVALID_TRANSITION'
  );
  assert.deepEqual(calls, { commit: 0, rollback: 1, close: 1 });
});
