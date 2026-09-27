const healthRepository = require('../repositories/health.repository');
const database = require('../config/database');
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
      'Saple PostgreSQL database connection is healthy',
      { ok: connectionTest.connectionTest, source: database.getSource() }
    );
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getApiHealth,
  getDatabaseHealth
};
