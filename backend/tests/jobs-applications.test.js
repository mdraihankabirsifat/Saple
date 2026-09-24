const test = require('node:test');
const assert = require('node:assert/strict');

const database = require('../config/database');
const jobRepository = require('../repositories/job.repository');
const applicationRepository = require('../repositories/application.repository');
const jobService = require('../services/job.service');
const applicationService = require('../services/application.service');

const originalGetClient = database.getClient;
const originals = {
  createJob: jobRepository.createJob,
  changeJobStatus: jobRepository.changeJobStatus,
  findPublicJobs: jobRepository.findPublicJobs,
  countPublicJobs: jobRepository.countPublicJobs,
  findPublicJobById: jobRepository.findPublicJobById,
  findJobScope: jobRepository.findJobScope,
  createApplication: applicationRepository.createApplication,
  changeApplicationStatus: applicationRepository.changeApplicationStatus,
  findApplicationScope: applicationRepository.findApplicationScope
};

test.afterEach(() => {
  database.getClient = originalGetClient;
  Object.assign(jobRepository, {
    createJob: originals.createJob,
    changeJobStatus: originals.changeJobStatus,
    findPublicJobs: originals.findPublicJobs,
    countPublicJobs: originals.countPublicJobs,
    findPublicJobById: originals.findPublicJobById,
    findJobScope: originals.findJobScope
  });
  Object.assign(applicationRepository, {
    createApplication: originals.createApplication,
    changeApplicationStatus: originals.changeApplicationStatus,
    findApplicationScope: originals.findApplicationScope
  });
});

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

const REPRESENTATIVE = {
  userId: 30,
  role: 'COMPANY_REPRESENTATIVE',
  representativeCompanyIds: [1],
  representativeScopes: [{ assignmentId: 7, companyId: 1 }]
};

function futureDate(days = 30) {
  const date = new Date(Date.now() + days * 86400000);
  return date.toISOString().slice(0, 10);
}

function validJob(overrides = {}) {
  return {
    title: 'Backend Engineer',
    description: 'Build and maintain the services behind the Saple demonstration platform.',
    location: 'Dhaka',
    employmentType: 'FULL_TIME',
    workMode: 'HYBRID',
    applicationDeadline: futureDate(),
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Public visibility
// ---------------------------------------------------------------------------

test('public job reads go through the published-jobs view and never the base table', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'repositories', 'job.repository.js'),
    'utf8'
  );
  const publicSection = source.slice(0, source.indexOf('const MANAGED_JOB_SELECT'));

  assert.match(publicSection, /FROM vw_public_open_jobs/);
  assert.doesNotMatch(publicSection, /FROM job_postings/);
  // The view itself is what filters status and deadline, in SQL.
  const schema = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', '..', 'database', 'postgres', '01_final_schema_postgres.sql'),
    'utf8'
  );
  assert.match(schema, /CREATE OR REPLACE VIEW vw_public_open_jobs[\s\S]*?job_status = 'PUBLISHED'[\s\S]*?application_deadline >= CURRENT_DATE/);
});

test('a job that is not publicly visible is reported as missing, not as forbidden', async () => {
  jobRepository.findPublicJobById = async () => null;

  await assert.rejects(
    jobService.getPublicJob('7'),
    (error) => error.statusCode === 404 && error.message === 'Job posting not found'
  );
});

test('public job filters are validated before they reach SQL', async () => {
  let captured;
  jobRepository.findPublicJobs = async (filters) => { captured = filters; return []; };
  jobRepository.countPublicJobs = async () => 0;

  await jobService.listPublicJobs({
    companyId: '3', roleId: '4', location: '  Dhaka  ', workMode: 'remote',
    employmentType: 'full_time', search: 'engineer', page: '2', pageSize: '5'
  });
  assert.deepEqual(captured, {
    companyId: 3, roleId: 4, location: 'Dhaka',
    workMode: 'REMOTE', employmentType: 'FULL_TIME', search: 'engineer'
  });

  for (const query of [{ workMode: 'ANYWHERE' }, { employmentType: 'SLAVERY' }, { companyId: 'abc' }]) {
    await assert.rejects(jobService.listPublicJobs(query), (error) => error.statusCode === 400);
  }
});

