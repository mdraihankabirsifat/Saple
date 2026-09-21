// Live workflow for the representative, jobs, notification and announcement
// features, against a real PostgreSQL database.
//
//   npm run test:integration:jobs
//
// Requires backend/.env with DATABASE_URL pointing at a project that already
// has the final 21-table schema (fresh install, or migrations 001-004 applied)
// plus the reference data, and a JWT_SECRET. It creates uniquely named test
// accounts, exercises the workflows through the HTTP API, and deletes every
// row it created in a finally block.
//
// Run it against a scratch or backup project first. It has not been run by the
// people who wrote it: no PostgreSQL was available while this upgrade was built.
require('dotenv').config({ quiet: true });

const assert = require('node:assert/strict');
const app = require('../app');
const database = require('../config/database');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set when running the integration workflow');
}

const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const password = 'Integration123';
const accounts = {
  seeker: { email: `jobs.seeker.${suffix}@example.test`, userType: 'NORMAL' },
  employee: { email: `jobs.employee.${suffix}@example.test`, userType: 'EMPLOYEE', employmentStatus: 'CURRENT' },
  repA: { email: `jobs.rep-a.${suffix}@example.test`, userType: 'NORMAL' },
  repB: { email: `jobs.rep-b.${suffix}@example.test`, userType: 'NORMAL' },
  adminOne: { email: `jobs.admin-one.${suffix}@example.test`, userType: 'NORMAL' },
  adminTwo: { email: `jobs.admin-two.${suffix}@example.test`, userType: 'NORMAL' }
};
const createdAnnouncementIds = [];
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
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error(`${options.method || 'GET'} ${path} returned non-JSON (${response.status})`);
  }
  return { status: response.status, body };
}

function futureDate(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function assertFinalSchema() {
  const result = await database.query(`
    SELECT
      COUNT(*) FILTER (WHERE table_type = 'BASE TABLE')::int AS tables,
      COUNT(*) FILTER (WHERE table_type = 'VIEW')::int AS views
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'company_representatives', 'representative_assignment_actions', 'job_postings',
        'job_applications', 'job_application_status_history', 'announcements',
        'notifications', 'vw_public_open_jobs'
      )
  `);
  const { tables, views } = result.rows[0];
  if (tables !== 7 || views !== 1) {
    throw new Error(
      `The database does not have the final schema (found ${tables}/7 new tables, ${views}/1 new view). `
      + 'Apply database/postgres/migrations/001-004 first.'
    );
  }
}

async function registerAndLogin(baseUrl, key) {
  const account = accounts[key];
  const registration = await request(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: {
      fullName: `Jobs Workflow ${key}`,
      email: account.email,
      password,
      userType: account.userType,
      ...(account.employmentStatus ? { employmentStatus: account.employmentStatus } : {})
    }
  });
  assert.equal(registration.status, 201, `${key} registration`);
  assert.equal(registration.body.data.user.accountRole, 'USER', 'registration never grants a privileged role');
  account.userId = registration.body.data.user.userId;
  await login(baseUrl, key);
}

async function login(baseUrl, key) {
  const account = accounts[key];
  const result = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: account.email, password }
  });
  assert.equal(result.status, 200, `${key} login`);
  account.token = result.body.data.token;
  account.role = result.body.data.user.accountRole;
}

