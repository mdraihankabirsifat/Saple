const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');

const database = require('../config/database');
const authConfig = require('../config/auth');
const homeService = require('../services/home.service');

// Homepage hero recommendations and the activity series, on an in-process
// PostgreSQL (PGlite) with the final schema and a small, deliberate data set.

const ROOT = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const savedQuery = database.query;
const savedSecret = process.env.JWT_SECRET;

let pg;
let server;
let baseUrl;
const ids = {};

const one = async (sql, values = []) => (await pg.query(sql, values)).rows[0];
const LONG_QUESTIONS = 'They asked about partitioning a Kafka topic, idempotent Spark jobs, slowly changing dimensions in SQL and how I monitored pipeline freshness in production.';

async function user(name, { headline = null, role = 'USER' } = {}) {
  return (await one(`INSERT INTO users (full_name, email, password_hash, account_role, headline)
    VALUES ($1, $2, $3, $4, $5) RETURNING user_id AS id`,
  [name, `${name.toLowerCase().replace(/\s+/g, '.')}@example.invalid`, 'x'.repeat(60), role, headline])).id;
}

async function job(title, { company, access = 'FREE', status = 'PUBLISHED', deadline = 'CURRENT_DATE + 30', location = 'Dhaka',
  min = null, max = null, currency = 'BDT', period = 'MONTHLY', role = null, publishedDaysAgo = 1 } = {}) {
  const salary = max === null ? [null, null, null, null] : [min, max, currency, period];
  return (await one(`INSERT INTO job_postings (company_id, created_by_user_id, role_id, title, description, location,
      employment_type, work_mode, salary_min, salary_max, salary_currency, salary_period, application_deadline,
      job_status, published_at, closed_at, access_level)
    VALUES ($1, $2, $3, $4, 'A role building the data and product systems behind our services.', $5, 'FULL_TIME', 'HYBRID',
      $6, $7, $8, $9, ${deadline}, $10::varchar, CURRENT_TIMESTAMP - ($11 || ' days')::interval,
      CASE WHEN $10::varchar = 'CLOSED' THEN CURRENT_TIMESTAMP ELSE NULL END, $12)
    RETURNING job_id AS id`,
  [company, ids.admin, role, title, location, ...salary, status, String(publishedDaysAgo), access])).id;
}

async function submission(type, { userId, company, approved = true, daysAgo = 5 }) {
  return (await one(`INSERT INTO submissions (user_id, company_id, submission_type, submission_status, approved_at, submitted_at)
    VALUES ($1, $2, $3, $4::varchar, CASE WHEN $4::varchar = 'APPROVED' THEN CURRENT_TIMESTAMP - ($5 || ' days')::interval END,
      CURRENT_TIMESTAMP - ($5 || ' days')::interval - INTERVAL '1 hour')
    RETURNING submission_id AS id`, [userId, company, type, approved ? 'APPROVED' : 'PENDING', String(daysAgo)])).id;
}

async function review(company, rating, { approved = true } = {}) {
  const id = await submission('REVIEW', { userId: ids.contributor, company, approved });
  await pg.query(`INSERT INTO company_reviews (submission_id, review_title, overall_rating, work_life_balance_rating,
      career_growth_rating, management_rating, culture_rating, pros, cons, employment_status, review_date)
    VALUES ($1, 'Review', $2, $2, $2, $2, $2, 'Good', 'Busy', 'CURRENT', CURRENT_DATE - 3)`, [id, rating]);
}

async function salary(role, amount, { currency = 'BDT', period = 'MONTHLY', approved = true } = {}) {
  const id = await submission('SALARY', { userId: ids.contributor, company: ids.tech, approved });
  await pg.query(`INSERT INTO salary_submissions (submission_id, role_id, base_salary, currency, pay_period,
      years_of_experience, employment_type, work_mode, salary_year)
    VALUES ($1, $2, $3, $4, $5, 3, 'FULL_TIME', 'HYBRID', 2026)`, [id, role, amount, currency, period]);
}

