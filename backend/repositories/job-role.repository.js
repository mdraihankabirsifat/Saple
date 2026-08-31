const database = require('../config/database');

async function findAllJobRoles() {
  const result = await database.query(`
    SELECT role_id AS "roleId", role_name AS "roleName",
      role_category AS "roleCategory", description
    FROM job_roles
    ORDER BY role_name
  `);
  return result.rows;
}

module.exports = { findAllJobRoles };
