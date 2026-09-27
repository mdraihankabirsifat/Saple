const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
const app = require('../app');
const userRepository = require('../repositories/user.repository');
const representativeRepository = require('../repositories/representative.repository');
const database = require('../config/database');
const authConfig = require('../config/auth');

test('new private routes enforce authentication, exact company scope and image limits', async () => {
  const original = { secret: process.env.JWT_SECRET, auth: userRepository.findAuthorizationById,
    scopes: representativeRepository.findActiveScopesByUserId, query: database.query };
  process.env.JWT_SECRET = 'integration-test-secret-that-is-long-enough';
  userRepository.findAuthorizationById = async (id) => ({ accountRole: id === 7 ? 'COMPANY_REPRESENTATIVE' : 'USER', accountStatus: 'ACTIVE', tokenVersion: 0 });
  representativeRepository.findActiveScopesByUserId = async () => [{ companyId: 9 }];
  database.query = async () => ({ rows: [{ avatar_path: null }] });
  const token = (id, role) => jwt.sign({ userId: id, role, tokenVersion: 0 }, process.env.JWT_SECRET,
    { algorithm: authConfig.JWT_ALGORITHM, issuer: authConfig.JWT_ISSUER, audience: authConfig.JWT_AUDIENCE, expiresIn: '1h' });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, bearer, method = 'GET', body) => fetch(`${base}${route}`, {
    method, headers: bearer ? { Authorization: `Bearer ${bearer}` } : {}, body
  });
  try {
    assert.equal((await request('/api/messages/conversations')).status, 401);
    assert.equal((await request('/api/users/8/profile')).status, 401);
    assert.equal((await request('/api/me/avatar', null, 'DELETE')).status, 401);
    const rep = token(7, 'COMPANY_REPRESENTATIVE');
    const other = token(8, 'USER');
    assert.equal((await request('/api/representative/companies/10/logo', rep, 'DELETE')).status, 403);
    assert.equal((await request('/api/representative/companies/9/logo', other, 'DELETE')).status, 403);
    const wrong = new FormData(); wrong.append('avatar', new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'test.svg');
    assert.equal((await request('/api/me/avatar', other, 'PUT', wrong)).status, 400);
    const png = new FormData(); png.append('avatar', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'photo.png');
    assert.equal((await request('/api/me/avatar', other, 'PUT', png)).status, 503);
    const invalidMessage = await fetch(`${base}/api/messages/with/7`, { method: 'POST',
      headers: { Authorization: `Bearer ${other}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messageBody: '  ' }) });
    assert.equal(invalidMessage.status, 400);
    assert.equal((await request('/api/messages/unread-count', other)).status, 503);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    userRepository.findAuthorizationById = original.auth;
    representativeRepository.findActiveScopesByUserId = original.scopes;
    database.query = original.query;
    if (original.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original.secret;
  }
});
