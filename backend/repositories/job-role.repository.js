const database = require('../config/database');

async function findAllJobRoles() {
  let connection;

  try {
    connection = await database.getConnection();
    const result = await connection.execute(`
      SELECT
        role_id AS "roleId",
        role_name AS "roleName",
        role_category AS "roleCategory",
        description AS "description"
      FROM job_roles
      ORDER BY role_name
    `);

    return result.rows;
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

module.exports = {
  findAllJobRoles
};
