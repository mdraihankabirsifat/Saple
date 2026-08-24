const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../..');

test('final Oracle schema enforces hashed single-use expiring reset-token storage', () => {
  const schema = fs.readFileSync(
    path.join(repositoryRoot, 'database/sql/01_final_schema.sql'),
    'utf8'
  );

  assert.match(schema, /CREATE TABLE password_reset_tokens/i);
  assert.match(schema, /CONSTRAINT pk_password_reset_tokens PRIMARY KEY \(reset_token_id\)/i);
  assert.match(schema, /CONSTRAINT fk_password_reset_user FOREIGN KEY \(user_id\)[\s\S]*?REFERENCES users \(user_id\) ON DELETE CASCADE/i);
  assert.match(schema, /CONSTRAINT uk_password_reset_token_hash UNIQUE \(token_hash\)/i);
  assert.match(schema, /CONSTRAINT ck_password_reset_token_hash CHECK \(LENGTH\(token_hash\) = 64\)/i);
  assert.match(schema, /CONSTRAINT ck_password_reset_expiry CHECK \(expires_at > created_at\)/i);
  assert.match(schema, /CONSTRAINT ck_password_reset_state CHECK \(used_at IS NULL OR revoked_at IS NULL\)/i);
  assert.match(schema, /CREATE INDEX ix_password_reset_user_state[\s\S]*?ON password_reset_tokens \(user_id, expires_at, used_at, revoked_at\)/i);
  assert.doesNotMatch(schema, /raw_token|token_value|reset_link/i);
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
