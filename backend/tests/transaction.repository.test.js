const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../config/database');
const userRepository = require('../repositories/user.repository');
const salaryRepository = require('../repositories/salary.repository');

const originalGetConnection = database.getConnection;

test.afterEach(() => {
  database.getConnection = originalGetConnection;
});

test('employee registration rolls back when the EMPLOYEES insert fails', async () => {
  let execution = 0;
  const calls = { commit: 0, rollback: 0, close: 0 };
  database.getConnection = async () => ({
    execute: async () => {
      execution += 1;
      if (execution === 1) return { outBinds: { userId: [8] } };
      throw new Error('simulated employee insert failure');
    },
    commit: async () => { calls.commit += 1; },
    rollback: async () => { calls.rollback += 1; },
    close: async () => { calls.close += 1; }
  });

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

  assert.deepEqual(calls, { commit: 0, rollback: 1, close: 1 });
});

test('failed SALARY_SUBMISSIONS insert rolls back the SUBMISSIONS parent', async () => {
  let execution = 0;
  const calls = { commit: 0, rollback: 0, close: 0 };
  database.getConnection = async () => ({
    execute: async () => {
      execution += 1;
      if (execution === 1) return { rows: [{ verificationId: 9 }] };
      if (execution === 2) return { rows: [{ companyId: 1 }] };
      if (execution === 3) return { rows: [{ roleId: 1 }] };
      if (execution === 4) return { outBinds: { submissionId: [12] } };
      throw new Error('simulated child insert failure');
    },
    commit: async () => { calls.commit += 1; },
    rollback: async () => { calls.rollback += 1; },
    close: async () => { calls.close += 1; }
  });

  await assert.rejects(
    salaryRepository.createSalarySubmission({
      userId: 8,
      companyId: 1,
      roleId: 1,
      baseSalary: 50000,
      additionalCompensation: null,
      currency: 'BDT',
      payPeriod: 'MONTHLY',
      yearsOfExperience: 2,
      employmentType: 'FULL_TIME',
      workMode: 'ONSITE',
      salaryYear: 2026,
      isAnonymous: true
    }),
    /simulated child insert failure/
  );

  assert.equal(execution, 5);
  assert.deepEqual(calls, { commit: 0, rollback: 1, close: 1 });
});

test('successful salary transaction commits once and releases its connection', async () => {
  let execution = 0;
  const calls = { commit: 0, rollback: 0, close: 0 };
  database.getConnection = async () => ({
    execute: async () => {
      execution += 1;
      if (execution === 1) return { rows: [{ verificationId: 9 }] };
      if (execution === 2) return { rows: [{ companyId: 1 }] };
      if (execution === 3) return { rows: [{ roleId: 1 }] };
      if (execution === 4) return { outBinds: { submissionId: [12] } };
      return { rowsAffected: 1 };
    },
    commit: async () => { calls.commit += 1; },
    rollback: async () => { calls.rollback += 1; },
    close: async () => { calls.close += 1; }
  });

  const result = await salaryRepository.createSalarySubmission({
    userId: 8,
    companyId: 1,
    roleId: 1,
    baseSalary: 50000,
    additionalCompensation: null,
    currency: 'BDT',
    payPeriod: 'MONTHLY',
    yearsOfExperience: 2,
    employmentType: 'FULL_TIME',
    workMode: 'ONSITE',
    salaryYear: 2026,
    isAnonymous: true
  });

  assert.equal(result.submissionId, 12);
  assert.equal(result.submissionStatus, 'PENDING');
  assert.equal(result.verificationStatus, 'VERIFIED');
  assert.deepEqual(calls, { commit: 1, rollback: 0, close: 1 });
});
