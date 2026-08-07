require('dotenv').config({ quiet: true });

const assert = require('node:assert/strict');
const app = require('../app');
const database = require('../config/database');
const adminRepository = require('../repositories/admin.repository');
const salaryRepository = require('../repositories/salary.repository');
const workflowTestRepository = require('../repositories/workflow-test.repository');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set when running the integration workflow');
}

const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const normalEmail = `workflow.normal.${uniqueSuffix}@example.test`;
const employeeEmail = `workflow.employee.${uniqueSuffix}@example.test`;
const password = 'Integration123';
let server;

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  const body = await response.json();
  return { status: response.status, body };
}

function salaryPayload(overrides = {}) {
  return {
    roleId: 1,
    baseSalary: 61500,
    additionalCompensation: 3500,
    currency: 'BDT',
    payPeriod: 'MONTHLY',
    yearsOfExperience: 1.5,
    employmentType: 'FULL_TIME',
    workMode: 'HYBRID',
    salaryYear: 2026,
    isAnonymous: true,
    ...overrides
  };
}

function reviewPayload(overrides = {}) {
  return {
    roleId: 1,
    reviewTitle: 'Workflow review',
    overallRating: 4.5,
    workLifeBalanceRating: 4,
    careerGrowthRating: 4.5,
    managementRating: 4,
    cultureRating: 5,
    pros: 'Supportive teammates and clear technical ownership.',
    cons: 'Procurement can take longer than expected.',
    adviceToManagement: 'Keep investing in mentorship.',
    employmentStatus: 'CURRENT',
    reviewDate: '2026-01-15',
    isAnonymous: true,
    ...overrides
  };
}

function interviewPayload(overrides = {}) {
  return {
    roleId: 1,
    interviewDate: '2026-01-12',
    difficultyLevel: 'MEDIUM',
    roundsCount: 3,
    interviewMode: 'ONLINE',
    resultStatus: 'OFFERED',
    durationDays: 8,
    processDescription: 'Screening, technical exercise, and a final behavioral discussion.',
    questionsSummary: 'Data structures, SQL joins, and API design tradeoffs.',
    isAnonymous: true,
    ...overrides
  };
}