test('public job sort is a whitelisted name that never reaches SQL as text', async () => {
  const seen = [];
  jobRepository.findPublicJobs = async (filters, options) => { seen.push(options.sort); return []; };
  jobRepository.countPublicJobs = async () => 0;

  await jobService.listPublicJobs({});
  await jobService.listPublicJobs({ sort: 'deadline' });
  await jobService.listPublicJobs({ sort: 'Company' });
  assert.deepEqual(seen, ['NEWEST', 'DEADLINE', 'COMPANY']);

  for (const sort of ['salary', 'published_at; DROP TABLE job_postings', 'NEWEST DESC']) {
    await assert.rejects(jobService.listPublicJobs({ sort }), (error) => error.statusCode === 400);
  }

  const source = require('node:fs').readFileSync(require.resolve('../repositories/job.repository'), 'utf8');
  assert.match(source, /PUBLIC_JOB_ORDER[sort] || PUBLIC_JOB_ORDER.NEWEST/);
});

// ---------------------------------------------------------------------------
// Creation and validation
// ---------------------------------------------------------------------------

test('creating a job takes its company and assignment from the proven scope', async () => {
  let captured;
  jobRepository.createJob = async (input) => { captured = input; return { jobId: 5, jobStatus: 'DRAFT' }; };

  // A body that tries to name a different company is simply ignored: the URL
  // company is the one that was checked.
  await jobService.createJob(REPRESENTATIVE, '1', { ...validJob(), companyId: 2, createdByUserId: 999 });

  assert.equal(captured.companyId, 1);
  assert.equal(captured.createdByUserId, REPRESENTATIVE.userId);
  assert.equal(captured.assignmentId, 7);
  assert.equal(captured.jobStatus, 'DRAFT');
});

test('a job cannot be created with an invalid salary range, a past deadline or blank content', async () => {
  jobRepository.createJob = async () => ({ jobId: 1, jobStatus: 'DRAFT' });

  const invalid = [
    [{ salaryMin: '90000' }, /both a minimum and a maximum/],
    [{ salaryMin: '90000', salaryMax: '50000' }, /must not be lower/],
    [{ salaryMin: '0', salaryMax: '10' }, /positive amount/],
    [{ applicationDeadline: '2020-01-01' }, /must not be in the past/],
    [{ applicationDeadline: '2026-02-31' }, /not a real calendar date/],
    [{ title: '   ' }, /Job title must be between/],
    [{ description: 'too short' }, /Job description must be between/],
    [{ workMode: 'ANY' }, /Work mode must be one of/]
  ];

  for (const [overrides, pattern] of invalid) {
    await assert.rejects(
      jobService.createJob(REPRESENTATIVE, '1', validJob(overrides)),
      (error) => error.statusCode === 400 && pattern.test(error.message),
      JSON.stringify(overrides)
    );
  }
});

test('a complete salary range is normalised together with its currency and period', async () => {
  let captured;
  jobRepository.createJob = async (input) => { captured = input; return { jobId: 5, jobStatus: 'PUBLISHED' }; };

  await jobService.createJob(REPRESENTATIVE, '1', validJob({
    salaryMin: '60000', salaryMax: '95000.50', salaryPeriod: 'yearly',
    salaryCurrency: 'bdt', jobStatus: 'PUBLISHED'
  }));

  assert.equal(captured.salaryMin, 60000);
  assert.equal(captured.salaryMax, 95000.5);
  assert.equal(captured.salaryCurrency, 'BDT');
  assert.equal(captured.salaryPeriod, 'YEARLY');
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test('job status transitions are one-way and closure keeps applications', async () => {
  assert.deepEqual(jobService.STATUS_TRANSITIONS.PUBLISHED, ['DRAFT']);
  assert.deepEqual(jobService.STATUS_TRANSITIONS.CLOSED, ['PUBLISHED']);
  assert.deepEqual(jobService.STATUS_TRANSITIONS.ARCHIVED, ['CLOSED']);
  assert.deepEqual(jobService.STATUS_TRANSITIONS.DRAFT, []);

  let captured;
  jobRepository.findJobScope = async () => ({ jobId: 11, companyId: 1, jobStatus: 'PUBLISHED' });
  jobRepository.changeJobStatus = async (input) => { captured = input; return input; };

  await jobService.changeJobStatus(REPRESENTATIVE, '11', { jobStatus: 'CLOSED' });
  assert.deepEqual(captured.allowedPreviousStatuses, ['PUBLISHED']);

  // Reopening and un-publishing are not offered at all.
  for (const jobStatus of ['DRAFT', 'PENDING', '']) {
    await assert.rejects(
      jobService.changeJobStatus(REPRESENTATIVE, '11', { jobStatus }),
      (error) => error.statusCode === 400
    );
  }

  const repositorySource = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'repositories', 'job.repository.js'),
    'utf8'
  );
  // Nothing in the closure path deletes an application or a history row.
  assert.doesNotMatch(repositorySource, /DELETE FROM job_applications|DELETE FROM job_application_status_history/);
});

