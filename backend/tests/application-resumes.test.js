const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const database = require('../config/database');
const auth = require('../config/auth');
const applicationRepository = require('../repositories/application.repository');

const savedSecret = process.env.JWT_SECRET;
const original = {};
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
const coverLetter = 'I have built useful software for several years and would enjoy this role.';
let pg;
let server;
let origin;
let jobId;
let companyId;
let otherCompanyId;
let ownerRep;
let otherRep;
let admin;
let nextUser = 0;

const one = async (sql, values = []) => (await pg.query(sql, values)).rows[0];
function token(userId, role = 'USER') {
  return jwt.sign({ userId, role, tokenVersion: 0 }, process.env.JWT_SECRET, {
    algorithm: auth.JWT_ALGORITHM, issuer: auth.JWT_ISSUER,
    audience: auth.JWT_AUDIENCE, expiresIn: '10m'
  });
}
async function user(role = 'USER') {
  const n = ++nextUser;
  const row = await one(`INSERT INTO users (full_name, email, password_hash, account_role)
    VALUES ($1, $2, $3, $4) RETURNING user_id AS id`,
  [`Resume Test ${n}`, `resume-test-${n}@example.invalid`, 'x'.repeat(60), role]);
  return { id: row.id, token: token(row.id, role) };
}
function form({ files = [{ field: 'resume', name: 'resume.pdf', type: 'application/pdf', bytes: pdf }], letter = coverLetter } = {}) {
  const data = new FormData();
  data.set('coverLetter', letter);
  for (const file of files) data.append(file.field, new Blob([file.bytes], { type: file.type }), file.name);
  return data;
}
async function request(pathname, { method = 'GET', bearer, body } = {}) {
  const headers = {};
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${origin}${pathname}`, {
    method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
  });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { response, status: response.status, data };
}
const applyPath = () => `/api/jobs/${jobId}/applications`;

test.before(async () => {
  process.env.JWT_SECRET = 'application-resume-test-only-secret-with-enough-entropy';
  const { PGlite } = await import('@electric-sql/pglite');
  pg = new PGlite();
  const schema = fs.readFileSync(path.join(__dirname, '../../database/postgres/01_final_schema_postgres.sql'), 'utf8');
  await pg.exec(schema);
  let tail = Promise.resolve();
  const acquire = () => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const ready = tail.then(() => release);
    tail = tail.then(() => pending);
    return ready;
  };
  for (const name of ['query', 'getClient', 'cloudQuery', 'cloudClient', 'withCloudTransaction']) original[name] = database[name];
  database.query = async (sql, values) => {
    const release = await acquire();
    try { return await pg.query(sql, values); } finally { release(); }
  };
  database.cloudQuery = database.query;
  database.getClient = async () => {
    const release = await acquire();
    let released = false;
    return {
      query: (sql, values) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql) ? pg.exec(sql) : pg.query(sql, values),
      release() { if (!released) { released = true; release(); } }
    };
  };
  database.cloudClient = database.getClient;
  database.withCloudTransaction = (work) => database.withTransaction(work);
  admin = await user('ADMIN');
  ownerRep = await user('COMPANY_REPRESENTATIVE');
  otherRep = await user('COMPANY_REPRESENTATIVE');
  companyId = (await one(`INSERT INTO companies (company_name, industry, headquarters_city, country)
    VALUES ('Resume Labs', 'Technology', 'Dhaka', 'Bangladesh') RETURNING company_id AS id`)).id;
  otherCompanyId = (await one(`INSERT INTO companies (company_name, industry, headquarters_city, country)
    VALUES ('Other Labs', 'Technology', 'Dhaka', 'Bangladesh') RETURNING company_id AS id`)).id;
  await pg.query(`INSERT INTO company_representatives (user_id, company_id, assignment_status, approved_by, approved_at)
    VALUES ($1, $2, 'ACTIVE', $3, CURRENT_TIMESTAMP), ($4, $5, 'ACTIVE', $3, CURRENT_TIMESTAMP)`,
  [ownerRep.id, companyId, admin.id, otherRep.id, otherCompanyId]);
  jobId = (await one(`INSERT INTO job_postings (company_id, created_by_user_id, title, description, location,
    employment_type, work_mode, application_deadline, job_status, published_at)
    VALUES ($1, $2, 'Resume Engineer', 'Build systems for our company.', 'Dhaka', 'FULL_TIME', 'HYBRID',
    CURRENT_DATE + 30, 'PUBLISHED', CURRENT_TIMESTAMP) RETURNING job_id AS id`, [companyId, ownerRep.id])).id;
  server = require('../app').listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server?.close();
  Object.assign(database, original);
  if (savedSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedSecret;
  await pg?.close();
});

test('JSON applications remain valid and have no resume row', async () => {
  const applicant = await user();
  const result = await request(applyPath(), { method: 'POST', bearer: applicant.token, body: { coverLetter } });
  assert.equal(result.status, 201);
  assert.equal(result.data.data.resumeAttached, false);
  assert.equal((await one('SELECT COUNT(*)::int AS n FROM job_application_resumes')).n, 0);
});

test('a PDF is stored atomically with correct metadata and private downloads', async () => {
  const applicant = await user();
  const result = await request(applyPath(), { method: 'POST', bearer: applicant.token,
    body: form({ files: [{ field: 'resume', name: 'C:\\private\\my resume.pdf', type: 'application/pdf', bytes: pdf }] }) });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  const id = result.data.data.applicationId;
  const row = await one(`SELECT original_file_name AS name, file_size_bytes AS size, sha256_hex AS sha,
    pdf_data AS bytes FROM job_application_resumes WHERE application_id = $1`, [id]);
  assert.equal(row.name, 'my_resume.pdf');
  assert.equal(row.size, pdf.length);
  assert.equal(row.sha, crypto.createHash('sha256').update(pdf).digest('hex'));
  assert.deepEqual(Buffer.from(row.bytes), pdf);
  assert.equal((await one('SELECT COUNT(*)::int AS n FROM job_application_status_history WHERE application_id = $1', [id])).n, 1);
  const ownList = await request('/api/me/applications', { bearer: applicant.token });
  assert.equal(ownList.status, 200);
  assert.match(JSON.stringify(ownList.data), /my_resume.pdf/);
  assert.doesNotMatch(JSON.stringify(ownList.data), /pdf_data|%PDF-/);
  const repList = await request('/api/representative/applications', { bearer: ownerRep.token });
  assert.equal(repList.status, 200);
  assert.doesNotMatch(JSON.stringify(repList.data), /pdf_data|%PDF-/);
  for (const [who, route] of [[applicant, `/api/me/applications/${id}/resume`],
    [ownerRep, `/api/representative/applications/${id}/resume`]]) {
    const downloaded = await request(`${route}?disposition=attachment`, { bearer: who.token });
    assert.equal(downloaded.status, 200);
    assert.deepEqual(downloaded.data, pdf);
    assert.equal(downloaded.response.headers.get('content-type'), 'application/pdf');
    assert.match(downloaded.response.headers.get('content-disposition'), /^attachment; filename="my_resume.pdf"/);
    assert.equal(downloaded.response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(downloaded.response.headers.get('cache-control'), /private.*no-store/);
    assert.equal(Number(downloaded.response.headers.get('content-length')), pdf.length);
  }
  const inline = await request(`/api/me/applications/${id}/resume?disposition=inline`, { bearer: applicant.token });
  assert.equal(inline.status, 200);
  assert.match(inline.response.headers.get('content-disposition'), /^inline;/);
  const stranger = await user();
  assert.equal((await request(`/api/me/applications/${id}/resume`, { bearer: stranger.token })).status, 403);
  assert.equal((await request(`/api/me/applications/${id}/resume`)).status, 401);
  assert.equal((await request(`/api/representative/applications/${id}/resume`, { bearer: otherRep.token })).status, 403);
  // Administrators have no representative-route privilege in the current API.
  assert.equal((await request(`/api/representative/applications/${id}/resume`, { bearer: admin.token })).status, 403);
  assert.equal((await request(`/api/me/applications/${id}/resume?disposition=preview`, { bearer: applicant.token })).status, 400);
  assert.equal((await request(`/api/me/applications/999999/resume`, { bearer: applicant.token })).status, 404);
});

test('invalid uploads are rejected before an application is created', async () => {
  const cases = [
    { files: [{ field: 'resume', name: 'too-large.pdf', type: 'application/pdf', bytes: Buffer.alloc(2097153, 65) }], status: 413 },
    { files: [{ field: 'resume', name: 'bad.pdf', type: 'text/plain', bytes: pdf }], status: 400 },
    { files: [{ field: 'resume', name: 'bad.exe', type: 'application/pdf', bytes: pdf }], status: 400 },
    { files: [{ field: 'resume', name: 'fake.pdf', type: 'application/pdf', bytes: Buffer.from('not a PDF') }], status: 400 },
    { files: [{ field: 'resume', name: 'empty.pdf', type: 'application/pdf', bytes: Buffer.alloc(0) }], status: 400 },
    { files: [{ field: 'other', name: 'valid.pdf', type: 'application/pdf', bytes: pdf }], status: 400 },
    { files: [{ field: 'resume', name: 'a.pdf', type: 'application/pdf', bytes: pdf },
      { field: 'resume', name: 'b.pdf', type: 'application/pdf', bytes: pdf }], status: 400 }
  ];
  for (const entry of cases) {
    const applicant = await user();
    const result = await request(applyPath(), { method: 'POST', bearer: applicant.token, body: form(entry) });
    assert.equal(result.status, entry.status, JSON.stringify(result.data));
    assert.equal((await one('SELECT COUNT(*)::int AS n FROM job_applications WHERE applicant_user_id = $1', [applicant.id])).n, 0);
  }
});

test('database constraints and a failed resume insert leave no orphan application', async () => {
  const applicant = await user();
  const countBefore = (await one('SELECT COUNT(*)::int AS n FROM job_applications')).n;
  await assert.rejects(applicationRepository.createApplication({
    jobId, applicantUserId: applicant.id, coverLetter,
    resume: { fileName: 'resume.pdf', mimeType: 'application/pdf', size: pdf.length, sha256: 'invalid', buffer: pdf }
  }));
  assert.equal((await one('SELECT COUNT(*)::int AS n FROM job_applications')).n, countBefore);
  assert.equal((await one('SELECT COUNT(*)::int AS n FROM job_application_resumes WHERE application_id NOT IN (SELECT application_id FROM job_applications)')).n, 0);
});

test('the exact 2 MB boundary is accepted and a second resume is forbidden', async () => {
  const applicant = await user();
  const bytes = Buffer.alloc(2097152, 32);
  pdf.copy(bytes, 0);
  const created = await request(applyPath(), { method: 'POST', bearer: applicant.token,
    body: form({ files: [{ field: 'resume', name: 'full.pdf', type: 'application/pdf', bytes }] }) });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.data.applicationId;
  assert.equal((await one('SELECT file_size_bytes AS size FROM job_application_resumes WHERE application_id = $1', [id])).size, 2097152);
  await assert.rejects(pg.query(`INSERT INTO job_application_resumes
    (application_id, original_file_name, mime_type, file_size_bytes, sha256_hex, pdf_data)
    VALUES ($1, 'other.pdf', 'application/pdf', 1, $2, $3)`, [id, 'a'.repeat(64), Buffer.from('x')]));
  const duplicate = await request(applyPath(), { method: 'POST', bearer: applicant.token, body: { coverLetter } });
  assert.equal(duplicate.status, 409);
});

test('an application without an attachment returns 404 for its resume', async () => {
  const applicant = await user();
  const created = await request(applyPath(), { method: 'POST', bearer: applicant.token, body: { coverLetter } });
  assert.equal(created.status, 201);
  const id = created.data.data.applicationId;
  assert.equal((await request(`/api/me/applications/${id}/resume`, { bearer: applicant.token })).status, 404);
});

test('revoking a representative assignment immediately revokes PDF access', async () => {
  const applicant = await user();
  const rep = await user('COMPANY_REPRESENTATIVE');
  await pg.query(`INSERT INTO company_representatives (user_id, company_id, assignment_status, approved_by, approved_at)
    VALUES ($1, $2, 'ACTIVE', $3, CURRENT_TIMESTAMP)`, [rep.id, companyId, admin.id]);
  const created = await request(applyPath(), { method: 'POST', bearer: applicant.token, body: form() });
  assert.equal(created.status, 201);
  const route = `/api/representative/applications/${created.data.data.applicationId}/resume`;
  assert.equal((await request(route, { bearer: rep.token })).status, 200);
  await pg.query(`UPDATE company_representatives SET assignment_status = 'REVOKED',
    revoked_by = $2, revoked_at = CURRENT_TIMESTAMP, decision_note = 'Test revocation'
    WHERE user_id = $1`, [rep.id, admin.id]);
  assert.equal((await request(route, { bearer: rep.token })).status, 403);
});
