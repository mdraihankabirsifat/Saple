const salaryService = require('../services/salary.service');
const { sendSuccess } = require('../utils/apiResponse');

async function submitSalary(request, response, next) {
  try {
    const submission = await salaryService.submitSalary(
      request.user.userId,
      request.params.companyId,
      request.body
    );

    return sendSuccess(response, 201, 'Salary submitted for review', submission);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  submitSalary
};
