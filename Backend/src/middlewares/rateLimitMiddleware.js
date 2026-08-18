const rateLimit = require('express-rate-limit');

const createLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: () => ({
      success: false,
      message,
      errors: [],
      timestamp: new Date().toISOString()
    }),
    standardHeaders: true,
    legacyHeaders: false
  });
};

const loginLimiter = createLimiter(
  15 * 60 * 1000,
  5,
  'Too many login attempts. Please try again after 15 minutes.'
);

const registerLimiter = createLimiter(
  60 * 60 * 1000,
  5,
  'Too many registration attempts. Please try again after an hour.'
);

const verifyOtpLimiter = createLimiter(
  10 * 60 * 1000,
  5,
  'Too many verification attempts. Please try again later.'
);

const resendOtpLimiter = createLimiter(
  60 * 1000,
  1,
  'Too many resend requests. Please wait before requesting again.'
);

const forgotPasswordLimiter = createLimiter(
  60 * 60 * 1000,
  3,
  'Too many password reset requests. Please try again after an hour.'
);

const resetPasswordLimiter = createLimiter(
  10 * 60 * 1000,
  5,
  'Too many reset attempts. Please try again later.'
);

const refreshTokenLimiter = createLimiter(
  60 * 1000,
  20,
  'Too many refresh requests. Please try again later.'
);

const sessionLimiter = createLimiter(
  60 * 1000,
  60,
  'Too many session requests. Please try again later.'
);

const revokeLimiter = createLimiter(
  15 * 60 * 1000,
  5,
  'Too many token revocation attempts. Please try again after 15 minutes.'
);

const logoutAllLimiter = createLimiter(
  15 * 60 * 1000,
  3,
  'Too many logout-all requests. Please try again after 15 minutes.'
);

module.exports = {
  loginLimiter,
  registerLimiter,
  verifyOtpLimiter,
  resendOtpLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  refreshTokenLimiter,
  sessionLimiter,
  revokeLimiter,
  logoutAllLimiter
};
