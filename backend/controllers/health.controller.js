const healthRepository = require('../repositories/health.repository');
const { sendSuccess } = require('../utils/apiResponse');

function getApiHealth(request, response) {
  return sendSuccess(response, 200, 'Saple API is running');
}

async function getDatabaseHealth(request, response, next) {
  try {
    const connectionTest = await healthRepository.testConnection();

    return sendSuccess(
      response,
      200,
      'Oracle database connection is healthy',
      connectionTest
    );
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getApiHealth,
  getDatabaseHealth
};
