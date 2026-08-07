const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');

const userRepository = require('../repositories/user.repository');
const verificationRepository = require('../repositories/verification.repository');
const companyRepository = require('../repositories/company.repository');
const browseRepository = require('../repositories/browse.repository');
const salaryService = require('../services/salary.service');
const reviewService = require('../services/review.service');
const interviewService = require('../services/interview.service');
const authConfig = require('../config/auth');
const app = require('../app');

const originals = {
  findAuthorizationById: userRepository.findAuthorizationById,
  findActiveVerifiedEmployment: verificationRepository.findActiveVerifiedEmployment,
  findAllCompanies: companyRepository.findAllCompanies,
  findPublicSalaryInsights: browseRepository.findPublicSalaryInsights,
  findPublicReviews: browseRepository.findPublicReviews,
  findPublicInterviews: browseRepository.findPublicInterviews,
  submitSalary: salaryService.submitSalary,
  submitReview: reviewService.submitReview,
  submitInterview: interviewService.submitInterview,
  jwtSecret: process.env.JWT_SECRET
};

let server;
let baseUrl;
let token;

test.before(async () => {
  process.env.JWT_SECRET = 'route-test-secret-with-sufficient-local-entropy-only';
  userRepository.findAuthorizationById = async () => ({
    accountRole: 'USER',
    accountStatus: 'ACTIVE'
  });
  companyRepository.findAllCompanies = async () => [{ companyId: 1, companyName: 'Test Co' }];
  browseRepository.findPublicSalaryInsights = async () => [{ companyId: 1, roleId: 1 }];
  browseRepository.findPublicReviews = async () => [{ submissionId: 2, reviewTitle: 'Approved' }];
  browseRepository.findPublicInterviews = async () => [{ submissionId: 3, resultStatus: 'OFFERED' }];
  salaryService.submitSalary = async () => ({ submissionId: 10, verificationStatus: 'VERIFIED' });
  reviewService.submitReview = async () => ({ submissionId: 11, verificationStatus: 'VERIFIED' });
  interviewService.submitInterview = async () => ({ submissionId: 12, verificationStatus: 'VERIFIED' });

  token = jwt.sign({ userId: 8, role: 'USER' }, process.env.JWT_SECRET, {
    algorithm: authConfig.JWT_ALGORITHM,
    issuer: authConfig.JWT_ISSUER,
    audience: authConfig.JWT_AUDIENCE,
    expiresIn: '5m'
  });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  userRepository.findAuthorizationById = originals.findAuthorizationById;
  verificationRepository.findActiveVerifiedEmployment = originals.findActiveVerifiedEmployment;
  companyRepository.findAllCompanies = originals.findAllCompanies;
  browseRepository.findPublicSalaryInsights = originals.findPublicSalaryInsights;
  browseRepository.findPublicReviews = originals.findPublicReviews;
  browseRepository.findPublicInterviews = originals.findPublicInterviews;
  salaryService.submitSalary = originals.submitSalary;
  reviewService.submitReview = originals.submitReview;
  interviewService.submitInterview = originals.submitInterview;
  if (originals.jwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originals.jwtSecret;
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { status: response.status, body: await response.json() };
}

test('public visitor can GET public company data', async () => {
  const response = await request('/api/companies');
  assert.equal(response.status, 200);
  assert.equal(response.body.data[0].companyName, 'Test Co');
});

test('public visitor can GET approved salary insights', async () => {
  const response = await request('/api/salaries');
  assert.equal(response.status, 200);
  assert.equal(response.body.data[0].roleId, 1);
});

test('public visitor can GET approved reviews', async () => {
  const response = await request('/api/reviews');
  assert.equal(response.status, 200);
  assert.equal(response.body.data[0].reviewTitle, 'Approved');
});

test('public visitor can GET approved interviews', async () => {
  const response = await request('/api/interviews');
  assert.equal(response.status, 200);
  assert.equal(response.body.data[0].resultStatus, 'OFFERED');
});

for (const contribution of [
  { label: 'salary', path: '/api/companies/1/salaries' },
  { label: 'review', path: '/api/companies/1/reviews' },
  { label: 'interview', path: '/api/companies/1/interviews' }
]) {
  test(`normal user cannot POST ${contribution.label}`, async () => {
    verificationRepository.findActiveVerifiedEmployment = async () => null;
    const response = await request(contribution.path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.equal(response.status, 403);
    assert.equal(response.body.message, 'Employee verification is required for this company');
  });

  test(`verified employee can POST ${contribution.label}`, async () => {
    verificationRepository.findActiveVerifiedEmployment = async () => ({
      verificationId: 9,
      companyId: 1,
      employmentStatus: 'CURRENT'
    });
    const response = await request(contribution.path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.data.verificationStatus, 'VERIFIED');
  });
}
