const { sendFailure } = require('../utils/apiResponse');

function errorHandler(error, request, response, next) {
  const statusCode = error.statusCode || 500;

  console.error('Request failed:', error);

  if (statusCode < 500) {
    return sendFailure(response, statusCode, error.message);
  }

  return sendFailure(response, 500, 'An unexpected server error occurred');
}

module.exports = errorHandler;
