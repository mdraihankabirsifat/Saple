const { sendFailure } = require('../utils/apiResponse');

// Malformed or oversized bodies arrive here as http-errors from body-parser.
// They are turned into the same JSON envelope as everything else, with a
// message that says what to fix and nothing about the server.
const BODY_PARSER_FAILURES = Object.freeze({
  'entity.too.large': [413, 'The request body is too large'],
  'entity.parse.failed': [400, 'The request body is not valid JSON'],
  'encoding.unsupported': [415, 'The request body encoding is not supported'],
  'request.aborted': [400, 'The request was interrupted before it completed']
});

function errorHandler(error, request, response, next) {
  const bodyFailure = BODY_PARSER_FAILURES[error.type];

  if (bodyFailure) {
    const [bodyStatus, bodyMessage] = bodyFailure;
    console.warn(`${request.method} ${request.originalUrl} rejected with ${bodyStatus}: ${error.type}`);
    return sendFailure(response, bodyStatus, bodyMessage);
  }

  const statusCode = error.statusCode || 500;
  const isControlled = Number.isInteger(error.statusCode)
    && error.statusCode >= 400
    && error.statusCode <= 599;

  if (isControlled) {
    console.warn(`${request.method} ${request.originalUrl} failed with ${statusCode}: ${error.message}`);
    return sendFailure(response, statusCode, error.message);
  }

  // Unexpected failures are logged in full on the server and reported to the
  // caller as one sentence. No stack trace, SQL text or driver detail leaves
  // the process, in development or in production.
  console.error('Unexpected request failure:', error);
  return sendFailure(response, 500, 'An unexpected server error occurred');
}

module.exports = errorHandler;