async function cleanup() {
  const emails = Object.values(accounts).map((account) => account.email);
  const client = await database.getClient();
  try {
    await client.query('BEGIN');
    const users = await client.query('SELECT user_id FROM users WHERE email = ANY($1::text[])', [emails]);
    const ids = users.rows.map((row) => row.user_id);
    if (ids.length) {
      // Children first: every audit relationship here is ON DELETE RESTRICT.
      await client.query(`
        DELETE FROM job_application_status_history
        WHERE application_id IN (
          SELECT ja.application_id FROM job_applications ja
          JOIN job_postings jp ON jp.job_id = ja.job_id
          WHERE jp.created_by_user_id = ANY($1::bigint[]) OR ja.applicant_user_id = ANY($1::bigint[])
        )
      `, [ids]);
      await client.query(`
        DELETE FROM job_applications
        WHERE applicant_user_id = ANY($1::bigint[])
          OR job_id IN (SELECT job_id FROM job_postings WHERE created_by_user_id = ANY($1::bigint[]))
      `, [ids]);
      await client.query('DELETE FROM job_postings WHERE created_by_user_id = ANY($1::bigint[])', [ids]);
      await client.query(`
        DELETE FROM representative_assignment_actions
        WHERE assignment_id IN (SELECT assignment_id FROM company_representatives WHERE user_id = ANY($1::bigint[]))
      `, [ids]);
      await client.query('DELETE FROM company_representatives WHERE user_id = ANY($1::bigint[])', [ids]);
      await client.query('DELETE FROM announcements WHERE created_by = ANY($1::bigint[])', [ids]);
      await client.query(`
        DELETE FROM employment_verifications
        WHERE employee_id IN (SELECT employee_id FROM employees WHERE user_id = ANY($1::bigint[]))
          OR reviewed_by = ANY($1::bigint[])
      `, [ids]);
      // Notifications and employee profiles cascade from users.
      await client.query('DELETE FROM users WHERE user_id = ANY($1::bigint[])', [ids]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  await database.initializePool();
  await assertFinalSchema();

  server = await new Promise((resolve) => {
    const running = app.listen(0, '127.0.0.1', () => resolve(running));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // -----------------------------------------------------------------------
    // Accounts. Two administrators, promoted in SQL, prove nothing assumes one.
    // -----------------------------------------------------------------------
    for (const key of Object.keys(accounts)) await registerAndLogin(baseUrl, key);

    await database.query(`
      UPDATE users SET account_role = 'ADMIN', token_version = token_version + 1
      WHERE email = ANY($1::text[])
    `, [[accounts.adminOne.email, accounts.adminTwo.email]]);
    await login(baseUrl, 'adminOne');
    await login(baseUrl, 'adminTwo');
    assert.equal(accounts.adminOne.role, 'ADMIN');
    assert.equal(accounts.adminTwo.role, 'ADMIN');

    const companies = await request(baseUrl, '/api/companies');
    assert.equal(companies.status, 200);
    assert.ok(companies.body.data.length >= 2, 'at least two companies are needed');
    const companyA = companies.body.data[0].companyId;
    const companyB = companies.body.data[1].companyId;

    // -----------------------------------------------------------------------
    // Representative requests, approval by two different administrators.
    // -----------------------------------------------------------------------
    const requestA = await request(baseUrl, '/api/me/representative-assignments', {
      method: 'POST', token: accounts.repA.token,
      body: { companyId: companyA, jobTitle: 'People Lead', requestNote: 'Integration workflow request for company A.' }
    });
    assert.equal(requestA.status, 201);
    assert.equal(requestA.body.data.assignmentStatus, 'PENDING');

    const duplicate = await request(baseUrl, '/api/me/representative-assignments', {
      method: 'POST', token: accounts.repA.token,
      body: { companyId: companyA, requestNote: 'A second open request for the same company.' }
    });
    assert.equal(duplicate.status, 409, 'one open scope per account and company');

    const requestB = await request(baseUrl, '/api/me/representative-assignments', {
      method: 'POST', token: accounts.repB.token,
      body: { companyId: companyB, requestNote: 'Integration workflow request for company B.' }
    });
    assert.equal(requestB.status, 201);

    const pendingOnlyWorkspace = await request(baseUrl, '/api/representative/workspace', { token: accounts.repA.token });
    assert.equal(pendingOnlyWorkspace.status, 403, 'a pending request grants nothing');

    const approveA = await request(baseUrl, `/api/admin/representative-assignments/${requestA.body.data.assignmentId}/decision`, {
      method: 'PATCH', token: accounts.adminOne.token, body: { action: 'APPROVE', note: 'Confirmed in workflow.' }
    });
    assert.equal(approveA.status, 200);
    assert.equal(approveA.body.data.assignmentStatus, 'ACTIVE');

    const approveB = await request(baseUrl, `/api/admin/representative-assignments/${requestB.body.data.assignmentId}/decision`, {
      method: 'PATCH', token: accounts.adminTwo.token, body: { action: 'APPROVE' }
    });
    assert.equal(approveB.status, 200);

    // Approval bumps the token version, so the old session must re-authenticate.
    const staleToken = await request(baseUrl, '/api/representative/workspace', { token: accounts.repA.token });
    assert.equal(staleToken.status, 401);
    await login(baseUrl, 'repA');
    await login(baseUrl, 'repB');
    assert.equal(accounts.repA.role, 'COMPANY_REPRESENTATIVE');

    const workspace = await request(baseUrl, '/api/representative/workspace', { token: accounts.repA.token });
    assert.equal(workspace.status, 200);
    assert.deepEqual(workspace.body.data.scopes.map((scope) => scope.companyId), [companyA]);

    const history = await request(baseUrl, `/api/admin/representative-assignments/${requestA.body.data.assignmentId}/history`, {
      token: accounts.adminTwo.token
    });
    assert.equal(history.status, 200);
    assert.deepEqual(history.body.data.map((entry) => entry.actionType), ['REQUEST', 'APPROVE']);

    // -----------------------------------------------------------------------
    // Employment verification routed to the company's representative.
    // -----------------------------------------------------------------------
    const verification = await request(baseUrl, `/api/companies/${companyA}/verifications`, {
      method: 'POST', token: accounts.employee.token,
      body: { roleId: 1, employmentStatus: 'CURRENT', verificationMethod: 'COMPANY_EMAIL_OTP', companyEmail: `employee.${suffix}@example.test` }
    });
    assert.equal(verification.status, 201);
    const verificationId = verification.body.data.verificationId;

    const otherCompanyDecision = await request(baseUrl, `/api/representative/verifications/${verificationId}/status`, {
      method: 'PATCH', token: accounts.repB.token, body: { status: 'VERIFIED' }
    });
    assert.equal(otherCompanyDecision.status, 403, 'representative B cannot decide company A');

    const queue = await request(baseUrl, '/api/representative/verifications?status=PENDING', { token: accounts.repB.token });
    assert.equal(queue.status, 200);
    assert.equal(queue.body.data.items.some((item) => item.verificationId === verificationId), false);

    const decision = await request(baseUrl, `/api/representative/verifications/${verificationId}/status`, {
      method: 'PATCH', token: accounts.repA.token, body: { status: 'VERIFIED' }
    });
    assert.equal(decision.status, 200);

    const employeeNotifications = await request(baseUrl, '/api/me/notifications', { token: accounts.employee.token });
    assert.ok(employeeNotifications.body.data.items.some((item) => item.notificationType === 'VERIFICATION_DECISION'));

    // -----------------------------------------------------------------------
    // Jobs: scope, visibility, lifecycle.
    // -----------------------------------------------------------------------
    const jobBody = {
      title: `Workflow Engineer ${suffix}`,
      description: 'Integration workflow vacancy used to exercise the job lifecycle end to end.',
      location: 'Dhaka',
      employmentType: 'FULL_TIME',
      workMode: 'HYBRID',
      salaryMin: '50000',
      salaryMax: '80000',
      salaryPeriod: 'MONTHLY',
      applicationDeadline: futureDate(30)
    };

    const crossCompany = await request(baseUrl, `/api/representative/companies/${companyB}/jobs`, {
      method: 'POST', token: accounts.repA.token, body: { ...jobBody, jobStatus: 'PUBLISHED' }
    });
    assert.equal(crossCompany.status, 403, 'representative A cannot post for company B');

    const draft = await request(baseUrl, `/api/representative/companies/${companyA}/jobs`, {
      method: 'POST', token: accounts.repA.token, body: { ...jobBody, title: `Draft ${suffix}` }
    });
    assert.equal(draft.status, 201);
    assert.equal(draft.body.data.jobStatus, 'DRAFT');
    const hiddenDraft = await request(baseUrl, `/api/jobs/${draft.body.data.jobId}`);
    assert.equal(hiddenDraft.status, 404, 'drafts are never public');

    const published = await request(baseUrl, `/api/representative/companies/${companyA}/jobs`, {
      method: 'POST', token: accounts.repA.token, body: { ...jobBody, jobStatus: 'PUBLISHED' }
    });
    assert.equal(published.status, 201);
    const jobId = published.body.data.jobId;

    const publicJob = await request(baseUrl, `/api/jobs/${jobId}`);
    assert.equal(publicJob.status, 200);
    assert.equal(publicJob.body.data.salaryMin, 50000);
    const search = await request(baseUrl, `/api/jobs?search=${encodeURIComponent(suffix)}`);
    assert.ok(search.body.data.items.some((item) => item.jobId === jobId));
    assert.equal(search.body.data.items.some((item) => item.jobId === draft.body.data.jobId), false);

    const overview = await request(baseUrl, '/api/stats/overview');
    assert.equal(overview.status, 200);
    assert.ok(overview.body.data.openJobCount >= 1);

    // -----------------------------------------------------------------------
    // Applications: once only, scoped reads, history, notifications.
    // -----------------------------------------------------------------------
    const repCannotApply = await request(baseUrl, `/api/jobs/${jobId}/applications`, {
      method: 'POST', token: accounts.repB.token, body: { coverLetter: 'Representatives do not apply through Saple.' }
    });
    assert.equal(repCannotApply.status, 403);

    const application = await request(baseUrl, `/api/jobs/${jobId}/applications`, {
      method: 'POST', token: accounts.seeker.token,
      body: { coverLetter: 'Integration workflow application describing relevant coursework.' }
    });
    assert.equal(application.status, 201);
    const applicationId = application.body.data.applicationId;

    const again = await request(baseUrl, `/api/jobs/${jobId}/applications`, {
      method: 'POST', token: accounts.seeker.token,
      body: { coverLetter: 'A second application to the same vacancy must be refused.' }
    });
    assert.equal(again.status, 409);

    const repBRead = await request(baseUrl, `/api/representative/applications/${applicationId}`, { token: accounts.repB.token });
    assert.equal(repBRead.status, 403, 'representative B cannot read company A applications');
    const otherApplicant = await request(baseUrl, `/api/me/applications/${applicationId}`, { token: accounts.employee.token });
    assert.equal(otherApplicant.status, 403, 'applicant B cannot read applicant A');

    const received = await request(baseUrl, '/api/me/notifications', { token: accounts.repA.token });
    assert.ok(received.body.data.items.some((item) => item.notificationType === 'APPLICATION_RECEIVED'));

    const underReview = await request(baseUrl, `/api/representative/applications/${applicationId}/status`, {
      method: 'PATCH', token: accounts.repA.token, body: { applicationStatus: 'UNDER_REVIEW', note: 'Screening.' }
    });
    assert.equal(underReview.status, 200);

    const unread = await request(baseUrl, '/api/me/notifications/unread-count', { token: accounts.seeker.token });
    assert.ok(unread.body.data.unreadCount >= 2, 'submitted and under-review notices');
    const readAll = await request(baseUrl, '/api/me/notifications/read-all', { method: 'PATCH', token: accounts.seeker.token });
    assert.equal(readAll.status, 200);
    const afterRead = await request(baseUrl, '/api/me/notifications/unread-count', { token: accounts.seeker.token });
    assert.equal(afterRead.body.data.unreadCount, 0);

    const withdraw = await request(baseUrl, `/api/me/applications/${applicationId}/withdraw`, {
      method: 'PATCH', token: accounts.seeker.token
    });
    assert.equal(withdraw.status, 200);
    const reviewAfterWithdraw = await request(baseUrl, `/api/representative/applications/${applicationId}/status`, {
      method: 'PATCH', token: accounts.repA.token, body: { applicationStatus: 'SHORTLISTED' }
    });
    assert.equal(reviewAfterWithdraw.status, 409, 'WITHDRAWN is terminal');

    const own = await request(baseUrl, `/api/me/applications/${applicationId}`, { token: accounts.seeker.token });
    assert.deepEqual(own.body.data.history.map((entry) => entry.newStatus), ['SUBMITTED', 'UNDER_REVIEW', 'WITHDRAWN']);

    const close = await request(baseUrl, `/api/representative/jobs/${jobId}/status`, {
      method: 'PATCH', token: accounts.repA.token, body: { jobStatus: 'CLOSED' }
    });
    assert.equal(close.status, 200);
    const closedPublic = await request(baseUrl, `/api/jobs/${jobId}`);
    assert.equal(closedPublic.status, 404, 'closed vacancies leave the public board');
    const stillThere = await request(baseUrl, `/api/me/applications/${applicationId}`, { token: accounts.seeker.token });
    assert.equal(stillThere.status, 200, 'closing keeps every application');

    const adminOversight = await request(baseUrl, `/api/admin/jobs?search=${encodeURIComponent(suffix)}`, { token: accounts.adminTwo.token });
    assert.equal(adminOversight.status, 200);
    assert.ok(adminOversight.body.data.items.length >= 2, 'admins see drafts and closed jobs too');

    // -----------------------------------------------------------------------
    // Announcements.
    // -----------------------------------------------------------------------
    const markup = await request(baseUrl, '/api/admin/announcements', {
      method: 'POST', token: accounts.adminOne.token,
      body: { title: '<b>bold</b>', message: 'This announcement must be rejected for markup.' }
    });
    assert.equal(markup.status, 400);

    const announcement = await request(baseUrl, '/api/admin/announcements', {
      method: 'POST', token: accounts.adminOne.token,
      body: { title: `Workflow notice ${suffix}`, message: 'Integration workflow announcement, removed at the end.', severity: 'INFO' }
    });
    assert.equal(announcement.status, 201);
    createdAnnouncementIds.push(announcement.body.data.announcementId);
    const visible = await request(baseUrl, '/api/announcements');
    assert.ok(visible.body.data.some((item) => item.announcementId === announcement.body.data.announcementId));

    const hide = await request(baseUrl, `/api/admin/announcements/${announcement.body.data.announcementId}/active`, {
      method: 'PATCH', token: accounts.adminTwo.token, body: { isActive: false }
    });
    assert.equal(hide.status, 200);
    const hidden = await request(baseUrl, '/api/announcements');
    assert.equal(hidden.body.data.some((item) => item.announcementId === announcement.body.data.announcementId), false);

    // -----------------------------------------------------------------------
    // Revocation closes access on the next request.
    // -----------------------------------------------------------------------
    const tokenBeforeRevoke = accounts.repA.token;
    const revoke = await request(baseUrl, `/api/admin/representative-assignments/${requestA.body.data.assignmentId}/decision`, {
      method: 'PATCH', token: accounts.adminTwo.token, body: { action: 'REVOKE', note: 'Workflow revocation.' }
    });
    assert.equal(revoke.status, 200);
    assert.equal(revoke.body.data.activeScopeCount, 0);

    const afterRevoke = await request(baseUrl, '/api/representative/jobs', { token: tokenBeforeRevoke });
    assert.ok([401, 403].includes(afterRevoke.status), 'the revoked session lost access');
    await login(baseUrl, 'repA');
    assert.equal(accounts.repA.role, 'USER', 'the last revoked scope removes the role');

    console.log('Jobs and representatives integration workflow passed.');
  } finally {
    await cleanup();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await database.closePool();
  });