async function interview(role, company, questions, { approved = true, daysAgo = 5 } = {}) {
  const id = await submission('INTERVIEW', { userId: ids.contributor, company, approved, daysAgo });
  await pg.query(`INSERT INTO interview_experiences (submission_id, role_id, interview_date, difficulty_level, rounds_count,
      interview_mode, result_status, duration_days, process_description, questions_summary)
    VALUES ($1, $2, CURRENT_DATE - 20, 'MEDIUM', 3, 'ONLINE', 'OFFERED', 10, 'Three rounds.', $3)`, [id, role, questions]);
  return id;
}

function tokenFor(userId) {
  return jwt.sign({ userId, role: 'USER', tokenVersion: 0 }, process.env.JWT_SECRET, {
    algorithm: authConfig.JWT_ALGORITHM, issuer: authConfig.JWT_ISSUER, audience: authConfig.JWT_AUDIENCE, expiresIn: '10m'
  });
}

test.before(async () => {
  process.env.JWT_SECRET = 'home-test-secret-with-sufficient-local-entropy-only';
  const { PGlite } = await import('@electric-sql/pglite');
  pg = new PGlite();
  await pg.exec(read('database/postgres/01_final_schema_postgres.sql'));
  database.query = (sql, values) => pg.query(sql, values);

  ids.admin = await user('Admin Person', { role: 'ADMIN' });
  ids.contributor = await user('Contributor Person');
  ids.anna = await user('Anna Data', { headline: 'Data engineer building pipelines' });
  ids.dan = await user('Dan Design', { headline: 'Product designer' });
  ids.priya = await user('Priya Trial', { headline: 'Data engineer' });

  const company = async (name, industry) => (await one(`INSERT INTO companies (company_name, industry, headquarters_city, country)
    VALUES ($1, $2, 'Dhaka', 'Bangladesh') RETURNING company_id AS id`, [name, industry])).id;
  ids.tech = await company('Pipeline Labs', 'Technology');
  ids.studio = await company('Pixel Studio', 'Design');
  ids.bank = await company('River Bank', 'Banking');
  ids.tiny = await company('Tiny Startup', 'Technology');

  const role = async (name) => (await one(`INSERT INTO job_roles (role_name) VALUES ($1) RETURNING role_id AS id`, [name])).id;
  ids.dataRole = await role('Data Engineer');
  ids.designRole = await role('Product Designer');

  for (const [person, skill] of [[ids.anna, 'Python'], [ids.anna, 'Spark'], [ids.dan, 'Figma']]) {
    const skillId = (await one(`INSERT INTO skills (skill_name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING skill_id AS id`, [skill])).id;
    await pg.query('INSERT INTO user_skills (user_id, skill_id) VALUES ($1, $2)', [person, skillId]);
  }
  await pg.query(`INSERT INTO user_experience (user_id, organization, job_title, location, start_date, currently_working)
    VALUES ($1, 'Old Data Co', 'Data Engineer', 'Chittagong, Bangladesh', DATE '2023-01-01', TRUE),
           ($2, 'Studio Co', 'UX Designer', 'Dhaka', DATE '2022-01-01', TRUE)`, [ids.anna, ids.dan]);

  ids.jobData = await job('Data Engineer', { company: ids.tech, location: 'Chittagong', min: 150000, max: 200000, role: ids.dataRole });
  ids.jobDataPremium = await job('Senior Data Engineer', { company: ids.tech, access: 'PREMIUM', min: 250000, max: 300000, role: ids.dataRole });
  ids.jobDesign = await job('Product Designer', { company: ids.studio, min: 80000, max: 120000, role: ids.designRole });
  ids.jobUx = await job('UX Researcher', { company: ids.studio, min: 60000, max: 90000 });
  ids.jobBackend = await job('Backend Engineer', { company: ids.tech, min: 100000, max: 140000, publishedDaysAgo: 30 });
  ids.jobUsd = await job('Remote Data Engineer', { company: ids.tech, min: 5000, max: 6000, currency: 'USD' });
  ids.jobClosed = await job('Closed Data Engineer', { company: ids.tech, status: 'CLOSED', min: 900000, max: 990000 });
  ids.jobExpired = await job('Expired Data Engineer', { company: ids.tech, deadline: 'CURRENT_DATE - 1', min: 800000, max: 880000 });
  await pg.query(`INSERT INTO job_applications (job_id, applicant_user_id, cover_letter) VALUES ($1, $2, $3)`,
    [ids.jobData, ids.anna, 'I have built this exact pipeline before and would love to help.']);

  await interview(ids.dataRole, ids.tech, LONG_QUESTIONS);
  await interview(ids.designRole, ids.studio, 'Portfolio walkthrough, a whiteboard exercise on onboarding flows and questions about research methods.');
  ids.pendingInterview = await interview(ids.dataRole, ids.tech, 'PENDING QUESTIONS SHOULD NEVER APPEAR anywhere at all.', { approved: false });

  for (const rating of [4.8, 4.6, 4.7]) await review(ids.studio, rating);
  for (const rating of [4.0, 4.2, 3.8]) await review(ids.tech, rating);
  for (const rating of [3.5, 3.4, 3.6]) await review(ids.bank, rating);
  await review(ids.tiny, 5.0);
  await review(ids.bank, 1.0, { approved: false });

  for (const amount of [120000, 150000, 180000]) await salary(ids.dataRole, amount);
  for (const amount of [60000, 70000]) await salary(ids.dataRole, amount, { currency: 'USD', period: 'YEARLY' });
  for (const amount of [70000, 90000]) await salary(ids.designRole, amount);
  await salary(ids.dataRole, 9000000, { approved: false });

  // Priya has an active one-day trial.
  await pg.query(`INSERT INTO premium_trial_claims (user_id, starts_at, ends_at)
    VALUES ($1, CURRENT_TIMESTAMP - INTERVAL '1 hour', CURRENT_TIMESTAMP + INTERVAL '23 hours')`, [ids.priya]);

  server = require('../app').listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server?.close();
  database.query = savedQuery;
  if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret;
  await pg?.close();
});