async function main() {
  await database.initializePool();
  await workflowTestRepository.synchronizeRequiredIdentityGenerators();

  server = await new Promise((resolve) => {
    const runningServer = app.listen(0, '127.0.0.1', () => resolve(runningServer));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const health = await request(baseUrl, '/api/health');
    assert.equal(health.status, 200);
    const databaseHealth = await request(baseUrl, '/api/health/database');
    assert.equal(databaseHealth.status, 200);

    const companies = await request(baseUrl, '/api/companies');
    assert.equal(companies.status, 200);
    assert.ok(companies.body.data.length > 0);
    const search = await request(baseUrl, '/api/companies?search=software');
    assert.equal(search.status, 200);
    const company = await request(baseUrl, '/api/companies/1');
    assert.equal(company.status, 200);
    const benefits = await request(baseUrl, '/api/companies/1/benefits');
    assert.equal(benefits.status, 200);
    const salarySummary = await request(baseUrl, '/api/companies/1/salary-summary');
    assert.equal(salarySummary.status, 200);

    const invalidEmail = await request(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { fullName: 'Invalid Email', email: 'invalid', password, userType: 'NORMAL' }
    });
    assert.equal(invalidEmail.status, 400);

    const weakPassword = await request(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { fullName: 'Weak Password', email: `weak.${uniqueSuffix}@example.test`, password: 'weak', userType: 'NORMAL' }
    });
    assert.equal(weakPassword.status, 400);

    const registration = await request(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { fullName: 'Workflow Normal', email: normalEmail.toUpperCase(), password, userType: 'NORMAL' }
    });
    assert.equal(registration.status, 201);
    assert.ok(registration.body.data.user.userId > 7);
    assert.equal(registration.body.data.user.accountRole, 'USER');
    const userId = registration.body.data.user.userId;

    const employeeRegistration = await request(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Workflow Employee',
        email: employeeEmail,
        password,
        userType: 'EMPLOYEE',
        employmentStatus: 'CURRENT'
      }
    });
    assert.equal(employeeRegistration.status, 201);
    assert.ok(employeeRegistration.body.data.user.userId > 7);

    const normalDatabaseUser = await workflowTestRepository.findInternalUserByEmail(normalEmail);
    assert.notEqual(normalDatabaseUser.passwordHash, password);
    assert.match(normalDatabaseUser.passwordHash, /^\$2[aby]\$/);
    const employeeDatabaseUser = await workflowTestRepository.findInternalUserByEmail(employeeEmail);
    assert.ok(employeeDatabaseUser.employeeId > 4);
    assert.equal(employeeDatabaseUser.employmentStatus, 'CURRENT');

    const employeeLogin = await request(baseUrl, '/api/auth/login', {
      method: 'POST', body: { email: employeeEmail, password }
    });
    assert.equal(employeeLogin.status, 200);
    const employeeToken = employeeLogin.body.data.token;

    const duplicate = await request(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { fullName: 'Duplicate', email: normalEmail, password, userType: 'NORMAL' }
    });
    assert.equal(duplicate.status, 409);

    const wrongPassword = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: normalEmail, password: 'WrongPassword123' }
    });
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.body.message, 'Invalid email or password.');

    const login = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: normalEmail.toUpperCase(), password }
    });
    assert.equal(login.status, 200);
    const token = login.body.data.token;
    assert.equal(typeof token, 'string');

    const meWithoutToken = await request(baseUrl, '/api/auth/me');
    assert.equal(meWithoutToken.status, 401);
    const me = await request(baseUrl, '/api/auth/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.email, normalEmail);
    assert.equal('passwordHash' in me.body.data.user, false);

    const normalVerification = await request(baseUrl, '/api/companies/1/verifications', {
      method: 'POST', token,
      body: {
        employmentStatus: 'CURRENT', verificationMethod: 'COMPANY_EMAIL_OTP',
        companyEmail: `normal.${uniqueSuffix}@company.test`
      }
    });
    assert.equal(normalVerification.status, 403);
    const verificationRequest = await request(baseUrl, '/api/companies/1/verifications', {
      method: 'POST', token: employeeToken,
      body: {
        employmentStatus: 'CURRENT', verificationMethod: 'COMPANY_EMAIL_OTP',
        companyEmail: `employee.${uniqueSuffix}@company.test`
      }
    });
    assert.equal(verificationRequest.status, 201);
    assert.ok(verificationRequest.body.data.verificationId > 4);
    assert.equal(verificationRequest.body.data.verificationStatus, 'PENDING');

    const adminQueueWithoutToken = await request(baseUrl, '/api/admin/submissions/pending');
    assert.equal(adminQueueWithoutToken.status, 401);
    const adminQueueAsUser = await request(baseUrl, '/api/admin/submissions/pending', { token });
    assert.equal(adminQueueAsUser.status, 403);

    const roles = await request(baseUrl, '/api/job-roles');
    assert.equal(roles.status, 200);
    assert.ok(roles.body.data.some((role) => role.roleId === 1));

    const salaryWithoutToken = await request(baseUrl, '/api/companies/1/salaries', {
      method: 'POST',
      body: salaryPayload()
    });
    assert.equal(salaryWithoutToken.status, 401);
    const invalidCompany = await request(baseUrl, '/api/companies/999999999/salaries', {
      method: 'POST', token, body: salaryPayload()
    });
    assert.equal(invalidCompany.status, 404);
    const invalidRole = await request(baseUrl, '/api/companies/1/salaries', {
      method: 'POST', token, body: salaryPayload({ roleId: 999999999 })
    });
    assert.equal(invalidRole.status, 404);
    const invalidSalary = await request(baseUrl, '/api/companies/1/salaries', {
      method: 'POST', token, body: salaryPayload({ baseSalary: 0 })
    });
    assert.equal(invalidSalary.status, 400);

    const publicCountBefore = await workflowTestRepository.countCommunityContributions(1);
    const validSalary = await request(baseUrl, '/api/companies/1/salaries', {
      method: 'POST', token, body: salaryPayload()
    });
    assert.equal(validSalary.status, 201);
    assert.equal(validSalary.body.message, 'Salary submitted for review');
    assert.equal(validSalary.body.data.submissionStatus, 'PENDING');
    assert.equal(validSalary.body.data.verificationStatus, 'UNVERIFIED');
    assert.ok(validSalary.body.data.submissionId > 11);

    const pair = await workflowTestRepository.findSalaryPair(validSalary.body.data.submissionId);
    assert.equal(pair.parentSubmissionId, pair.childSubmissionId);
    assert.equal(pair.submissionStatus, 'PENDING');
    assert.equal(pair.verificationStatus, 'UNVERIFIED');
    assert.equal(pair.approvedAt, null);
    const publicCountAfter = await workflowTestRepository.countCommunityContributions(1);
    assert.equal(publicCountAfter, publicCountBefore);

    const verifiedCountBeforeApproval = await workflowTestRepository.countVerifiedContributions(1);
    await workflowTestRepository.promoteUserToAdmin(userId);
    const adminLogin = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: normalEmail, password }
    });
    assert.equal(adminLogin.status, 200);
    assert.equal(adminLogin.body.data.user.accountRole, 'ADMIN');
    const adminToken = adminLogin.body.data.token;

    const verificationQueue = await request(baseUrl, '/api/admin/verifications/pending', { token: adminToken });
    assert.equal(verificationQueue.status, 200);
    assert.ok(verificationQueue.body.data.some(
      (item) => item.verificationId === verificationRequest.body.data.verificationId
    ));
    const verificationDecision = await request(
      baseUrl,
      `/api/admin/verifications/${verificationRequest.body.data.verificationId}/status`,
      { method: 'PATCH', token: adminToken, body: { status: 'VERIFIED' } }
    );
    assert.equal(verificationDecision.status, 200);
    const verifiedRequest = await workflowTestRepository.findVerification(verificationRequest.body.data.verificationId);
    assert.equal(verifiedRequest.verificationStatus, 'VERIFIED');
    assert.equal(verifiedRequest.reviewedBy, userId);
    assert.ok(verifiedRequest.reviewedAt);
    assert.ok(verifiedRequest.expiresAt);

    const verificationQueueAsUser = await request(baseUrl, '/api/admin/verifications/pending', { token });
    assert.equal(verificationQueueAsUser.status, 403);
    const rejectedVerificationRequest = await request(baseUrl, '/api/companies/2/verifications', {
      method: 'POST', token: employeeToken,
      body: {
        employmentStatus: 'CURRENT', verificationMethod: 'COMPANY_EMAIL_OTP',
        companyEmail: `employee.${uniqueSuffix}@second-company.test`
      }
    });
    assert.equal(rejectedVerificationRequest.status, 201);
    const rejectedVerificationDecision = await request(
      baseUrl,
      `/api/admin/verifications/${rejectedVerificationRequest.body.data.verificationId}/status`,
      {
        method: 'PATCH', token: adminToken,
        body: { status: 'REJECTED', rejectionReason: 'Company relationship could not be confirmed.' }
      }
    );
    assert.equal(rejectedVerificationDecision.status, 200);
    const rejectedVerification = await workflowTestRepository.findVerification(
      rejectedVerificationRequest.body.data.verificationId
    );
    assert.equal(rejectedVerification.verificationStatus, 'REJECTED');

    const verifiedSalary = await request(baseUrl, '/api/companies/1/salaries', {
      method: 'POST', token: employeeToken, body: salaryPayload({ baseSalary: 65500 })
    });
    assert.equal(verifiedSalary.status, 201);
    assert.equal(verifiedSalary.body.data.verificationStatus, 'VERIFIED');
    const verifiedSalaryRejection = await request(
      baseUrl,
      `/api/admin/submissions/${verifiedSalary.body.data.submissionId}/status`,
      { method: 'PATCH', token: adminToken, body: { status: 'REJECTED', note: 'Keep aggregate baseline stable' } }
    );
    assert.equal(verifiedSalaryRejection.status, 200);

    const reviewsBefore = await request(baseUrl, '/api/companies/1/reviews');
    assert.equal(reviewsBefore.status, 200);
    const reviewWithoutToken = await request(baseUrl, '/api/companies/1/reviews', {
      method: 'POST', body: reviewPayload()
    });
    assert.equal(reviewWithoutToken.status, 401);
    const invalidReview = await request(baseUrl, '/api/companies/1/reviews', {
      method: 'POST', token: employeeToken, body: reviewPayload({ overallRating: 6 })
    });
    assert.equal(invalidReview.status, 400);
    const reviewSubmission = await request(baseUrl, '/api/companies/1/reviews', {
      method: 'POST', token: employeeToken, body: reviewPayload()
    });
    assert.equal(reviewSubmission.status, 201);
    assert.equal(reviewSubmission.body.data.submissionStatus, 'PENDING');
    assert.equal(reviewSubmission.body.data.verificationStatus, 'VERIFIED');
    const reviewPair = await workflowTestRepository.findReviewPair(reviewSubmission.body.data.submissionId);
    assert.equal(reviewPair.parentSubmissionId, reviewPair.childSubmissionId);
    assert.equal(reviewPair.isAnonymous, 1);
    const reviewsPending = await request(baseUrl, '/api/companies/1/reviews');
    assert.equal(reviewsPending.body.data.reviews.some(
      (item) => item.submissionId === reviewSubmission.body.data.submissionId
    ), false);

    const interviewWithoutToken = await request(baseUrl, '/api/companies/1/interviews', {
      method: 'POST', body: interviewPayload()
    });
    assert.equal(interviewWithoutToken.status, 401);
    const invalidInterview = await request(baseUrl, '/api/companies/1/interviews', {
      method: 'POST', token: adminToken, body: interviewPayload({ roundsCount: 21 })
    });
    assert.equal(invalidInterview.status, 400);
    const interviewSubmission = await request(baseUrl, '/api/companies/1/interviews', {
      method: 'POST', token: adminToken, body: interviewPayload()
    });
    assert.equal(interviewSubmission.status, 201);
    assert.equal(interviewSubmission.body.data.submissionStatus, 'PENDING');
    const interviewPair = await workflowTestRepository.findInterviewPair(interviewSubmission.body.data.submissionId);
    assert.equal(interviewPair.parentSubmissionId, interviewPair.childSubmissionId);
    assert.equal(interviewPair.isAnonymous, 1);

    for (const submissionId of [reviewSubmission.body.data.submissionId, interviewSubmission.body.data.submissionId]) {
      const approvalResult = await request(baseUrl, `/api/admin/submissions/${submissionId}/status`, {
        method: 'PATCH', token: adminToken, body: { status: 'APPROVED' }
      });
      assert.equal(approvalResult.status, 200);
    }

    const publicReviews = await request(baseUrl, '/api/companies/1/reviews');
    const publicReview = publicReviews.body.data.reviews.find(
      (item) => item.submissionId === reviewSubmission.body.data.submissionId
    );
    assert.ok(publicReview);
    assert.equal(publicReview.authorName, null);
    assert.equal('userId' in publicReview, false);
    assert.equal('email' in publicReview, false);
    assert.equal(publicReviews.body.data.summary.reviewCount, reviewsBefore.body.data.summary.reviewCount + 1);
    const publicInterviews = await request(baseUrl, '/api/companies/1/interviews');
    const publicInterview = publicInterviews.body.data.find(
      (item) => item.submissionId === interviewSubmission.body.data.submissionId
    );
    assert.ok(publicInterview);
    assert.equal(publicInterview.authorName, null);
    assert.equal('userId' in publicInterview, false);
    assert.equal('email' in publicInterview, false);

    const reportWithoutToken = await request(
      baseUrl,
      `/api/submissions/${reviewSubmission.body.data.submissionId}/reports`,
      { method: 'POST', body: { reasonCategory: 'PRIVACY', description: 'No token' } }
    );
    assert.equal(reportWithoutToken.status, 401);
    const report = await request(
      baseUrl,
      `/api/submissions/${reviewSubmission.body.data.submissionId}/reports`,
      { method: 'POST', token: adminToken, body: { reasonCategory: 'PRIVACY', description: 'Integration report' } }
    );
    assert.equal(report.status, 201);
    assert.ok(report.body.data.reportId > 2);
    const duplicateReport = await request(
      baseUrl,
      `/api/submissions/${reviewSubmission.body.data.submissionId}/reports`,
      { method: 'POST', token: adminToken, body: { reasonCategory: 'PRIVACY', description: 'Duplicate' } }
    );
    assert.equal(duplicateReport.status, 409);
    const reportsAsUser = await request(baseUrl, '/api/admin/reports', { token });
    assert.equal(reportsAsUser.status, 403);
    const reports = await request(baseUrl, '/api/admin/reports', { token: adminToken });
    assert.ok(reports.body.data.some((item) => item.reportId === report.body.data.reportId));
    const reviewing = await request(baseUrl, `/api/admin/reports/${report.body.data.reportId}/status`, {
      method: 'PATCH', token: adminToken, body: { status: 'REVIEWING' }
    });
    assert.equal(reviewing.status, 200);
    const flaggedReportedReview = await request(
      baseUrl,
      `/api/admin/submissions/${reviewSubmission.body.data.submissionId}/status`,
      { method: 'PATCH', token: adminToken, body: { status: 'FLAGGED', note: 'Privacy report confirmed' } }
    );
    assert.equal(flaggedReportedReview.status, 200);
    assert.equal(flaggedReportedReview.body.data.previousStatus, 'APPROVED');
    const reviewsAfterFlag = await request(baseUrl, '/api/companies/1/reviews');
    assert.equal(reviewsAfterFlag.body.data.reviews.some(
      (item) => item.submissionId === reviewSubmission.body.data.submissionId
    ), false);
    assert.equal(reviewsAfterFlag.body.data.summary.reviewCount, reviewsBefore.body.data.summary.reviewCount);
    const resolution = await request(baseUrl, `/api/admin/reports/${report.body.data.reportId}/status`, {
      method: 'PATCH', token: adminToken,
      body: { status: 'RESOLVED', resolutionNote: 'Flagged through audited submission moderation.' }
    });
    assert.equal(resolution.status, 200);
    const resolvedReport = await workflowTestRepository.findReport(report.body.data.reportId);
    assert.equal(resolvedReport.reportStatus, 'RESOLVED');
    assert.equal(resolvedReport.resolvedBy, userId);
    assert.ok(resolvedReport.resolvedAt);

    const dismissedReportRequest = await request(
      baseUrl,
      `/api/submissions/${interviewSubmission.body.data.submissionId}/reports`,
      { method: 'POST', token: employeeToken, body: { reasonCategory: 'OTHER', description: 'Dismissal workflow' } }
    );
    assert.equal(dismissedReportRequest.status, 201);
    const dismissal = await request(
      baseUrl,
      `/api/admin/reports/${dismissedReportRequest.body.data.reportId}/status`,
      {
        method: 'PATCH', token: adminToken,
        body: { status: 'DISMISSED', resolutionNote: 'No policy issue found.' }
      }
    );
    assert.equal(dismissal.status, 200);
    const dismissedReport = await workflowTestRepository.findReport(dismissedReportRequest.body.data.reportId);
    assert.equal(dismissedReport.reportStatus, 'DISMISSED');
    assert.equal(dismissedReport.resolvedBy, userId);
    assert.ok(dismissedReport.resolvedAt);

    const pendingQueue = await request(baseUrl, '/api/admin/submissions/pending', { token: adminToken });
    assert.equal(pendingQueue.status, 200);
    assert.ok(pendingQueue.body.data.some(
      (submission) => submission.submissionId === validSalary.body.data.submissionId
    ));

    const pendingDetail = await request(
      baseUrl,
      `/api/admin/submissions/${validSalary.body.data.submissionId}`,
      { token: adminToken }
    );
    assert.equal(pendingDetail.status, 200);
    assert.equal(pendingDetail.body.data.salary.roleId, 1);
    assert.equal('passwordHash' in pendingDetail.body.data.submitter, false);

    const emptyHistory = await request(
      baseUrl,
      `/api/admin/submissions/${validSalary.body.data.submissionId}/moderation-history`,
      { token: adminToken }
    );
    assert.equal(emptyHistory.status, 200);
    assert.deepEqual(emptyHistory.body.data, []);

    const approval = await request(
      baseUrl,
      `/api/admin/submissions/${validSalary.body.data.submissionId}/status`,
      { method: 'PATCH', token: adminToken, body: { status: 'APPROVED', note: '' } }
    );
    assert.equal(approval.status, 200);
    assert.equal(approval.body.data.previousStatus, 'PENDING');
    assert.equal(approval.body.data.submissionStatus, 'APPROVED');
    assert.ok(approval.body.data.actionId > 3);

    const approvedState = await workflowTestRepository.findModerationState(validSalary.body.data.submissionId);
    assert.equal(approvedState.submission.submissionStatus, 'APPROVED');
    assert.ok(approvedState.submission.approvedAt);
    assert.equal(approvedState.actions.length, 1);
    assert.equal(approvedState.actions[0].actionType, 'APPROVE');
    assert.equal(approvedState.actions[0].previousStatus, 'PENDING');
    assert.equal(approvedState.actions[0].newStatus, 'APPROVED');

    const queueAfterApproval = await request(baseUrl, '/api/admin/submissions/pending', { token: adminToken });
    assert.equal(queueAfterApproval.status, 200);
    assert.equal(queueAfterApproval.body.data.some(
      (submission) => submission.submissionId === validSalary.body.data.submissionId
    ), false);

    const communityCountAfterApproval = await workflowTestRepository.countCommunityContributions(1);
    const verifiedCountAfterApproval = await workflowTestRepository.countVerifiedContributions(1);
    assert.equal(communityCountAfterApproval, publicCountBefore + 1);
    assert.equal(verifiedCountAfterApproval, verifiedCountBeforeApproval);

    const repeatedDecision = await request(
      baseUrl,
      `/api/admin/submissions/${validSalary.body.data.submissionId}/status`,
      { method: 'PATCH', token: adminToken, body: { status: 'APPROVED', note: 'Repeat attempt' } }
    );
    assert.equal(repeatedDecision.status, 409);

    const rejectionSalary = await request(baseUrl, '/api/companies/1/salaries', {
      method: 'POST', token: adminToken, body: salaryPayload({ baseSalary: 62500 })
    });
    assert.equal(rejectionSalary.status, 201);
    const rejectionWithoutNote = await request(
      baseUrl,
      `/api/admin/submissions/${rejectionSalary.body.data.submissionId}/status`,
      { method: 'PATCH', token: adminToken, body: { status: 'REJECTED' } }
    );
    assert.equal(rejectionWithoutNote.status, 400);
    const rejection = await request(
      baseUrl,
      `/api/admin/submissions/${rejectionSalary.body.data.submissionId}/status`,
      { method: 'PATCH', token: adminToken, body: { status: 'REJECTED', note: 'Integration rejection' } }
    );
    assert.equal(rejection.status, 200);
    const rejectedState = await workflowTestRepository.findModerationState(rejectionSalary.body.data.submissionId);
    assert.equal(rejectedState.submission.submissionStatus, 'REJECTED');
    assert.equal(rejectedState.submission.approvedAt, null);
    assert.equal(rejectedState.actions[0].actionType, 'REJECT');

    const flaggedSalary = await request(baseUrl, '/api/companies/1/salaries', {
      method: 'POST', token: adminToken, body: salaryPayload({ baseSalary: 63500 })
    });
    assert.equal(flaggedSalary.status, 201);
    const flagging = await request(
      baseUrl,
      `/api/admin/submissions/${flaggedSalary.body.data.submissionId}/status`,
      { method: 'PATCH', token: adminToken, body: { status: 'FLAGGED', note: 'Integration flag' } }
    );
    assert.equal(flagging.status, 200);
    const flaggedState = await workflowTestRepository.findModerationState(flaggedSalary.body.data.submissionId);
    assert.equal(flaggedState.submission.submissionStatus, 'FLAGGED');
    assert.equal(flaggedState.submission.approvedAt, null);
    assert.equal(flaggedState.actions[0].actionType, 'FLAG');

    const rollbackSalary = await request(baseUrl, '/api/companies/1/salaries', {
      method: 'POST', token: adminToken, body: salaryPayload({ baseSalary: 64500 })
    });
    assert.equal(rollbackSalary.status, 201);
    await assert.rejects(adminRepository.updateSubmissionStatusWithAudit({
      submissionId: rollbackSalary.body.data.submissionId,
      moderatorUserId: userId,
      newStatus: 'APPROVED',
      actionType: 'INVALID_ACTION',
      actionNote: 'Force audit constraint failure',
      allowedPreviousStatuses: ['PENDING']
    }));
    const rolledBackState = await workflowTestRepository.findModerationState(rollbackSalary.body.data.submissionId);
    assert.equal(rolledBackState.submission.submissionStatus, 'PENDING');
    assert.equal(rolledBackState.submission.approvedAt, null);
    assert.equal(rolledBackState.actions.length, 0);

    const submissionCountBeforeFailure = await workflowTestRepository.countSubmissionsForUser(userId);
    await assert.rejects(
      salaryRepository.createSalarySubmission({
        userId,
        companyId: 1,
        roleId: 1,
        baseSalary: -1,
        additionalCompensation: null,
        currency: 'BDT',
        payPeriod: 'MONTHLY',
        yearsOfExperience: 1,
        employmentType: 'FULL_TIME',
        workMode: 'ONSITE',
        salaryYear: 2026,
        isAnonymous: true
      })
    );
    const submissionCountAfterFailure = await workflowTestRepository.countSubmissionsForUser(userId);
    assert.equal(submissionCountAfterFailure, submissionCountBeforeFailure);

    console.log('Integration workflow passed: auth, verification, review/interview publication, reporting, moderation rollback, anonymous display, salary aggregates, and GET regressions.');
  } finally {
    await workflowTestRepository.cleanupWorkflowUsers(normalEmail, employeeEmail);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await database.closePool();
  });
