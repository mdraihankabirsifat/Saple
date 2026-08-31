const path = require('path');
const bcrypt = require('bcrypt');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
  quiet: true
});

const database = require('../config/database');

const PASSWORD_SALT_ROUNDS = 12;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith('replace_with_')) {
    throw new Error(`${name} must be set to a private demo value in backend/.env`);
  }
  return value;
}

async function upsertAccount(client, account) {
  const passwordHash = await bcrypt.hash(account.password, PASSWORD_SALT_ROUNDS);
  const result = await client.query(`
    INSERT INTO users (
      full_name, email, password_hash, user_type, account_role, account_status
    ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
    ON CONFLICT (email) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      password_hash = EXCLUDED.password_hash,
      user_type = EXCLUDED.user_type,
      account_role = EXCLUDED.account_role,
      account_status = 'ACTIVE',
      token_version = users.token_version + 1,
      updated_at = CURRENT_TIMESTAMP
    RETURNING user_id AS "userId"
  `, [
    account.fullName,
    account.email.toLowerCase(),
    passwordHash,
    account.userType,
    account.accountRole
  ]);

  const userId = result.rows[0].userId;
  if (account.userType === 'EMPLOYEE') {
    await client.query(`
      INSERT INTO employees (user_id, employment_status)
      VALUES ($1, 'CURRENT')
      ON CONFLICT (user_id) DO UPDATE SET employment_status = 'CURRENT'
    `, [userId]);
  }
  return userId;
}

async function main() {
  const accounts = [
    {
      fullName: 'Saple Demo Normal User',
      email: process.env.DEMO_NORMAL_EMAIL?.trim() || 'saple.demo.normal@example.invalid',
      password: required('DEMO_NORMAL_PASSWORD'),
      userType: 'NORMAL',
      accountRole: 'USER'
    },
    {
      fullName: 'Saple Demo Employee',
      email: process.env.DEMO_EMPLOYEE_EMAIL?.trim() || 'saple.demo.employee@example.invalid',
      password: required('DEMO_EMPLOYEE_PASSWORD'),
      userType: 'EMPLOYEE',
      accountRole: 'USER'
    },
    {
      fullName: 'Saple Demo Administrator',
      email: process.env.DEMO_ADMIN_EMAIL?.trim() || 'saple.demo.admin@example.invalid',
      password: required('DEMO_ADMIN_PASSWORD'),
      userType: 'NORMAL',
      accountRole: 'ADMIN'
    }
  ];

  await database.initializePool();
  const client = await database.getClient();
  try {
    await client.query('BEGIN');
    for (const account of accounts) await upsertAccount(client, account);
    await client.query('COMMIT');
    console.log('Demo NORMAL, EMPLOYEE, and ADMIN accounts are ready.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await database.closePool();
  }
}

main().catch((error) => {
  console.error('Demo account provisioning failed:', error.message);
  process.exitCode = 1;
});
