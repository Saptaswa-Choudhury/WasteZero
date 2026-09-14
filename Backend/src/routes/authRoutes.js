const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../middlewares/authMiddleware');
const authController = require('../controllers/authController');
const { loginLimiter, registerLimiter, verifyOtpLimiter, resendOtpLimiter, forgotPasswordLimiter, resetPasswordLimiter, refreshTokenLimiter, sessionLimiter, revokeLimiter, logoutAllLimiter } = require('../middlewares/rateLimitMiddleware');

const resend2faLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: 1,
  message: {
    success: false,
    message: 'Please wait 30 seconds before requesting a new code.',
    errors: [],
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/register', registerLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/verify-email', verifyOtpLimiter, authController.verifyEmail);
router.post('/resend-otp', resendOtpLimiter, authController.resendOtp);
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.post('/reset-password', resetPasswordLimiter, authController.resetPassword);
router.post('/refresh-token', refreshTokenLimiter, authController.refreshToken);
router.post('/logout', authMiddleware, authController.logout);
router.post('/verify-2fa', verifyOtpLimiter, authController.verify2fa);
router.post('/resend-2fa', resend2faLimiter, authController.resend2faOtp);
router.get('/session', authMiddleware, sessionLimiter, authController.getSession);
router.post('/revoke', authMiddleware, revokeLimiter, authController.revokeToken);
router.post('/logout-all', authMiddleware, logoutAllLimiter, authController.logoutAll);

module.exports = router;
