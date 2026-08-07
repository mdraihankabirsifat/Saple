const { sendFailure } = require('../utils/apiResponse');

function errorHandler(error, request, response, next) {
  const statusCode = error.statusCode || 500;

  if (statusCode < 500) {
    console.warn(`${request.method} ${request.originalUrl} failed with ${statusCode}: ${error.message}`);
    return sendFailure(response, statusCode, error.message);
  }

  console.error('Unexpected request failure:', error);
  return sendFailure(response, 500, 'An unexpected server error occurred');
}

module.exports = errorHandler;
