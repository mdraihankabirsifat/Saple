const database = require('../config/database');

function createRepositoryError(code, message) {
  const error = new Error(message);
  error.sapleCode = code;
  return error;
}

async function createTokenWithDelivery({ userId, tokenHash, expiresMinutes, deliver }) {
  const client = await database.getClient();

  try {
    await client.query('BEGIN');
    const userResult = await client.query(`
      SELECT account_status AS "accountStatus"
      FROM users WHERE user_id = $1 FOR UPDATE
    `, [userId]);
    const user = userResult.rows[0];
    if (!user) throw createRepositoryError('ACCOUNT_NOT_FOUND', 'Account not found');
    if (user.accountStatus !== 'ACTIVE') {
      throw createRepositoryError('ACCOUNT_UNAVAILABLE', `Account is ${user.accountStatus.toLowerCase()}`);
    }

    await client.query(`
      UPDATE password_reset_tokens
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
    `, [userId]);

    const insertResult = await client.query(`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP + ($3 * INTERVAL '1 minute'))
      RETURNING reset_token_id AS "resetTokenId"
    `, [userId, tokenHash, expiresMinutes]);

    await deliver();
    await client.query('COMMIT');
    return { resetTokenId: insertResult.rows[0].resetTokenId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function consumeTokenAndUpdatePassword({ tokenHash, passwordHash }) {
  const client = await database.getClient();

  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT prt.reset_token_id AS "resetTokenId", prt.user_id AS "userId",
        prt.used_at AS "usedAt", prt.revoked_at AS "revokedAt",
        CASE WHEN prt.expires_at <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS "isExpired",
        u.account_status AS "accountStatus"
      FROM password_reset_tokens prt
      JOIN users u ON u.user_id = prt.user_id
      WHERE prt.token_hash = $1
      FOR UPDATE OF prt, u
    `, [tokenHash]);
    const resetToken = result.rows[0];

    if (!resetToken) throw createRepositoryError('INVALID_TOKEN', 'Invalid reset token');
    if (resetToken.usedAt) throw createRepositoryError('USED_TOKEN', 'Reset token already used');
    if (resetToken.revokedAt) throw createRepositoryError('INVALID_TOKEN', 'Reset token revoked');
    if (Number(resetToken.isExpired) === 1) {
      throw createRepositoryError('EXPIRED_TOKEN', 'Reset token expired');
    }
    if (resetToken.accountStatus !== 'ACTIVE') {
      throw createRepositoryError(
        'ACCOUNT_UNAVAILABLE',
        `Account is ${resetToken.accountStatus.toLowerCase()}`
      );
    }

    const passwordResult = await client.query(`
      UPDATE users
      SET password_hash = $1, token_version = token_version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2 AND account_status = 'ACTIVE'
    `, [passwordHash, resetToken.userId]);
    if (passwordResult.rowCount !== 1) {
      throw createRepositoryError('ACCOUNT_UNAVAILABLE', 'Account cannot reset its password');
    }

    await client.query(`
      UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP
      WHERE reset_token_id = $1
    `, [resetToken.resetTokenId]);
    await client.query(`
      UPDATE password_reset_tokens
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND reset_token_id <> $2
        AND used_at IS NULL AND revoked_at IS NULL
    `, [resetToken.userId, resetToken.resetTokenId]);

    await client.query('COMMIT');
    return { userId: resetToken.userId, passwordReset: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { createTokenWithDelivery, consumeTokenAndUpdatePassword };
