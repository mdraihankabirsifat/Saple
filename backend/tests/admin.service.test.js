const test = require('node:test');
const assert = require('node:assert/strict');
const adminRepository = require('../repositories/admin.repository');
const adminService = require('../services/admin.service');

const originals = {
  findSubmissionById: adminRepository.findSubmissionById,
  findModerationHistory: adminRepository.findModerationHistory,
  updateSubmissionStatusWithAudit: adminRepository.updateSubmissionStatusWithAudit
};

test.afterEach(() => {
  Object.assign(adminRepository, originals);
});

test('submission IDs and moderation target statuses are validated', async () => {
  await assert.rejects(adminService.getSubmission('invalid'), (error) => error.statusCode === 400);
  await assert.rejects(
    adminService.moderateSubmission(6, 4, { status: 'PENDING' }),
    (error) => error.statusCode === 400
  );
});

test('reject and flag require a note while approval permits an empty note', async () => {
  await assert.rejects(
    adminService.moderateSubmission(6, 4, { status: 'REJECTED', note: '  ' }),
    (error) => error.statusCode === 400
  );
  await assert.rejects(
    adminService.moderateSubmission(6, 4, { status: 'FLAGGED' }),
    (error) => error.statusCode === 400
  );

  let received;
  adminRepository.updateSubmissionStatusWithAudit = async (input) => {
    received = input;
    return { submissionId: input.submissionId, submissionStatus: input.newStatus };
  };

  const result = await adminService.moderateSubmission(6, 4, { status: 'APPROVED', note: '' });
  assert.equal(result.submissionStatus, 'APPROVED');
  assert.deepEqual(received.allowedPreviousStatuses, ['PENDING']);
  assert.equal(received.actionType, 'APPROVE');
  assert.equal(received.actionNote, null);
});

test('repository transition conflicts become HTTP 409', async () => {
  adminRepository.updateSubmissionStatusWithAudit = async () => {
    const error = new Error('This submission has already been processed or cannot make that transition');
    error.sapleCode = 'INVALID_TRANSITION';
    throw error;
  };

  await assert.rejects(
    adminService.moderateSubmission(6, 4, { status: 'APPROVED' }),
    (error) => error.statusCode === 409
  );
});

test('admin detail maps salary fields and numeric anonymity safely', async () => {
  adminRepository.findSubmissionById = async () => ({
    submissionId: 4,
    submissionType: 'SALARY',
    companyId: 1,
    companyName: 'Aster Byte Limited',
    submittedAt: new Date(),
    approvedAt: null,
    updatedAt: new Date(),
    submissionStatus: 'PENDING',
    verificationStatus: 'UNVERIFIED',
    isAnonymous: 1,
    submitterUserId: 8,
    submitterName: 'Test User',
    submitterEmail: 'test@example.test',
    submitterType: 'NORMAL',
    roleId: 1,
    roleName: 'Software Engineer',
    baseSalary: 60000,
    additionalCompensation: null,
    currency: 'BDT',
    payPeriod: 'MONTHLY',
    yearsOfExperience: 2,
    employmentType: 'FULL_TIME',
    workMode: 'HYBRID',
    salaryYear: 2026
  });

  const submission = await adminService.getSubmission(4);
  assert.equal(submission.isAnonymous, true);
  assert.equal(submission.salary.roleName, 'Software Engineer');
  assert.equal('passwordHash' in submission.submitter, false);
});
