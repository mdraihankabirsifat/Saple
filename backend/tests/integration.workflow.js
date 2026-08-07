require('dotenv').config({ quiet: true });

const assert = require('node:assert/strict');
const app = require('../app');
const database = require('../config/database');
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

    const userId = registration.body.data.user.userId;
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

    console.log('Integration workflow passed: auth, IDs, job roles, salary transaction, rollback, and GET regressions.');
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
