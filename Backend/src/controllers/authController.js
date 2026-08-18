const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { validateRegister, validateLogin, validateRefreshToken, validateVerify2fa, validateResend2fa, validateRevokeToken } = require('../validators/authValidator');
const { validateVerifyEmail, validateResendOtp, validateForgotPassword, validateResetPassword } = require('../validators/emailValidator');
const authService = require('../services/authService');

const register = asyncHandler(async (req, res) => {
  const { error, value } = validateRegister(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const result = await authService.register(value, req);
  return ApiResponse.created(res, 'Registration successful', result);
});

const login = asyncHandler(async (req, res) => {
  const { error, value } = validateLogin(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const result = await authService.login(value, req);
  if (result.requires2FA) {
    return ApiResponse.ok(res, result.message, {
      requires2FA: true,
      sessionToken: result.sessionToken,
      expiresIn: result.expiresIn
    });
  }
  return ApiResponse.ok(res, 'Login successful', result);
});

const verifyEmail = asyncHandler(async (req, res) => {
  const { error, value } = validateVerifyEmail(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const result = await authService.verifyEmail(value.email, value.otp);
  return ApiResponse.ok(res, result.message, result);
});

const resendOtp = asyncHandler(async (req, res) => {
  const { error, value } = validateResendOtp(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const result = await authService.resendOtp(value.email);
  return ApiResponse.ok(res, result.message, result);
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { error, value } = validateForgotPassword(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const result = await authService.forgotPassword(value.email);
  return ApiResponse.ok(res, result.message, result);
});

const resetPassword = asyncHandler(async (req, res) => {
  const { error, value } = validateResetPassword(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const result = await authService.resetPassword(value.email, value.otp, value.password);
  return ApiResponse.ok(res, result.message, result);
});

const refreshToken = asyncHandler(async (req, res) => {
  const { error, value } = validateRefreshToken(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const result = await authService.refreshToken(value.refreshToken);
  return ApiResponse.ok(res, 'Tokens refreshed successfully', result);
});

const logout = asyncHandler(async (req, res) => {
  const { error, value } = validateRefreshToken(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const result = await authService.logout(value.refreshToken, req.user.id);
  return ApiResponse.ok(res, result.message, result);
});

const verify2fa = asyncHandler(async (req, res) => {
  const { error, value } = validateVerify2fa(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const result = await authService.verify2fa(value.sessionToken, value.otp, req);
  return ApiResponse.ok(res, '2FA verification successful', result);
});

const resend2faOtp = asyncHandler(async (req, res) => {
  const { error, value } = validateResend2fa(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const result = await authService.resend2faOtp(value.sessionToken);
  return ApiResponse.ok(res, result.message, result);
});

const getSession = asyncHandler(async (req, res) => {
  const result = await authService.sessionInfo(req.user.id, req.user.exp, req.user.iat);
  return ApiResponse.ok(res, 'Session retrieved successfully', result);
});

const revokeToken = asyncHandler(async (req, res) => {
  const { error, value } = validateRevokeToken(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const result = await authService.revokeToken(req.user.id, value.refreshToken);
  return ApiResponse.ok(res, result.message);
});

const logoutAll = asyncHandler(async (req, res) => {
  const result = await authService.logoutAll(req.user.id);
  return ApiResponse.ok(res, result.message, { revokedSessions: result.revokedSessions });
});

module.exports = { register, login, verifyEmail, resendOtp, forgotPassword, resetPassword, refreshToken, logout, verify2fa, resend2faOtp, getSession, revokeToken, logoutAll };
