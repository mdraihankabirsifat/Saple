const database = require('../config/database');

async function testConnection() {
  const result = await database.query('SELECT 1 AS "connectionTest"');
  return result.rows[0];
}

module.exports = { testConnection };
