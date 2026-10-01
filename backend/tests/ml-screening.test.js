const test = require('node:test');
const assert = require('node:assert/strict');
const screening = require('../services/ml-screening.service');
const profileModeration = require('../services/profile-moderation.service');
const userRepository = require('../repositories/user.repository');
const profileRepository = require('../repositories/professional-profile.repository');
const mlRepository = require('../repositories/ml-screening.repository');
const jobService = require('../services/job.service');
const jobRepository = require('../repositories/job.repository');

const names = ['ML_SCREENING_ENABLED', 'ML_AUTO_PUBLISH_ENABLED', 'ML_SHADOW_MODE', 'ML_AUTO_PUBLISH_TYPES',
  'ML_SERVICE_URL', 'ML_SERVICE_TOKEN', 'ML_SCREEN_TIMEOUT_MS'];
const originalEnv = Object.fromEntries(names.map((name) => [name, process.env[name]]));
const realFetch = global.fetch;
test.afterEach(() => {
  global.fetch = realFetch;
  for (const name of names) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

const lowRisk = {
  contentType: 'REVIEW', decision: 'AUTO_PUBLISH', eligible: true,
  outOfDistribution: false, modelKey: 'review-v1', modelVersion: '2026-10-02.1',
  featureSchemaVersion: '1', riskProbability: 0.01,
  autoPublishThreshold: 0.04, reasonCodes: []
};

test('screening is disabled by default and never calls a remote service', async () => {
  delete process.env.ML_SCREENING_ENABLED;
  global.fetch = () => { throw new Error('should not call'); };
  assert.equal(await screening.screen('REVIEW', { pros: 'public text' }), null);
});

test('a model outage or timeout holds content without throwing', async () => {
  process.env.ML_SCREENING_ENABLED = 'true';
  process.env.ML_SERVICE_URL = 'https://ml.example.test';
  process.env.ML_SERVICE_TOKEN = 'test-only-token';
  global.fetch = async () => { throw new Error('offline'); };
  assert.deepEqual((await screening.screen('SALARY', { roleId: 1 })).publicationState, 'HELD');
  assert.equal((await screening.screen('SALARY', { roleId: 1 })).screeningStatus, 'UNAVAILABLE');
});

test('shadow mode records an eligible model decision but does not publish', async () => {
  Object.assign(process.env, {
    ML_SCREENING_ENABLED: 'true', ML_SERVICE_URL: 'https://ml.example.test', ML_SERVICE_TOKEN: 'test-only-token',
    ML_AUTO_PUBLISH_ENABLED: 'true', ML_AUTO_PUBLISH_TYPES: 'REVIEW', ML_SHADOW_MODE: 'true'
  });
  global.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, '/screen');
    assert.equal(options.headers['x-saple-ml-token'], 'test-only-token');
    assert.deepEqual(JSON.parse(options.body).features, { pros: 'public text' });
    return new Response(JSON.stringify(lowRisk), { headers: { 'content-type': 'application/json' } });
  };
  const result = await screening.screen('REVIEW', { pros: 'public text' });
  assert.equal(result.screeningStatus, 'AUTO_PUBLISH');
  assert.equal(result.publicationState, 'HELD');
  assert.equal(result.modelVersion, lowRisk.modelVersion);
});

test('provisional publishing requires every gate and per-type opt-in', () => {
  Object.assign(process.env, { ML_AUTO_PUBLISH_ENABLED: 'true', ML_SHADOW_MODE: 'false', ML_AUTO_PUBLISH_TYPES: 'REVIEW' });
  assert.equal(screening.normalize('REVIEW', lowRisk).publicationState, 'PROVISIONAL');
  process.env.ML_AUTO_PUBLISH_ENABLED = 'false';
  assert.equal(screening.normalize('REVIEW', lowRisk).publicationState, 'HELD');
  process.env.ML_AUTO_PUBLISH_ENABLED = 'true';
  process.env.ML_AUTO_PUBLISH_TYPES = 'SALARY';
  assert.equal(screening.normalize('REVIEW', lowRisk).publicationState, 'HELD');
  process.env.ML_AUTO_PUBLISH_TYPES = 'REVIEW';
  for (const bad of [
    { riskProbability: null }, { riskProbability: 0.5 }, { eligible: false },
    { outOfDistribution: true }, { modelVersion: null }, { autoPublishThreshold: null },
    { decision: 'AUTO_REJECT' }
  ]) {
    assert.equal(screening.normalize('REVIEW', { ...lowRisk, ...bad }).publicationState, 'HELD');
  }
});

