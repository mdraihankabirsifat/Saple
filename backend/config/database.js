const { Pool, Client, types } = require('pg');

types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1700, (value) => Number(value));

let primaryPool;
let fallbackPool;
let activePool;
let activeSource = 'supabase';
let switching;
let workerConnectionString;
let workerMode = false;

function readPositiveInteger(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function readBoolean(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function isConnectivityError(error) {
  const codes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH', '57P01', '57P02', '57P03', '08000', '08001', '08003', '08004', '08006']);
  if (codes.has(error?.code)) return true;
  return /connection terminated unexpectedly|connection timeout|timeout exceeded when trying to connect|socket hang up|server closed the connection unexpectedly/i.test(error?.message || '');
}

function makePool(connectionString, ssl) {
  const created = new Pool({
    connectionString,
    max: readPositiveInteger('DB_POOL_MAX', 10),
    idleTimeoutMillis: readPositiveInteger('DB_IDLE_TIMEOUT_MS', 30000),
    connectionTimeoutMillis: readPositiveInteger('DB_CONNECTION_TIMEOUT_MS', 10000),
    ssl: ssl ? { rejectUnauthorized: false } : false
  });
  created.on('error', (error) => console.error('Unexpected idle PostgreSQL client error:', error.message));
  return created;
}

function fallbackEnabled() { return readBoolean('DB_FALLBACK_ENABLED', false); }

function configureWorker({ connectionString } = {}) {
  if (typeof connectionString !== 'string' || !connectionString.trim()) {
    throw new Error('Cloudflare Worker requires HYPERDRIVE.connectionString');
  }
  workerConnectionString = connectionString.trim();
  workerMode = true;
  activePool = undefined;
  activeSource = 'hyperdrive';
}

function isWorkerMode() { return workerMode; }

function workerClient() {
  if (!workerMode || !workerConnectionString) {
    throw new Error('Cloudflare Worker database has not been configured');
  }
  const client = new Client({ connectionString: workerConnectionString });
  let released = false;
  const end = client.end.bind(client);
  client.release = () => {
    if (released) return undefined;
    released = true;
    return end();
  };
  return client;
}

async function workerQuery(text, values = []) {
  const client = workerClient();
  await client.connect();
  try {
    return await client.query(text, values);
  } finally {
    await Promise.resolve(client.release());
  }
}

async function connectFallback() {
  if (!fallbackEnabled()) throw new Error('Local database fallback is disabled');
  const connectionString = process.env.LOCAL_DATABASE_URL?.trim();
  if (!connectionString) throw new Error('LOCAL_DATABASE_URL is required when DB_FALLBACK_ENABLED=true');
  if (!fallbackPool) fallbackPool = makePool(connectionString, readBoolean('LOCAL_DB_SSL', false));
  await fallbackPool.query('SELECT 1 AS ok');
  activePool = fallbackPool;
  activeSource = 'local';
  console.warn('Supabase unavailable. Switching Saple to local PostgreSQL.');
  console.log('Saple database: Local PostgreSQL connected.');
}

async function switchToFallback() {
  if (activeSource === 'local') return;
  if (!switching) switching = connectFallback().finally(() => { switching = undefined; });
  await switching;
}

async function initializePool() {
  if (workerMode) return;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('Missing required database configuration: DATABASE_URL');
  if (fallbackEnabled() && !process.env.LOCAL_DATABASE_URL?.trim()) {
    throw new Error('LOCAL_DATABASE_URL is required when DB_FALLBACK_ENABLED=true');
  }
  primaryPool = makePool(connectionString, readBoolean('DB_SSL', true));
  activePool = primaryPool;
  activeSource = process.env.DB_PRIMARY_SOURCE === 'local' ? 'local' : 'supabase';
  try {
    await primaryPool.query('SELECT 1 AS ok');
    console.log(`Saple database: ${activeSource === 'local' ? 'Local' : 'Supabase'} PostgreSQL connected.`);
  } catch (error) {
    if (activeSource !== 'supabase' || !fallbackEnabled() || !isConnectivityError(error)) {
      await closePool();
      throw error;
    }
    try {
      await switchToFallback();
    } catch (fallbackError) {
      await closePool();
      throw new Error('Neither primary nor local PostgreSQL is reachable', { cause: fallbackError });
    }
  }
}

function requirePool() {
  if (!activePool) throw new Error('Database pool has not been initialized');
  return activePool;
}

async function query(text, values = []) {
  if (workerMode) return workerQuery(text, values);
  const selected = requirePool();
  try { return await selected.query(text, values); }
  catch (error) {
    if (selected !== primaryPool || !fallbackEnabled() || !isConnectivityError(error)) throw error;
    if (activeSource === 'supabase') await switchToFallback();
    if (activeSource !== 'local') throw error;
    return activePool.query(text, values);
  }
}

async function getClient() {
  if (workerMode) {
    const client = workerClient();
    await client.connect();
    return client;
  }
  const selected = requirePool();
  try { return await selected.connect(); }
  catch (error) {
    if (selected !== primaryPool || !fallbackEnabled() || !isConnectivityError(error)) throw error;
    if (activeSource === 'supabase') await switchToFallback();
    if (activeSource !== 'local') throw error;
    return activePool.connect();
  }
}

// Messaging must never be sent to the independent local demo database.
function requireCloud() {
  if (workerMode) return true;
  if (activeSource !== 'supabase' || !primaryPool) {
    const error = new Error('Messaging is temporarily unavailable while using the local database');
    error.statusCode = 503;
    throw error;
  }
  return primaryPool;
}
async function cloudQuery(text, values = []) {
  if (workerMode) return workerQuery(text, values);
  return requireCloud().query(text, values);
}
async function cloudClient() {
  if (workerMode) {
    const client = workerClient();
    await client.connect();
    return client;
  }
  return requireCloud().connect();
}
async function withCloudTransaction(work) {
  const client = await cloudClient();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await Promise.resolve(client.release());
  }
}

async function withTransaction(work, existingClient = null) {
  if (existingClient) return work(existingClient);
  const client = await module.exports.getClient();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch (rollbackError) { console.error('Rollback failed after a transaction error:', rollbackError.message); }
    throw error;
  } finally {
    await Promise.resolve(client.release());
  }
}

async function closePool() {
  if (workerMode) {
    workerConnectionString = undefined;
    workerMode = false;
    activeSource = 'supabase';
    return;
  }
  const pools = [...new Set([primaryPool, fallbackPool].filter(Boolean))];
  primaryPool = fallbackPool = activePool = undefined;
  activeSource = 'supabase';
  await Promise.all(pools.map((item) => item.end()));
}

function getSource() { return activeSource; }
module.exports = {
  initializePool,
  configureWorker,
  isWorkerMode,
  query,
  getClient,
  withTransaction,
  withCloudTransaction,
  closePool,
  getSource,
  cloudQuery,
  cloudClient,
  isConnectivityError
};
