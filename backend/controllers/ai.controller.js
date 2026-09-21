const aiService = require('../services/ai.service');
const { sendSuccess } = require('../utils/apiResponse');

function getStatus(request, response) {
  return sendSuccess(response, 200, 'Saple Guide status retrieved successfully', aiService.getStatus());
}

async function ask(request, response, next) {
  try {
    const result = await aiService.ask(request.body);
    return sendSuccess(response, 200, 'Saple Guide replied', result);
  } catch (error) { return next(error); }
}

module.exports = { getStatus, ask };
