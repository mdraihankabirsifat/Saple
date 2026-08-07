const test = require('node:test');
const assert = require('node:assert/strict');
const salaryRepository = require('../repositories/salary.repository');
const salaryService = require('../services/salary.service');

const originalCreate = salaryRepository.createSalarySubmission;

test.afterEach(() => {
  salaryRepository.createSalarySubmission = originalCreate;
});

function validSalary(overrides = {}) {
  return {
    roleId: 1,
    baseSalary: 50000,
    additionalCompensation: 5000,
    currency: 'BDT',
    payPeriod: 'MONTHLY',
    yearsOfExperience: 2.5,
    employmentType: 'FULL_TIME',
    workMode: 'HYBRID',
    salaryYear: 2026,
    isAnonymous: true,
    ...overrides
  };
}

test('salary validation preserves schema-compatible controlled values', async () => {
  let repositoryInput;
  salaryRepository.createSalarySubmission = async (input) => {
    repositoryInput = input;
    return { submissionId: 12, submissionStatus: 'PENDING', verificationStatus: 'UNVERIFIED' };
  };

  const result = await salaryService.submitSalary(8, '1', validSalary());

  assert.equal(repositoryInput.companyId, 1);
  assert.equal(repositoryInput.roleId, 1);
  assert.equal(repositoryInput.isAnonymous, true);
  assert.equal(result.submissionStatus, 'PENDING');
});

test('salary validation rejects invalid salary, enums, and anonymity types', async () => {
  for (const input of [
    validSalary({ baseSalary: 0 }),
    validSalary({ currency: 'bdt' }),
    validSalary({ employmentType: 'PERMANENT' }),
    validSalary({ workMode: null }),
    validSalary({ isAnonymous: 1 })
  ]) {
    await assert.rejects(
      salaryService.submitSalary(8, '1', input),
      (error) => error.statusCode === 400
    );
  }
});

test('missing company and role repository results become 404 responses', async () => {
  salaryRepository.createSalarySubmission = async () => {
    const error = new Error('missing');
    error.sapleCode = 'COMPANY_NOT_FOUND';
    throw error;
  };

  await assert.rejects(
    salaryService.submitSalary(8, '999', validSalary()),
    (error) => error.statusCode === 404 && error.message === 'Company not found'
  );
});
