const { Pool, types } = require('pg');

// Saple IDs and constrained NUMERIC values remain inside JavaScript's safe range.
// Parsing them here preserves the existing numeric API response shapes.
types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1700, (value) => Number(value));

let pool;

function readPositiveInteger(name, defaultValue) {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue.trim() === '') return defaultValue;

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function readBoolean(name, defaultValue) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue.trim() === '') return defaultValue;
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

async function initializePool() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('Missing required database configuration: DATABASE_URL');
  }

  pool = new Pool({
    connectionString,
    max: readPositiveInteger('DB_POOL_MAX', 10),
    idleTimeoutMillis: readPositiveInteger('DB_IDLE_TIMEOUT_MS', 30000),
    connectionTimeoutMillis: readPositiveInteger('DB_CONNECTION_TIMEOUT_MS', 10000),
    ssl: readBoolean('DB_SSL', true) ? { rejectUnauthorized: false } : false
  });

  pool.on('error', (error) => {
    console.error('Unexpected idle PostgreSQL client error:', error.message);
  });

  try {
    await pool.query('SELECT 1 AS ok');
    console.log('Saple PostgreSQL pool initialized.');
  } catch (error) {
    await pool.end();
    pool = undefined;
    throw error;
  }
}

function requirePool() {
  if (!pool) throw new Error('Database pool has not been initialized');
  return pool;
}

async function query(text, values = []) {
  return requirePool().query(text, values);
}

async function getClient() {
  return requirePool().connect();
}

// Every runtime INSERT, UPDATE and DELETE runs inside an explicit transaction,
// including the single-statement ones: BEGIN, the caller's work, then COMMIT,
// or ROLLBACK if anything throws. The client is always released.
//
// Pass an existing client (from a caller that already opened a transaction)
// and the work simply joins it: no nested BEGIN, one COMMIT at the outer
// level, so related writes and their notifications still commit together.
async function withTransaction(work, existingClient = null) {
  if (existingClient) return work(existingClient);

  // Through module.exports so a test can substitute getClient, the same seam
  // the repository tests already use.
  const client = await module.exports.getClient();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // A failed ROLLBACK (a dropped connection, say) must not hide the original
    // error, which is the one the caller needs to see.
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Rollback failed after a transaction error:', rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = undefined;
  console.log('Database pool closed.');
}

module.exports = { initializePool, query, getClient, withTransaction, closePool };
