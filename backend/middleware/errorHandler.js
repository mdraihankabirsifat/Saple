const { sendFailure } = require('../utils/apiResponse');

function errorHandler(error, request, response, next) {
  const statusCode = error.statusCode || 500;
  const isControlled = Number.isInteger(error.statusCode)
    && error.statusCode >= 400
    && error.statusCode <= 599;

  if (isControlled) {
    console.warn(`${request.method} ${request.originalUrl} failed with ${statusCode}: ${error.message}`);
    return sendFailure(response, statusCode, error.message);
  }

  console.error('Unexpected request failure:', error);
  return sendFailure(response, 500, 'An unexpected server error occurred');
}

module.exports = errorHandler;