test('closing a job notifies every open applicant inside the same transaction', async () => {
  const statements = [];
  const client = mockClient(async (sql) => {
    statements.push(sql);
    if (statements.length === 1) {
      return { rows: [{ jobId: 11, jobStatus: 'PUBLISHED', title: 'Engineer', companyName: 'Alpha' }] };
    }
    if (/UPDATE job_postings/.test(sql)) return { rowCount: 1, rows: [] };
    if (/SELECT application_id/.test(sql)) {
      return { rows: [{ applicationId: 1, applicantUserId: 5 }, { applicationId: 2, applicantUserId: 6 }] };
    }
    return { rows: [{ notificationId: 1 }] };
  });
  database.getClient = async () => client;

  const result = await jobRepository.changeJobStatus({
    jobId: 11, actorUserId: 30, newStatus: 'CLOSED', allowedPreviousStatuses: ['PUBLISHED']
  });

  assert.equal(result.notifiedApplicantCount, 2);
  assert.equal(statements.filter((sql) => /INSERT INTO notifications/.test(sql)).length, 2);
  assert.deepEqual(client.state, { commits: 1, rollbacks: 0, releases: 1 });
});

test('a failure while notifying applicants rolls the closure back entirely', async () => {
  let execution = 0;
  const client = mockClient(async (sql) => {
    execution += 1;
    if (execution === 1) {
      return { rows: [{ jobId: 11, jobStatus: 'PUBLISHED', title: 'Engineer', companyName: 'Alpha' }] };
    }
    if (execution === 2) return { rowCount: 1, rows: [] };
    if (execution === 3) return { rows: [{ applicationId: 1, applicantUserId: 5 }] };
    throw new Error('notification insert failed');
  });
  database.getClient = async () => client;

  await assert.rejects(jobRepository.changeJobStatus({
    jobId: 11, actorUserId: 30, newStatus: 'CLOSED', allowedPreviousStatuses: ['PUBLISHED']
  }), /notification insert failed/);
  assert.deepEqual(client.state, { commits: 0, rollbacks: 1, releases: 1 });
});

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

test('only a job-seeker account may apply, and the applicant comes from the token', async () => {
  let captured;
  applicationRepository.createApplication = async (input) => {
    captured = input;
    return { applicationId: 3, applicationStatus: 'SUBMITTED' };
  };

  const applicant = { userId: 42, role: 'USER' };
  await applicationService.applyToJob(applicant, '11', {
    coverLetter: 'I have built small services during coursework and want to learn more.',
    applicantUserId: 999
  });
  assert.equal(captured.applicantUserId, 42);

  for (const role of ['ADMIN', 'COMPANY_REPRESENTATIVE']) {
    await assert.rejects(
      applicationService.applyToJob({ userId: 1, role }, '11', { coverLetter: 'x'.repeat(50) }),
      (error) => error.statusCode === 403
    );
  }
});

test('an application statement is length-checked before any database work', async () => {
  let calls = 0;
  applicationRepository.createApplication = async () => { calls += 1; return {}; };

  for (const coverLetter of ['', 'too short', 'x'.repeat(4001)]) {
    await assert.rejects(
      applicationService.applyToJob({ userId: 42, role: 'USER' }, '11', { coverLetter }),
      (error) => error.statusCode === 400
    );
  }
  assert.equal(calls, 0);
});

