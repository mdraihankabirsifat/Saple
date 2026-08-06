function sendSuccess(response, statusCode, message, data) {
  const body = {
    success: true,
    message
  };

  if (data !== undefined) {
    body.data = data;
  }

  return response.status(statusCode).json(body);
}

function sendFailure(response, statusCode, message, detail) {
  const body = {
    success: false,
    message
  };

  if (detail !== undefined) {
    body.detail = detail;
  }

  return response.status(statusCode).json(body);
}

module.exports = {
  sendSuccess,
  sendFailure
};
