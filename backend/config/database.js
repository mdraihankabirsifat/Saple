const oracledb = require('oracledb');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

let pool;

function readPositiveInteger(name, defaultValue) {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue.trim() === '') {
    return defaultValue;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return value;
}

async function initializePool() {
  const requiredVariables = ['DB_USER', 'DB_PASSWORD', 'DB_CONNECT_STRING'];
  const missingVariables = requiredVariables.filter(
    (name) => !process.env[name] || process.env[name].trim() === ''
  );

  if (missingVariables.length > 0) {
    throw new Error(`Missing required database configuration: ${missingVariables.join(', ')}`);
  }

  const poolMin = readPositiveInteger('DB_POOL_MIN', 1);
  const poolMax = readPositiveInteger('DB_POOL_MAX', 5);
  const poolIncrement = readPositiveInteger('DB_POOL_INCREMENT', 1);

  if (poolMax < 1 || poolMin > poolMax || poolIncrement < 1) {
    throw new Error('Database pool settings are invalid');
  }

  pool = await oracledb.createPool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
    poolMin,
    poolMax,
    poolIncrement
  });

  console.log('Saple database pool initialized.');
}

async function getConnection() {
  if (!pool) {
    throw new Error('Database pool has not been initialized');
  }

  return pool.getConnection();
}

async function closePool() {
  if (!pool) {
    return;
  }

  await pool.close(10);
  pool = undefined;
  console.log('Database pool closed.');
}

module.exports = {
  initializePool,
  getConnection,
  closePool
};