const JOB_KEYS = ['accessLevel', 'companyId', 'companyName', 'employmentType', 'jobId', 'location', 'locked', 'publishedAt', 'title', 'workMode'];

test('anonymous visitors get public items, never labelled as personal and never full questions', async () => {
  const data = await homeService.getRecommendations(null);
  assert.equal(data.personalized, false);
  assert.equal(data.locationContext, null);
  assert.ok(data.jobs.length > 0 && data.jobs.length <= homeService.LIMITS.jobs);
  assert.ok(data.interviews.length <= 3 && data.companies.length <= 3 && data.salaryInsights.length <= 3 && data.highPayingJobs.length <= 3);
  for (const item of data.interviews) {
    assert.equal('questionsSummary' in item, false);
    assert.equal(item.questionsLocked, true);
  }
  // The preview is the beginning only; the rest of the questions never leaves.
  assert.doesNotMatch(JSON.stringify(data), /pipeline freshness in production/);
  // The Premium vacancy is only a teaser, with no salary.
  const premium = data.jobs.find((item) => item.jobId === ids.jobDataPremium);
  if (premium) {
    assert.equal(premium.locked, true);
    assert.equal('salary' in premium, false);
  }
});

test('closed, expired and already-applied vacancies are never recommended', async () => {
  for (const viewer of [null, { userId: ids.anna, role: 'USER' }]) {
    const data = await homeService.getRecommendations(viewer);
    const jobIds = [...data.jobs, ...data.highPayingJobs].map((item) => item.jobId);
    assert.equal(jobIds.includes(ids.jobClosed), false);
    assert.equal(jobIds.includes(ids.jobExpired), false);
  }
  const anna = await homeService.getRecommendations({ userId: ids.anna, role: 'USER' });
  assert.equal([...anna.jobs, ...anna.highPayingJobs].some((item) => item.jobId === ids.jobData), false);
});

