const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../..');

test('Oracle reset-token migration enforces hashed single-use expiring storage', () => {
  const migration = fs.readFileSync(
    path.join(repositoryRoot, 'database/06_create_password_reset_tokens.sql'),
    'utf8'
  );

  assert.match(migration, /CREATE TABLE password_reset_tokens/i);
  assert.match(migration, /token_hash\s+VARCHAR2\(64\)\s+NOT NULL/i);
  assert.match(migration, /UNIQUE \(token_hash\)/i);
  assert.match(migration, /REFERENCES users \(user_id\) ON DELETE CASCADE/i);
  assert.match(migration, /expires_at\s+TIMESTAMP NOT NULL/i);
  assert.match(migration, /used_at\s+TIMESTAMP/i);
  assert.match(migration, /revoked_at\s+TIMESTAMP/i);
  assert.match(migration, /LENGTH\(token_hash\) = 64/i);
  assert.match(migration, /CREATE INDEX ix_password_reset_user_state/i);
  assert.doesNotMatch(migration, /raw_token|token_value|reset_link/i);
});

test('reset-token repository uses bound values and explicit transactions', () => {
  const repository = fs.readFileSync(
    path.join(repositoryRoot, 'backend/repositories/password-reset.repository.js'),
    'utf8'
  );

  assert.match(repository, /:tokenHash/);
  assert.match(repository, /:passwordHash/);
  assert.match(repository, /NUMTODSINTERVAL\(:expiresMinutes, 'MINUTE'\)/);
  assert.match(repository, /FOR UPDATE/);
  assert.match(repository, /connection\.commit\(\)/);
  assert.match(repository, /connection\.rollback\(\)/);
  assert.doesNotMatch(repository, /`[^`]*\$\{tokenHash\}/);
});
