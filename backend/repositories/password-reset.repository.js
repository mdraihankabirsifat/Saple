const oracledb = require('oracledb');
const database = require('../config/database');

function createRepositoryError(code, message) {
  const error = new Error(message);
  error.sapleCode = code;
  return error;
}

async function createTokenWithDelivery({ userId, tokenHash, expiresMinutes, deliver }) {
  let connection;

  try {
    connection = await database.getConnection();
    const userResult = await connection.execute(
      `SELECT account_status AS "accountStatus"
       FROM users
       WHERE user_id = :userId
       FOR UPDATE`,
      { userId }
    );
    const user = userResult.rows[0];

    if (!user) throw createRepositoryError('ACCOUNT_NOT_FOUND', 'Account not found');
    if (user.accountStatus !== 'ACTIVE') {
      throw createRepositoryError('ACCOUNT_UNAVAILABLE', `Account is ${user.accountStatus.toLowerCase()}`);
    }

    await connection.execute(
      `UPDATE password_reset_tokens
       SET revoked_at = SYSTIMESTAMP
       WHERE user_id = :userId
         AND used_at IS NULL
         AND revoked_at IS NULL
         AND expires_at > SYSTIMESTAMP`,
      { userId }
    );

    const insertResult = await connection.execute(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (:userId, :tokenHash, SYSTIMESTAMP + NUMTODSINTERVAL(:expiresMinutes, 'MINUTE'))
       RETURNING reset_token_id INTO :resetTokenId`,
      {
        userId,
        tokenHash,
        expiresMinutes,
        resetTokenId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      }
    );

    await deliver();
    await connection.commit();
    return { resetTokenId: insertResult.outBinds.resetTokenId[0] };
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) await connection.close();
  }
}

async function consumeTokenAndUpdatePassword({ tokenHash, passwordHash }) {
  let connection;

  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT
         prt.reset_token_id AS "resetTokenId",
         prt.user_id AS "userId",
         prt.used_at AS "usedAt",
         prt.revoked_at AS "revokedAt",
         CASE WHEN prt.expires_at <= SYSTIMESTAMP THEN 1 ELSE 0 END AS "isExpired",
         u.account_status AS "accountStatus"
       FROM password_reset_tokens prt
       JOIN users u ON u.user_id = prt.user_id
       WHERE prt.token_hash = :tokenHash
       FOR UPDATE`,
      { tokenHash }
    );
    const resetToken = result.rows[0];

    if (!resetToken) throw createRepositoryError('INVALID_TOKEN', 'Invalid reset token');
    if (resetToken.usedAt) throw createRepositoryError('USED_TOKEN', 'Reset token already used');
    if (resetToken.revokedAt) throw createRepositoryError('INVALID_TOKEN', 'Reset token revoked');
    if (Number(resetToken.isExpired) === 1) throw createRepositoryError('EXPIRED_TOKEN', 'Reset token expired');
    if (resetToken.accountStatus !== 'ACTIVE') {
      throw createRepositoryError('ACCOUNT_UNAVAILABLE', `Account is ${resetToken.accountStatus.toLowerCase()}`);
    }

    const passwordResult = await connection.execute(
      `UPDATE users
       SET password_hash = :passwordHash, updated_at = SYSTIMESTAMP
       WHERE user_id = :userId AND account_status = 'ACTIVE'`,
      { passwordHash, userId: resetToken.userId }
    );

    if (passwordResult.rowsAffected !== 1) {
      throw createRepositoryError('ACCOUNT_UNAVAILABLE', 'Account cannot reset its password');
    }

    await connection.execute(
      `UPDATE password_reset_tokens
       SET used_at = SYSTIMESTAMP
       WHERE reset_token_id = :resetTokenId`,
      { resetTokenId: resetToken.resetTokenId }
    );
    await connection.execute(
      `UPDATE password_reset_tokens
       SET revoked_at = SYSTIMESTAMP
       WHERE user_id = :userId
         AND reset_token_id <> :resetTokenId
         AND used_at IS NULL
         AND revoked_at IS NULL`,
      { userId: resetToken.userId, resetTokenId: resetToken.resetTokenId }
    );

    await connection.commit();
    return { userId: resetToken.userId, passwordReset: true };
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  createTokenWithDelivery,
  consumeTokenAndUpdatePassword
};