test('a duplicate application is refused by the unique constraint, not by a pre-check race', async () => {
  const statements = [];
  const client = mockClient(async (sql) => {
    statements.push(sql);
    if (/FROM job_postings/.test(sql)) {
      return { rows: [{ jobId: 11, jobStatus: 'PUBLISHED', title: 'Engineer', companyId: 1, companyName: 'Alpha', isExpired: false }] };
    }
    if (/FROM users/.test(sql)) return { rows: [{ accountRole: 'USER', accountStatus: 'ACTIVE' }] };
    if (/INSERT INTO job_applications/.test(sql)) {
      const error = new Error('duplicate key value violates unique constraint');
      error.code = '23505';
      throw error;
    }
    return { rows: [] };
  });
  database.getClient = async () => client;

  await assert.rejects(
    applicationRepository.createApplication({ jobId: 11, applicantUserId: 5, coverLetter: 'x'.repeat(60) }),
    (error) => error.sapleCode === 'DUPLICATE_APPLICATION'
  );
  assert.deepEqual(client.state, { commits: 0, rollbacks: 1, releases: 1 });
});

test('a closed or expired vacancy refuses applications inside the transaction', async () => {
  for (const [job, code] of [
    [{ jobStatus: 'CLOSED', isExpired: false }, 'JOB_NOT_OPEN'],
    [{ jobStatus: 'DRAFT', isExpired: false }, 'JOB_NOT_OPEN'],
    [{ jobStatus: 'PUBLISHED', isExpired: true }, 'JOB_EXPIRED']
  ]) {
    const client = mockClient(async (sql) => {
      if (/FROM job_postings/.test(sql)) {
        return { rows: [{ jobId: 11, title: 'Engineer', companyId: 1, companyName: 'Alpha', ...job }] };
      }
      return { rows: [] };
    });
    database.getClient = async () => client;

    await assert.rejects(
      applicationRepository.createApplication({ jobId: 11, applicantUserId: 5, coverLetter: 'x'.repeat(60) }),
      (error) => error.sapleCode === code
    );
    assert.deepEqual(client.state, { commits: 0, rollbacks: 1, releases: 1 });
  }
});

test('application status transitions refuse terminal states and require a reason', async () => {
  applicationRepository.findApplicationScope = async () => ({
    applicationId: 101, jobId: 11, applicantUserId: 5, applicationStatus: 'SUBMITTED', companyId: 1
  });
  let captured;
  applicationRepository.changeApplicationStatus = async (input) => { captured = input; return input; };

  await applicationService.decideApplication(REPRESENTATIVE, '101', { applicationStatus: 'UNDER_REVIEW' });
  assert.deepEqual(captured.allowedPreviousStatuses, ['SUBMITTED']);
  assert.equal(captured.isReviewerDecision, true);

  // Terminal states cannot be a starting point, and WITHDRAWN is never a
  // reviewer decision.
  assert.equal(applicationService.REVIEWER_TRANSITIONS.WITHDRAWN, undefined);
  for (const transitions of Object.values(applicationService.REVIEWER_TRANSITIONS)) {
    assert.equal(transitions.includes('REJECTED'), false);
    assert.equal(transitions.includes('ACCEPTED'), false);
    assert.equal(transitions.includes('WITHDRAWN'), false);
  }

  for (const applicationStatus of ['ACCEPTED', 'REJECTED']) {
    await assert.rejects(
      applicationService.decideApplication(REPRESENTATIVE, '101', { applicationStatus }),
      (error) => error.statusCode === 400 && /Decision note/.test(error.message)
    );
  }
});