test('screening payloads reject private entity types', async () => {
  process.env.ML_SCREENING_ENABLED = 'true';
  await assert.rejects(screening.screen('APPLICATION_RESUME', { bytes: 'private' }), /Unsupported/);
  await assert.rejects(screening.screen('DIRECT_MESSAGE', { text: 'private' }), /Unsupported/);
});

test('profile screening includes public sections and holds an update when no eligible model exists', async () => {
  const originals = {
    user: userRepository.findSafeUserById,
    sections: profileRepository.listSections,
    record: mlRepository.recordProfileRevision,
    fetch: global.fetch
  };
  try {
    Object.assign(process.env, {
      ML_SCREENING_ENABLED: 'true', ML_SERVICE_URL: 'https://ml.example.test', ML_SERVICE_TOKEN: 'test-only-token',
      ML_SHADOW_MODE: 'true', ML_AUTO_PUBLISH_ENABLED: 'false'
    });
    userRepository.findSafeUserById = async () => ({ userId: 7, fullName: 'Member', headline: 'Engineer', bio: 'About' });
    profileRepository.listSections = async () => ({
      education: [{ educationId: 1, institution: 'BUET', degree: 'BSc', fieldOfStudy: 'CSE', startDate: '2020-01', endDate: '2024-01', currentlyStudying: false, description: 'Systems' }],
      experience: [], skills: [{ skillId: 2, name: 'PostgreSQL' }]
    });
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.contentType, 'PROFILE');
      assert.deepEqual(body.features.skills, ['PostgreSQL']);
      assert.equal(body.features.education[0].institution, 'BUET');
      return new Response(JSON.stringify({ contentType: 'PROFILE', decision: 'MANUAL_REVIEW', eligible: false, outOfDistribution: true, reasonCodes: ['INSUFFICIENT_MODEL_DATA'] }), { headers: { 'content-type': 'application/json' } });
    };
    let recorded;
    mlRepository.recordProfileRevision = async (input) => { recorded = input; return { publicationState: 'HELD', applied: false, screening: input.screening }; };
    const previous = await profileModeration.loadSnapshot(7);
    const result = await profileModeration.submit(7, previous, { ...previous, bio: 'Pending update' });
    assert.equal(result.applied, false);
    assert.equal(result.publicationState, 'HELD');
    assert.equal(recorded.proposedSnapshot.bio, 'Pending update');
  } finally {
    userRepository.findSafeUserById = originals.user;
    profileRepository.listSections = originals.sections;
    mlRepository.recordProfileRevision = originals.record;
    global.fetch = originals.fetch;
  }
});

test('ML moderator routes exist for pending profile and job decisions', () => {
  const routes = require('../routes/admin.routes');
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../routes/admin.routes.js'), 'utf8');
  assert.match(source, /\/ml\/screenings\/pending/);
  assert.match(source, /\/ml\/screenings\/:screeningId\/decision/);
  assert.ok(routes);
});

test('held job screening keeps a requested publication as a draft', async () => {
  const originalCreate = jobRepository.createJob;
  const originalFetch = global.fetch;
  try {
    Object.assign(process.env, {
      ML_SCREENING_ENABLED: 'true', ML_SERVICE_URL: 'https://ml.example.test', ML_SERVICE_TOKEN: 'test-only-token',
      ML_SHADOW_MODE: 'true', ML_AUTO_PUBLISH_ENABLED: 'false'
    });
    global.fetch = async () => new Response(JSON.stringify({
      contentType: 'JOB', decision: 'MANUAL_REVIEW', eligible: false, outOfDistribution: true,
      reasonCodes: ['INSUFFICIENT_MODEL_DATA']
    }), { headers: { 'content-type': 'application/json' } });
    let captured;
    jobRepository.createJob = async (input) => { captured = input; return { jobId: 31, jobStatus: input.jobStatus }; };
    const result = await jobService.createJob({ userId: 4, role: 'COMPANY_REPRESENTATIVE', representativeCompanyIds: [2], representativeScopes: [{ companyId: 2, assignmentId: 8 }] }, 2, {
      title: 'Data analyst vacancy', description: 'A public role with a structured description.',
      requirements: 'SQL and reporting experience', location: 'Dhaka', employmentType: 'FULL_TIME',
      workMode: 'ONSITE', applicationDeadline: '2099-01-01', jobStatus: 'PUBLISHED'
    });
    assert.equal(captured.jobStatus, 'DRAFT');
    assert.equal(result.jobStatus, 'DRAFT');
  } finally {
    jobRepository.createJob = originalCreate;
    global.fetch = originalFetch;
  }
});
