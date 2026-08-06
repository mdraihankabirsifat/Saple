const { sendFailure } = require('../utils/apiResponse');

function notFound(request, response) {
  return sendFailure(response, 404, 'Endpoint not found');
}

module.exports = notFound;
