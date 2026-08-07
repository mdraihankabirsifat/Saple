const jobRoleService = require('../services/job-role.service');
const { sendSuccess } = require('../utils/apiResponse');

async function getJobRoles(request, response, next) {
  try {
    const roles = await jobRoleService.getJobRoles();
    return sendSuccess(response, 200, 'Job roles retrieved successfully', roles);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getJobRoles
};
