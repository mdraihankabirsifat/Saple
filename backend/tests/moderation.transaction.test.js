const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../config/database');
const adminRepository = require('../repositories/admin.repository');

const originalGetClient = database.getClient;
test.afterEach(() => { database.getClient = originalGetClient; });

function input(overrides = {}) {
  return {
    submissionId: 12, moderatorUserId: 6, newStatus: 'APPROVED',
    actionType: 'APPROVE', actionNote: null, allowedPreviousStatuses: ['PENDING'],
    ...overrides
  };
}

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

test('moderation locks, updates, audits, commits once, and releases', async () => {
  const sqlCalls = [];
  const client = mockClient(async (sql) => {
    sqlCalls.push(sql);
    if (sqlCalls.length === 1) return { rows: [{ submissionStatus: 'PENDING' }] };
    if (sqlCalls.length === 2) return { rowCount: 1, rows: [] };
    return { rows: [{ actionId: 4 }] };
  });
  database.getClient = async () => client;

  const result = await adminRepository.updateSubmissionStatusWithAudit(input());
  assert.match(sqlCalls[0], /FOR UPDATE/);
  assert.match(sqlCalls[1], /UPDATE submissions/);
  assert.match(sqlCalls[2], /INSERT INTO moderation_actions/);
  assert.equal(result.actionId, 4);
  assert.equal(result.previousStatus, 'PENDING');
  assert.deepEqual(client.state, { commits: 1, rollbacks: 0, releases: 1 });
});

test('moderation audit failure rolls back the submission update', async () => {
  let execution = 0;
  const client = mockClient(async () => {
    execution += 1;
    if (execution === 1) return { rows: [{ submissionStatus: 'PENDING' }] };
    if (execution === 2) return { rowCount: 1, rows: [] };
    throw new Error('simulated moderation audit failure');
  });
  database.getClient = async () => client;

  await assert.rejects(
    adminRepository.updateSubmissionStatusWithAudit(input()),
    /simulated moderation audit failure/
  );
  assert.deepEqual(client.state, { commits: 0, rollbacks: 1, releases: 1 });
});

test('an already-processed submission is rejected while holding the row lock', async () => {
  const client = mockClient(async () => ({ rows: [{ submissionStatus: 'APPROVED' }] }));
  database.getClient = async () => client;
  await assert.rejects(
    adminRepository.updateSubmissionStatusWithAudit(input()),
    (error) => error.sapleCode === 'INVALID_TRANSITION'
  );
  assert.deepEqual(client.state, { commits: 0, rollbacks: 1, releases: 1 });
});
