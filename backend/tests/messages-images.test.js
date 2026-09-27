const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const database = require('../config/database');
const repository = require('../repositories/message.repository');
const service = require('../services/message.service');
const storage = require('../config/supabase-storage');
const { isValidImage } = require('../middleware/imageUpload');
const { companyIdFrom } = require('../controllers/image.controller');

test('message text and image signatures are validated independently of browser MIME claims', () => {
  assert.equal(service.body('  Hello\r\n🙂  '), 'Hello\n🙂');
  assert.throws(() => service.body(' '.repeat(4)), (error) => error.statusCode === 400);
  assert.throws(() => service.body('x'.repeat(2001)), (error) => error.statusCode === 400);
  assert.throws(() => service.id('1 OR 1=1'), (error) => error.statusCode === 400);
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  assert.equal(isValidImage({ mimetype: 'image/png', buffer: png }), true);
  assert.equal(isValidImage({ mimetype: 'image/png', buffer: Buffer.from('<svg') }), false);
  assert.equal(isValidImage({ mimetype: 'image/svg+xml', buffer: png }), false);
  assert.equal(isValidImage({ mimetype: 'image/jpeg', buffer: Buffer.from('ffd8ff00', 'hex') }), true);
  assert.equal(isValidImage({ mimetype: 'image/webp', buffer: Buffer.from('RIFF0000WEBP') }), true);
  assert.equal(companyIdFrom({ params: { companyId: '7' }, user: { representativeCompanyIds: [7] } }), 7);
  assert.throws(() => companyIdFrom({ params: { companyId: '8' }, user: { representativeCompanyIds: [7] } }),
    (error) => error.statusCode === 403);
});

test('Storage URLs are derived from paths without exposing the secret and missing Storage is graceful', async () => {
  const prior = { url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_SECRET_KEY };
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    assert.equal(storage.publicUrl('avatar', 'users/7/avatar'), null);
    await assert.rejects(storage.upload('avatar', 'users/7/avatar', { buffer: Buffer.from('x'), mimetype: 'image/png' }),
      (error) => error.statusCode === 503);
    process.env.SUPABASE_URL = 'https://storage.example';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_synthetic_test_only';
    const url = storage.publicUrl('avatar', 'users/7/avatar', '2026-01-01T00:00:00Z');
    assert.match(url, /^https:\/\/storage\.example\/storage\/v1\/object\/public\/avatar\/users\/7\/avatar\?v=/);
    assert.equal(url.includes(process.env.SUPABASE_SECRET_KEY), false);
  } finally {
    if (prior.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prior.url;
    if (prior.secret === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = prior.secret;
  }
});

test('cloud message repository preserves participant privacy, order, unread state and deletion', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  const originals = { query: database.query, cloudQuery: database.cloudQuery, cloudClient: database.cloudClient, withCloudTransaction: database.withCloudTransaction };
  database.query = (sql, values) => pg.query(sql, values);
  database.cloudQuery = (sql, values) => pg.query(sql, values);
  database.cloudClient = async () => ({ query: (sql, values) => pg.query(sql, values), release() {} });
  database.withCloudTransaction = async (work) => {
    await pg.exec('BEGIN');
    try { const result = await work({ query: (sql, values) => pg.query(sql, values) }); await pg.exec('COMMIT'); return result; }
    catch (error) { await pg.exec('ROLLBACK'); throw error; }
  };
  try {
    const schema = fs.readFileSync(path.join(__dirname, '../../database/postgres/01_final_schema_postgres.sql'), 'utf8');
    await pg.exec(schema);
    for (const [name, email] of [['Alice', 'alice@example.invalid'], ['Bob', 'bob@example.invalid'], ['Carol', 'carol@example.invalid']]) {
      await pg.query('INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3)', [name, email, 'x'.repeat(60)]);
    }
    const first = await repository.send(1, 2, 'Hello');
    await repository.send(3, 2, 'Other conversation');
    const reply = await repository.send(2, 1, 'Hi');
    assert.equal((await repository.conversations(2))[0].userId, 1);
    assert.equal(await repository.unreadCount(2), 2);
    const history = await repository.history(2, 1);
    assert.deepEqual(history.messages.map((item) => item.messageBody), ['Hello', 'Hi']);
    assert.equal(await repository.unreadCount(2), 1);
    assert.equal(await repository.edit(3, first.messageId, 'Stolen'), null);
    assert.equal((await repository.edit(1, first.messageId, 'Edited')).messageBody, 'Edited');
    assert.equal(await repository.remove(3, first.messageId), null);
    assert.ok((await repository.remove(1, first.messageId)).deletedAt);
    assert.equal(await repository.edit(1, first.messageId, 'Revive'), null);
    const after = await repository.history(2, 1);
    assert.equal(after.messages[0].messageBody, null);
    assert.ok(after.messages[0].deletedAt);
    assert.equal((await repository.profile(3)).fullName, 'Carol');
    assert.equal((await repository.history(2, 3)).messages.length, 1);
  } finally {
    Object.assign(database, originals);
    await pg.close();
  }
});
