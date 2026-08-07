const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../config/database');
const reviewRepository = require('../repositories/review.repository');
const interviewRepository = require('../repositories/interview.repository');
const reportRepository = require('../repositories/report.repository');
const verificationRepository = require('../repositories/verification.repository');

const originalGetConnection = database.getConnection;
test.afterEach(() => { database.getConnection = originalGetConnection; });

function mockConnection(execute) {
  const state = { commits: 0, rollbacks: 0, closes: 0 };
  return {
    state,
    execute,
    commit: async () => { state.commits += 1; },
    rollback: async () => { state.rollbacks += 1; },
    close: async () => { state.closes += 1; }
  };
}

function reviewInput() {
  return {
    userId: 8, companyId: 1, roleId: null, reviewTitle: 'Title', overallRating: 4,
    workLifeBalanceRating: 4, careerGrowthRating: 4, managementRating: 4,
    cultureRating: 4, pros: 'Pros', cons: 'Cons', adviceToManagement: null,
    employmentStatus: 'CURRENT', reviewDate: new Date('2026-01-01'), isAnonymous: true
  };
}

test('review child-insert failure rolls back the parent submission', async () => {
  let execution = 0;
  const connection = mockConnection(async () => {
    execution += 1;
    if (execution === 1) return { rows: [{ employeeId: 5, employmentStatus: 'CURRENT' }] };
    if (execution === 2) return { rows: [{ companyId: 1 }] };
    if (execution === 3) return { rows: [{ verificationId: 9 }] };
    if (execution === 4) return { outBinds: { submissionId: [12] } };
    throw new Error('child insert failed');
  });
  database.getConnection = async () => connection;
  await assert.rejects(reviewRepository.createReview(reviewInput()), /child insert failed/);
  assert.deepEqual(connection.state, { commits: 0, rollbacks: 1, closes: 1 });
});

test('interview child-insert failure rolls back the parent submission', async () => {
  let execution = 0;
  const connection = mockConnection(async () => {
    execution += 1;
    if (execution === 1) return { rows: [{ accountStatus: 'ACTIVE', employeeId: 5 }] };
    if (execution === 2) return { rows: [{ companyId: 1 }] };
    if (execution === 3) return { rows: [{ roleId: 1 }] };
    if (execution === 4) return { rows: [{ verificationId: 9 }] };
    if (execution === 5) return { outBinds: { submissionId: [13] } };
    throw new Error('child insert failed');
  });
  database.getConnection = async () => connection;
  await assert.rejects(interviewRepository.createInterview({
    userId: 8, companyId: 1, roleId: 1, interviewDate: new Date('2026-01-01'),
    difficultyLevel: 'MEDIUM', roundsCount: 3, interviewMode: 'ONLINE',
    resultStatus: 'OFFERED', durationDays: 7, processDescription: 'Process',
    questionsSummary: null, isAnonymous: false
  }), /child insert failed/);
  assert.deepEqual(connection.state, { commits: 0, rollbacks: 1, closes: 1 });
});

test('verification and report decisions roll back when their update fails', async () => {
  for (const operation of [
    () => verificationRepository.decideVerification({ verificationId: 5, reviewerUserId: 6, status: 'VERIFIED', rejectionReason: null }),
    () => reportRepository.updateReportStatus({ reportId: 3, resolverUserId: 6, status: 'RESOLVED', resolutionNote: 'Done', allowedPreviousStatuses: ['OPEN'] })
  ]) {
    let execution = 0;
    const connection = mockConnection(async () => {
      execution += 1;
      if (execution === 1) return { rows: [{ verificationStatus: 'PENDING', reportStatus: 'OPEN' }] };
      throw new Error('update failed');
    });
    database.getConnection = async () => connection;
    await assert.rejects(operation(), /update failed/);
    assert.deepEqual(connection.state, { commits: 0, rollbacks: 1, closes: 1 });
  }
});
