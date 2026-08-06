const database = require('../config/database');

async function testConnection() {
  let connection;

  try {
    connection = await database.getConnection();
    const result = await connection.execute(`
      SELECT 1 AS "connectionTest"
      FROM dual
    `);

    return result.rows[0];
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

module.exports = {
  testConnection
};
