const aiService = require('../services/ai.service');
const { sendSuccess } = require('../utils/apiResponse');

async function getStatus(request, response, next) {
  try {
    return sendSuccess(response, 200, 'Saple Guide status retrieved successfully', await aiService.getStatus(request.user || null));
  } catch (error) { return next(error); }
}

async function ask(request, response, next) {
  try {
    const result = await aiService.ask(request.body, request.user || null);
    return sendSuccess(response, 200, 'Saple Guide replied', result);
  } catch (error) { return next(error); }
}

module.exports = { getStatus, ask };