test('signed-in members get items ranked for their own profile, and two members differ', async () => {
  const anna = await homeService.getRecommendations({ userId: ids.anna, role: 'USER' });
  const dan = await homeService.getRecommendations({ userId: ids.dan, role: 'USER' });
  assert.equal(anna.personalized, true);
  assert.equal(dan.personalized, true);
  assert.match(anna.jobs[0].title, /Data Engineer/);
  assert.match(dan.jobs[0].title, /Product Designer|UX Researcher/);
  assert.notDeepEqual(anna.jobs.map((item) => item.jobId), dan.jobs.map((item) => item.jobId));
  assert.equal(anna.interviews[0].roleName, 'Data Engineer');
  assert.equal(dan.interviews[0].roleName, 'Product Designer');
  assert.equal(anna.salaryInsights[0].roleName, 'Data Engineer');
  assert.equal(dan.salaryInsights[0].roleName, 'Product Designer');
  // Free members get the Premium vacancy as a locked teaser only.
  const teaser = anna.jobs.find((item) => item.jobId === ids.jobDataPremium);
  assert.ok(teaser, 'the relevant Premium vacancy is still recommended');
  assert.deepEqual([teaser.locked, 'salary' in teaser], [true, false]);
});

test('the order is stable for a viewer within the day and no query sorts randomly', async () => {
  const first = await homeService.getRecommendations({ userId: ids.dan, role: 'USER' });
  const second = await homeService.getRecommendations({ userId: ids.dan, role: 'USER' });
  assert.deepEqual(first, second);
  assert.deepEqual(await homeService.getRecommendations(null), await homeService.getRecommendations(null));
  const repository = read('backend/repositories/home.repository.js');
  assert.doesNotMatch(repository, /ORDER BY[^;]*RANDOM\(\)/i);
  assert.match(repository, /md5\(\$1::text \|\| ':' \|\| CURRENT_DATE::text/);
  assert.doesNotMatch(read('frontend/js/home-hero.js'), /Math\.random/);
});

test('location is a career hint from the member\'s own experience, used only when it matches', async () => {
  assert.deepEqual(homeService.locationFrom([{ location: 'Chittagong, Bangladesh' }]), { label: 'Chittagong', key: 'chittagong' });
  assert.equal(homeService.locationFrom([{ location: 'Remote' }]), null);
  assert.equal(homeService.locationFrom([]), null);
  const dan = await homeService.getRecommendations({ userId: ids.dan, role: 'USER' });
  assert.deepEqual(dan.locationContext, { label: 'Dhaka', source: 'career_profile' });
  assert.equal((await homeService.getRecommendations(null)).locationContext, null);
});

test('high-paying jobs compare one currency and pay period, and only Premium sees Premium salaries', async () => {
  const anonymous = await homeService.getRecommendations(null);
  assert.ok(anonymous.highPayingJobs.length > 0);
  assert.ok(anonymous.highPayingJobs.every((item) => item.salary.currency === 'BDT' && item.salary.period === 'MONTHLY'));
  assert.equal(anonymous.highPayingJobs.some((item) => item.jobId === ids.jobDataPremium), false);
  const maxima = anonymous.highPayingJobs.map((item) => item.salary.max);
  assert.deepEqual(maxima, [...maxima].sort((a, b) => b - a));

  const priya = await homeService.getRecommendations({ userId: ids.priya, role: 'USER' });
  assert.equal(priya.highPayingJobs[0].jobId, ids.jobDataPremium);
  const premiumJob = priya.jobs.find((item) => item.jobId === ids.jobDataPremium);
  assert.deepEqual([premiumJob.locked, premiumJob.salary.max], [false, 300000]);
});

test('salary insights keep currency and pay period apart and use approved figures only', async () => {
  const anna = await homeService.getRecommendations({ userId: ids.anna, role: 'USER' });
  const data = anna.salaryInsights.filter((item) => item.roleName === 'Data Engineer');
  assert.deepEqual(data.map((item) => [item.currency, item.payPeriod]).sort(), [['BDT', 'MONTHLY'], ['USD', 'YEARLY']]);
  const bdt = data.find((item) => item.currency === 'BDT');
  assert.deepEqual([bdt.minimum, bdt.maximum, bdt.contributions], [120000, 180000, 3]);
});

test('top reviewed companies need enough approved reviews', async () => {
  const data = await homeService.getRecommendations(null);
  const names = data.companies.map((item) => item.companyName);
  assert.equal(names.includes('Tiny Startup'), false, 'one 5-star review is not enough');
  const bank = data.companies.find((item) => item.companyName === 'River Bank');
  if (bank) assert.equal(bank.reviewCount, 3, 'the pending review is not counted');
  assert.ok(data.companies.every((item) => item.reviewCount >= 3));
});

test('Premium and trial members receive full interview questions; pending interviews never appear', async () => {
  const priya = await homeService.getRecommendations({ userId: ids.priya, role: 'USER' });
  const item = priya.interviews.find((entry) => entry.roleName === 'Data Engineer');
  assert.equal(item.questionsSummary, LONG_QUESTIONS);
  assert.equal(item.questionsLocked, false);
  for (const viewer of [null, { userId: ids.anna, role: 'USER' }, { userId: ids.priya, role: 'USER' }]) {
    const data = await homeService.getRecommendations(viewer);
    assert.doesNotMatch(JSON.stringify(data), /PENDING QUESTIONS/);
    assert.equal(data.interviews.some((entry) => entry.submissionId === ids.pendingInterview), false);
  }
});

test('responses carry public item fields only, never profile or history signals', async () => {
  const data = await homeService.getRecommendations({ userId: ids.anna, role: 'USER' });
  for (const item of data.jobs) {
    assert.deepEqual(Object.keys(item).filter((key) => key !== 'salary').sort(), JOB_KEYS);
  }
  assert.deepEqual(Object.keys(data).sort(), ['companies', 'generatedForDate', 'highPayingJobs', 'interviews',
    'jobs', 'locationContext', 'personalized', 'salaryInsights']);
  const text = JSON.stringify(data);
  // No private value and no ranking signal or reason field is ever returned.
  // (Words like "Spark" can appear in public interview previews, so private
  // data is checked by its own values and by field names.)
  assert.doesNotMatch(text, /example\.invalid|building pipelines|Old Data Co|Chittagong, Bangladesh/);
  assert.doesNotMatch(text, /"(score|reason|terms|roleIds|industries|appliedJobIds|headline|skills|experience)"/);
});

test('the activity series is the real cumulative count of approved insights', async () => {
  const { metric, points } = await homeService.getActivitySeries();
  assert.equal(metric, 'cumulativeApprovedInsights');
  assert.ok(points.length >= 1 && points.length <= 12);
  for (let index = 1; index < points.length; index += 1) {
    assert.ok(points[index].cumulativeApprovedInsights >= points[index - 1].cumulativeApprovedInsights);
  }
  const approved = await one(`SELECT COUNT(*)::int AS n FROM submissions WHERE submission_status = 'APPROVED'`);
  assert.equal(points.at(-1).cumulativeApprovedInsights, approved.n);
  assert.ok(points[0].cumulativeApprovedInsights > 0, 'leading empty months are left out');
});

test('the endpoints work over HTTP, with optional sign-in and no shared caching', async () => {
  const anonymous = await fetch(`${baseUrl}/api/home/recommendations`);
  assert.equal(anonymous.status, 200);
  assert.equal((await anonymous.json()).data.personalized, false);
  const signedIn = await fetch(`${baseUrl}/api/home/recommendations`, { headers: { Authorization: `Bearer ${tokenFor(ids.dan)}` } });
  assert.equal(signedIn.status, 200);
  assert.match(signedIn.headers.get('cache-control'), /no-store/);
  assert.equal((await signedIn.json()).data.personalized, true);
  const bad = await fetch(`${baseUrl}/api/home/recommendations`, { headers: { Authorization: 'Bearer not-a-token' } });
  assert.equal(bad.status, 401);
  const activity = await fetch(`${baseUrl}/api/stats/activity`);
  assert.equal(activity.status, 200);
  assert.ok(Array.isArray((await activity.json()).data.points));
});
