const jobRoleRepository = require('../repositories/job-role.repository');

async function getJobRoles() {
  return jobRoleRepository.findAllJobRoles();
}

module.exports = {
  getJobRoles
};
