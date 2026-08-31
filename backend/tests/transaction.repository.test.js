const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../config/database');
const userRepository = require('../repositories/user.repository');
const salaryRepository = require('../repositories/salary.repository');

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

test('employee registration rolls back when the EMPLOYEES insert fails', async () => {
  let execution = 0;
  const client = mockClient(async () => {
    execution += 1;
    if (execution === 1) return { rows: [{ userId: 8 }] };
    throw new Error('simulated employee insert failure');
  });
  database.getClient = async () => client;

  await assert.rejects(
    userRepository.createUserWithOptionalEmployee({
      fullName: 'Test Employee',
      email: 'employee@example.com',
      passwordHash: '$2b$12$abcdefghijklmnopqrstuvwxyz1234567890123456789012',
      userType: 'EMPLOYEE',
      employmentStatus: 'CURRENT'
    }),
    /simulated employee insert failure/
  );
  assert.deepEqual(client.state, { commits: 0, rollbacks: 1, releases: 1 });
});

function salaryInput() {
  return {
    userId: 8, companyId: 1, roleId: 1, baseSalary: 50000,
    additionalCompensation: null, currency: 'BDT', payPeriod: 'MONTHLY',
    yearsOfExperience: 2, employmentType: 'FULL_TIME', workMode: 'ONSITE',
    salaryYear: 2026, isAnonymous: true
  };
}

test('failed SALARY_SUBMISSIONS insert rolls back the SUBMISSIONS parent', async () => {
  let execution = 0;
  const client = mockClient(async () => {
    execution += 1;
    if (execution === 1) return { rows: [{ verificationId: 9 }] };
    if (execution === 2) return { rows: [{ companyId: 1 }] };
    if (execution === 3) return { rows: [{ roleId: 1 }] };
    if (execution === 4) return { rows: [{ submissionId: 12 }] };
    throw new Error('simulated child insert failure');
  });
  database.getClient = async () => client;

  await assert.rejects(
    salaryRepository.createSalarySubmission(salaryInput()),
    /simulated child insert failure/
  );
  assert.equal(execution, 5);
  assert.deepEqual(client.state, { commits: 0, rollbacks: 1, releases: 1 });
});

test('successful salary transaction commits once and releases its client', async () => {
  let execution = 0;
  const client = mockClient(async () => {
    execution += 1;
    if (execution === 1) return { rows: [{ verificationId: 9 }] };
    if (execution === 2) return { rows: [{ companyId: 1 }] };
    if (execution === 3) return { rows: [{ roleId: 1 }] };
    if (execution === 4) return { rows: [{ submissionId: 12 }] };
    return { rowCount: 1, rows: [] };
  });
  database.getClient = async () => client;

  const result = await salaryRepository.createSalarySubmission(salaryInput());
  assert.deepEqual(result, {
    submissionId: 12,
    submissionStatus: 'PENDING',
    verificationStatus: 'VERIFIED'
  });
  assert.deepEqual(client.state, { commits: 1, rollbacks: 0, releases: 1 });
});
