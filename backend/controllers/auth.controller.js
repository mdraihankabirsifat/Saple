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

async function forgotPassword(request, response, next) {
  try {
    const result = await authService.forgotPassword(request.body);
    return sendSuccess(
      response,
      200,
      'Password-reset email sent. Check your inbox and spam or junk folder.',
      result
    );
  } catch (error) {
    return next(error);
  }
}

async function resetPassword(request, response, next) {
  try {
    const result = await authService.resetPassword(request.body);
    return sendSuccess(response, 200, 'Password reset successfully. You can now sign in.', result);
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

async function updateProfile(request, response, next) {
  try {
    const user = await authService.updateProfile(request.user.userId, request.body);
    return sendSuccess(response, 200, 'Profile updated successfully', { user });
  } catch (error) {
    return next(error);
  }
}

async function changePassword(request, response, next) {
  try {
    const result = await authService.changePassword(request.user.userId, request.body);
    return sendSuccess(response, 200, 'Password changed successfully', result);
  } catch (error) {
    return next(error);
  }
}

async function logout(request, response, next) {
  try {
    const result = await authService.logout(request.user.userId);
    return sendSuccess(response, 200, 'Signed out successfully', result);
  } catch (error) {
    return next(error);
  }
}

async function getOwnSubmissions(request, response, next) {
  try {
    const submissions = await authService.getOwnSubmissions(request.user.userId);
    return sendSuccess(response, 200, 'Your submissions retrieved successfully', { submissions });
  } catch (error) {
    return next(error);
  }
}

async function getOwnSubmission(request, response, next) {
  try {
    const submission = await authService.getOwnSubmission(
      request.user.userId,
      request.params.submissionId
    );
    return sendSuccess(response, 200, 'Your submission retrieved successfully', { submission });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  updateProfile,
  changePassword,
  logout,
  getOwnSubmissions,
  getOwnSubmission
};