test('an applicant may only withdraw their own application, and only while it is open', async () => {
  applicationRepository.findApplicationScope = async () => ({
    applicationId: 101, jobId: 11, applicantUserId: 5, applicationStatus: 'SUBMITTED', companyId: 1
  });
  let captured;
  applicationRepository.changeApplicationStatus = async (input) => { captured = input; return input; };

  await applicationService.withdrawOwnApplication({ userId: 5, role: 'USER' }, '101');
  assert.equal(captured.newStatus, 'WITHDRAWN');
  assert.equal(captured.isReviewerDecision, false);
  assert.deepEqual(captured.allowedPreviousStatuses, ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED']);

  await assert.rejects(
    applicationService.withdrawOwnApplication({ userId: 6, role: 'USER' }, '101'),
    (error) => error.statusCode === 403
  );
});

test('applicant A cannot read applicant B application', async () => {
  const { findApplicationById } = applicationRepository;
  applicationRepository.findApplicationById = async () => ({
    applicationId: 101, applicantUserId: 5, jobTitle: 'Engineer'
  });

  try {
    await assert.rejects(
      applicationService.getOwnApplication({ userId: 6, role: 'USER' }, '101'),
      (error) => error.statusCode === 403
    );
  } finally {
    applicationRepository.findApplicationById = findApplicationById;
  }
});

test('every application status change calls the decision procedure and notifies the applicant once', async () => {
  const statements = [];
  const parameters = [];
  const client = mockClient(async (sql, values) => {
    statements.push(sql);
    parameters.push(values);
    // The procedure returns the values the caller needs through INOUT parameters.
    if (/CALL saple_apply_application_decision/.test(sql)) {
      return { rows: [{ io_previous_status: 'SUBMITTED', io_history_id: 9, io_applicant_user_id: 5, io_job_title: 'Engineer' }] };
    }
    return { rows: [{ notificationId: 4 }] };
  });
  database.getClient = async () => client;

  const result = await applicationRepository.changeApplicationStatus({
    applicationId: 101, actorUserId: 30, newStatus: 'SHORTLISTED', note: 'Strong coursework',
    allowedPreviousStatuses: ['SUBMITTED'], isReviewerDecision: true
  });

  assert.equal(result.historyId, 9);
  assert.equal(result.previousStatus, 'SUBMITTED');
  const calls = statements.filter((sql) => /CALL saple_apply_application_decision/.test(sql));
  assert.equal(calls.length, 1);
  // The allowed transitions are a bound parameter, never inlined SQL.
  assert.deepEqual(parameters[statements.indexOf(calls[0])], [101, 30, 'SHORTLISTED', 'Strong coursework', ['SUBMITTED'], true]);
  assert.equal(statements.filter((sql) => /INSERT INTO notifications/.test(sql)).length, 1);
  // The CALL carries no COMMIT of its own: the backend owns the transaction,
  // which mockClient counts on the next line.
  assert.doesNotMatch(calls[0], /COMMIT/);
  assert.deepEqual(client.state, { commits: 1, rollbacks: 0, releases: 1 });
});

test('the procedure\'s own errors become the existing API errors, not SQL detail', async () => {
  for (const [code, expected] of [['SA001', /Application not found/], ['SA002', /cannot make that transition/]]) {
    const client = mockClient(async (sql) => {
      if (/CALL saple_apply_application_decision/.test(sql)) {
        const error = new Error('relation detail that must not leak');
        error.code = code;
        throw error;
      }
      return { rows: [] };
    });
    database.getClient = async () => client;

    await assert.rejects(applicationRepository.changeApplicationStatus({
      applicationId: 101, actorUserId: 30, newStatus: 'SHORTLISTED', note: null,
      allowedPreviousStatuses: ['SUBMITTED'], isReviewerDecision: true
    }), (error) => expected.test(error.message) && !/relation detail/.test(error.message), code);
    assert.deepEqual(client.state, { commits: 0, rollbacks: 1, releases: 1 });
  }
});

test('a failed notification write rolls back the whole decision', async () => {
  const client = mockClient(async (sql) => {
    if (/CALL saple_apply_application_decision/.test(sql)) {
      return { rows: [{ io_previous_status: 'SUBMITTED', io_history_id: 9, io_applicant_user_id: 5, io_job_title: 'Engineer' }] };
    }
    // The procedure's two writes are already done; this failure must undo them.
    throw new Error('notification insert failed');
  });
  database.getClient = async () => client;

  await assert.rejects(applicationRepository.changeApplicationStatus({
    applicationId: 101, actorUserId: 30, newStatus: 'SHORTLISTED', note: null,
    allowedPreviousStatuses: ['SUBMITTED'], isReviewerDecision: true
  }), /notification insert failed/);
  assert.deepEqual(client.state, { commits: 0, rollbacks: 1, releases: 1 });
});
