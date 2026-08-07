const authService = require('../services/auth.service');
const { sendSuccess } = require('../utils/apiResponse');

async function register(request, response, next) {
  try {
    const user = await authService.register(request.body);
    return sendSuccess(response, 201, 'Account created successfully', { user });
  } catch (error) {
    return next(error);
  }
}

async function login(request, response, next) {
  try {
    const result = await authService.login(request.body);
    return sendSuccess(response, 200, 'Login successful', result);
  } catch (error) {
    return next(error);
  }
}

async function getCurrentUser(request, response, next) {
  try {
    const user = await authService.getCurrentUser(request.user.userId);
    return sendSuccess(response, 200, 'Current user retrieved successfully', { user });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  login,
  getCurrentUser
};
