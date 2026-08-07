const test = require('node:test');
const assert = require('node:assert/strict');
const verificationRepository = require('../repositories/verification.repository');
const reviewRepository = require('../repositories/review.repository');
const interviewRepository = require('../repositories/interview.repository');
const reportRepository = require('../repositories/report.repository');
const verificationService = require('../services/verification.service');
const reviewService = require('../services/review.service');
const interviewService = require('../services/interview.service');
const reportService = require('../services/report.service');

const originals = {
  createVerificationRequest: verificationRepository.createVerificationRequest,
  decideVerification: verificationRepository.decideVerification,
  createReview: reviewRepository.createReview,
  createInterview: interviewRepository.createInterview,
  createReport: reportRepository.createReport,
  updateReportStatus: reportRepository.updateReportStatus
};

test.afterEach(() => {
  verificationRepository.createVerificationRequest = originals.createVerificationRequest;
  verificationRepository.decideVerification = originals.decideVerification;
  reviewRepository.createReview = originals.createReview;
  interviewRepository.createInterview = originals.createInterview;
  reportRepository.createReport = originals.createReport;
  reportRepository.updateReportStatus = originals.updateReportStatus;
});

test('verification request normalizes private evidence and maps authorization errors', async () => {
  let received;
  verificationRepository.createVerificationRequest = async (input) => { received = input; return { verificationId: 5 }; };
  await verificationService.requestVerification(8, '1', {
    employmentStatus: ' current ', verificationMethod: 'company_email_otp',
    companyEmail: ' Worker@Company.Test '
  });
  assert.equal(received.companyEmail, 'worker@company.test');
  assert.equal(received.proofReference, null);

  verificationRepository.createVerificationRequest = async () => {
    const error = new Error('Employee account required'); error.sapleCode = 'EMPLOYEE_REQUIRED'; throw error;
  };
  await assert.rejects(
    verificationService.requestVerification(8, 1, {
      employmentStatus: 'CURRENT', verificationMethod: 'COMPANY_EMAIL_OTP', companyEmail: 'a@b.test'
    }),
    (error) => error.statusCode === 403
  );
});

test('verification decisions require rejection evidence and preserve allowed outcomes', async () => {
  await assert.rejects(
    verificationService.decideVerification(6, 5, { status: 'REJECTED' }),
    (error) => error.statusCode === 400
  );
  let received;
  verificationRepository.decideVerification = async (input) => { received = input; return input; };
  await verificationService.decideVerification(6, 5, { status: 'rejected', rejectionReason: ' Cannot confirm ' });
  assert.equal(received.status, 'REJECTED');
  assert.equal(received.rejectionReason, 'Cannot confirm');
});

test('review validation rejects unsafe fields and passes normalized valid data', async () => {
  const payload = {
    roleId: '', reviewTitle: ' Strong team ', overallRating: 4.5,
    workLifeBalanceRating: 4, careerGrowthRating: 4, managementRating: 3.5,
    cultureRating: 5, pros: ' Helpful peers ', cons: ' Slow procurement ',
    adviceToManagement: '', employmentStatus: 'current', reviewDate: '2026-01-15',
    isAnonymous: true
  };
  await assert.rejects(
    reviewService.submitReview(8, 1, { ...payload, overallRating: 5.55 }),
    (error) => error.statusCode === 400
  );
  let received;
  reviewRepository.createReview = async (input) => { received = input; return { submissionId: 12 }; };
  await reviewService.submitReview(8, '1', payload);
  assert.equal(received.roleId, null);
  assert.equal(received.reviewTitle, 'Strong team');
  assert.equal(received.isAnonymous, true);
});

test('interview validation enforces ranges and normalizes enums', async () => {
  const payload = {
    roleId: 1, interviewDate: '2026-01-10', difficultyLevel: 'medium', roundsCount: 3,
    interviewMode: 'online', resultStatus: 'offered', durationDays: 7,
    processDescription: ' Technical and behavioral rounds ', questionsSummary: '', isAnonymous: false
  };
  await assert.rejects(
    interviewService.submitInterview(8, 1, { ...payload, roundsCount: 21 }),
    (error) => error.statusCode === 400
  );
  let received;
  interviewRepository.createInterview = async (input) => { received = input; return { submissionId: 13 }; };
  await interviewService.submitInterview(8, '1', payload);
  assert.equal(received.difficultyLevel, 'MEDIUM');
  assert.equal(received.interviewMode, 'ONLINE');
  assert.equal(received.questionsSummary, null);
});

test('reports prevent duplicate submissions and enforce terminal resolution notes', async () => {
  reportRepository.createReport = async () => {
    const error = new Error('Already reported'); error.sapleCode = 'DUPLICATE_REPORT'; throw error;
  };
  await assert.rejects(
    reportService.submitReport(8, 12, { reasonCategory: 'SPAM', description: '' }),
    (error) => error.statusCode === 409
  );
  await assert.rejects(
    reportService.updateStatus(6, 3, { status: 'RESOLVED' }),
    (error) => error.statusCode === 400
  );
  let received;
  reportRepository.updateReportStatus = async (input) => { received = input; return input; };
  await reportService.updateStatus(6, 3, { status: 'dismissed', resolutionNote: ' Not a violation ' });
  assert.deepEqual(received.allowedPreviousStatuses, ['OPEN', 'REVIEWING']);
  assert.equal(received.resolutionNote, 'Not a violation');
});
