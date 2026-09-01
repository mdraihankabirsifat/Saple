const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const database = require('../config/database');
const healthRepository = require('../repositories/health.repository');
const app = require('../app');

const originalQuery = database.query;
const originalTestConnection = healthRepository.testConnection;
test.afterEach(() => {
  database.query = originalQuery;
  healthRepository.testConnection = originalTestConnection;
});

test('PostgreSQL database health uses a safe SELECT 1 query', async () => {
  let captured;
  database.query = async (sql, values) => {
    captured = { sql, values };
    return { rows: [{ connectionTest: 1 }] };
  };

  const result = await healthRepository.testConnection();
  assert.deepEqual(result, { connectionTest: 1 });
  assert.equal(captured.sql, 'SELECT 1 AS "connectionTest"');
  assert.equal(captured.values, undefined);
});

test('database health route returns a safe PostgreSQL result', async () => {
  healthRepository.testConnection = async () => ({ connectionTest: 1 });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/health/database`
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.message, 'Supabase PostgreSQL database connection is healthy');
    assert.deepEqual(body.data, { connectionTest: 1 });
    assert.equal(JSON.stringify(body).includes('DATABASE_URL'), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
