const bcrypt = require('bcrypt');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { sanitizeUser } = require('../utils/token');
const { generateOtp, hashOtp, verifyOtp } = require('./otpService');
const { sendOtpEmail } = require('./emailService');
const tokenService = require('./tokenService');
const sessionStore = require('./sessionStore');
const {
  OTP_EXPIRY_MINUTES,
  MAX_OTP_ATTEMPTS,
  MAX_OTP_RESEND,
  OTP_COOLDOWN_SECONDS,
  OTP_LOCK_HOURS,
  SALT_ROUNDS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_LOCK_MINUTES,
  TWO_FA_OTP_LENGTH,
  TWO_FA_OTP_EXPIRY_SECONDS,
  TWO_FA_MAX_ATTEMPTS,
  TWO_FA_LOCK_HOURS,
  TWO_FA_RESEND_COOLDOWN,
  TWO_FA_MAX_RESENDS
} = require('../constants/security');

const maskEmail = (email) => {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
};

const register = async ({ name, email, password, role, skills, bio }, req = {}) => {
  const existingUser = await User.findOne({ email }).lean();
  if (existingUser) {
    throw ApiError.conflict('A user with this email already exists');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role,
    skills: skills || [],
    bio: bio || ''
  });

  let emailWarning = false;
  try {
    await generateAndStoreOtp(user);
  } catch (err) {
    emailWarning = true;
  }

  const accessToken = tokenService.generateAccessToken(user._id, user.role, user.name);
  const userAgent = req.headers ? req.headers['user-agent'] || '' : '';
  const ipAddress = req.ip || req.connection?.remoteAddress || '';
  const { token: refreshToken, expiresAt } = await tokenService.generateRefreshToken(
    user._id, false, userAgent, ipAddress
  );
  const result = { accessToken, refreshToken, expiresAt, user: sanitizeUser(user) };

  if (emailWarning) {
    result.warning = 'Account created but verification email could not be sent. You can request a new OTP from the resend endpoint.';
  }

  return result;
};

const login = async ({ email, password, rememberMe }, req = {}) => {
  const user = await User.findOne({ email }).select('+password +loginAttempts +loginLockedUntil');
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (!user.isEmailVerified) {
    throw ApiError.forbidden('Please verify your email before logging in');
  }

  if (user.isSuspended) {
    throw ApiError.forbidden('Your account has been suspended. Please contact an administrator.');
  }

  if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
    const remainingMs = user.loginLockedUntil.getTime() - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    throw ApiError.tooMany(`Account locked. Try again in ${remainingMin} minutes`);
  }

  if (user.loginLockedUntil && user.loginLockedUntil <= new Date()) {
    await User.updateOne(
      { _id: user._id },
      { $set: { loginAttempts: 0, loginLockedUntil: null } }
    );
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    await User.updateOne(
      { _id: user._id },
      { $inc: { loginAttempts: 1 } }
    );

    const updatedUser = await User.findById(user._id).select('loginAttempts').lean();
    if (updatedUser.loginAttempts >= LOGIN_MAX_ATTEMPTS) {
      await User.updateOne(
        { _id: user._id },
        { $set: { loginLockedUntil: new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000) } }
      );
    }

    throw ApiError.unauthorized('Invalid email or password');
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { loginAttempts: 0, loginLockedUntil: null } }
  );

  if (user.twoFactorEnabled) {
    const plainOtp = generateOtp(TWO_FA_OTP_LENGTH);
    const hashedOtp = await hashOtp(plainOtp);

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          twoFactorOtp: hashedOtp,
          twoFactorOtpExpires: new Date(Date.now() + TWO_FA_OTP_EXPIRY_SECONDS * 1000),
          twoFactorAttempts: 0,
          twoFactorLockedUntil: null,
          lastTwoFactorSentAt: new Date()
        }
      }
    );

    const userAgent = req.headers ? req.headers['user-agent'] || '' : '';
    const ipAddress = req.ip || req.connection?.remoteAddress || '';
    const { sessionToken, expiresAt } = sessionStore.createSession({
      userId: user._id,
      rememberMe,
      ipAddress,
      userAgent
    });

    sessionStore.updateSession(sessionToken, { otpGeneratedAt: Date.now() });

    try {
      await sendOtpEmail(user.email, plainOtp, 'twoFactor');
    } catch {
      sessionStore.deleteSession(sessionToken);
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            twoFactorOtp: null,
            twoFactorOtpExpires: null,
            twoFactorAttempts: 0,
            twoFactorLockedUntil: null,
            lastTwoFactorSentAt: null
          }
        }
      );
      logger.error(`2FA email send failed for ${maskEmail(user.email)} — login aborted`);
      throw ApiError.internal('Unable to send verification code. Please try again.');
    }

    return {
      requires2FA: true,
      sessionToken,
      expiresIn: TWO_FA_OTP_EXPIRY_SECONDS,
      message: 'Two-factor authentication required. Please check your email for the verification code.'
    };
  }

  const accessToken = tokenService.generateAccessToken(user._id, user.role, user.name);
  const userAgent = req.headers ? req.headers['user-agent'] || '' : '';
  const ipAddress = req.ip || req.connection?.remoteAddress || '';
  const { token: refreshToken, expiresAt } = await tokenService.generateRefreshToken(
    user._id, rememberMe, userAgent, ipAddress
  );

  return { accessToken, refreshToken, expiresAt, user: sanitizeUser(user) };
};

const verify2fa = async (sessionToken, otp, req = {}) => {
  const session = sessionStore.getSession(sessionToken);
  if (!session) {
    throw ApiError.badRequest('Session expired or invalid. Please log in again.');
  }

  const user = await User.findById(session.userId).select('+twoFactorOtp');
  if (!user) {
    sessionStore.deleteSession(sessionToken);
    throw ApiError.unauthorized('User not found');
  }

  if (user.twoFactorLockedUntil && user.twoFactorLockedUntil > new Date()) {
    const remainingMs = user.twoFactorLockedUntil.getTime() - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    throw ApiError.tooMany(`Too many 2FA attempts. Try again in ${remainingMin} minutes`);
  }

  if (user.twoFactorLockedUntil && user.twoFactorLockedUntil <= new Date()) {
    await User.updateOne(
      { _id: user._id },
      { $set: { twoFactorAttempts: 0, twoFactorLockedUntil: null } }
    );
  }

  if (!user.twoFactorOtpExpires || user.twoFactorOtpExpires < new Date()) {
    sessionStore.deleteSession(sessionToken);
    throw ApiError.badRequest('OTP expired. Please request a new code.');
  }

  const isValid = await verifyOtp(otp, user.twoFactorOtp);
  if (!isValid) {
    await User.updateOne(
      { _id: user._id },
      { $inc: { twoFactorAttempts: 1 } }
    );

    const updatedUser = await User.findById(user._id).select('twoFactorAttempts').lean();
    if (updatedUser.twoFactorAttempts >= TWO_FA_MAX_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + TWO_FA_LOCK_HOURS * 60 * 60 * 1000);
      await User.updateOne(
        { _id: user._id },
        { $set: { twoFactorLockedUntil: lockUntil } }
      );
      sessionStore.deleteSession(sessionToken);
      throw ApiError.tooMany('Too many invalid attempts. 2FA locked for 1 hour.');
    }

    throw ApiError.badRequest('Invalid verification code');
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        twoFactorOtp: null,
        twoFactorOtpExpires: null,
        twoFactorAttempts: 0,
        twoFactorLockedUntil: null
      }
    }
  );

  sessionStore.deleteSession(sessionToken);

  const userAgent = req.headers ? req.headers['user-agent'] || '' : '';
  const ipAddress = req.ip || req.connection?.remoteAddress || '';
  const accessToken = tokenService.generateAccessToken(user._id, user.role, user.name);
  const { token: refreshToken, expiresAt } = await tokenService.generateRefreshToken(
    user._id, session.rememberMe, userAgent, ipAddress
  );

  return { accessToken, refreshToken, expiresAt, user: sanitizeUser(user) };
};

const resend2faOtp = async (sessionToken) => {
  const session = sessionStore.getSession(sessionToken);
  if (!session) {
    throw ApiError.badRequest('Session expired or invalid. Please log in again.');
  }

  const user = await User.findById(session.userId);
  if (!user) {
    sessionStore.deleteSession(sessionToken);
    throw ApiError.unauthorized('User not found');
  }

  if (session.otpGeneratedAt && (Date.now() - session.otpGeneratedAt) < TWO_FA_RESEND_COOLDOWN * 1000) {
    const remaining = Math.ceil((TWO_FA_RESEND_COOLDOWN * 1000 - (Date.now() - session.otpGeneratedAt)) / 1000);
    throw ApiError.tooMany(`Please wait ${remaining} seconds before requesting a new code.`);
  }

  if (session.resendCount >= TWO_FA_MAX_RESENDS) {
    sessionStore.deleteSession(sessionToken);
    throw ApiError.tooMany('Maximum resend limit reached. Please log in again.');
  }

  const plainOtp = generateOtp(TWO_FA_OTP_LENGTH);
  const hashedOtp = await hashOtp(plainOtp);

  const fullUser = await User.findById(user._id).select('+twoFactorOtp');
  const oldOtp = fullUser.twoFactorOtp;
  const oldExpiry = fullUser.twoFactorOtpExpires;

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        twoFactorOtp: hashedOtp,
        twoFactorOtpExpires: new Date(Date.now() + TWO_FA_OTP_EXPIRY_SECONDS * 1000),
        twoFactorAttempts: 0,
        twoFactorLockedUntil: null,
        lastTwoFactorSentAt: new Date()
      }
    }
  );

  try {
    await sendOtpEmail(user.email, plainOtp, 'twoFactor');
  } catch {
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          twoFactorOtp: oldOtp,
          twoFactorOtpExpires: oldExpiry,
          twoFactorAttempts: 0,
          lastTwoFactorSentAt: null
        }
      }
    );
    logger.error(`2FA resend email failed for ${maskEmail(user.email)} — OTP reverted`);
    throw ApiError.internal('Unable to send verification code. Please try again.');
  }

  sessionStore.updateSession(sessionToken, {
    otpGeneratedAt: Date.now(),
    resendCount: session.resendCount + 1
  });

  return { message: 'Verification code resent. Please check your email.' };
};

const verifyEmail = async (email, otp) => {
  const user = await User.findOne({ email }).select('+emailVerificationOtp');
  if (!user) {
    throw ApiError.notFound('User not found with this email');
  }

  if (user.isEmailVerified) {
    return { message: 'Email already verified' };
  }

  if (user.emailVerificationLockedUntil) {
    if (user.emailVerificationLockedUntil > new Date()) {
      const remainingMs = user.emailVerificationLockedUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      throw ApiError.badRequest(`Too many attempts. Try again in ${remainingMin} minutes`);
    }

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          emailVerificationAttempts: 0,
          emailVerificationLockedUntil: null
        }
      }
    );
  }

  if (!user.emailVerificationOtpExpires || user.emailVerificationOtpExpires < new Date()) {
    throw ApiError.badRequest('OTP has expired. Please request a new one');
  }

  const isValid = await verifyOtp(otp, user.emailVerificationOtp);
  if (!isValid) {
    const attempts = (user.emailVerificationAttempts || 0) + 1;

    const updateData = { emailVerificationAttempts: attempts };

    if (attempts >= MAX_OTP_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + OTP_LOCK_HOURS * 60 * 60 * 1000);
      updateData.emailVerificationLockedUntil = lockUntil;
    }

    await User.updateOne({ _id: user._id }, updateData);

    throw ApiError.badRequest('Invalid OTP');
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        isEmailVerified: true,
        emailVerificationOtp: null,
        emailVerificationOtpExpires: null,
        emailVerificationAttempts: 0,
        emailVerificationResendCount: 0,
        emailVerificationLockedUntil: null,
        lastOtpSentAt: null
      }
    }
  );

  return { message: 'Email verified successfully' };
};

const resendOtp = async (email) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw ApiError.notFound('User not found with this email');
  }

  if (user.isEmailVerified) {
    throw ApiError.badRequest('Email is already verified');
  }

  if (user.emailVerificationResendCount >= MAX_OTP_RESEND) {
    throw ApiError.badRequest('Maximum resend limit reached. Please try again later');
  }

  if (user.lastOtpSentAt) {
    const cooldownMs = OTP_COOLDOWN_SECONDS * 1000;
    const timeSinceLastOtp = Date.now() - user.lastOtpSentAt.getTime();
    if (timeSinceLastOtp < cooldownMs) {
      const remainingSec = Math.ceil((cooldownMs - timeSinceLastOtp) / 1000);
      throw ApiError.badRequest(`Please wait ${remainingSec} seconds before requesting a new OTP`);
    }
  }

  await generateAndStoreOtp(user);
  await User.updateOne(
    { _id: user._id },
    { $inc: { emailVerificationResendCount: 1 } }
  );

  return { message: 'OTP sent successfully' };
};

const generateAndStoreOtp = async (user) => {
  const otp = generateOtp();
  const hashedOtp = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await sendOtpEmail(user.email, otp);

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        emailVerificationOtp: hashedOtp,
        emailVerificationOtpExpires: expiresAt,
        emailVerificationAttempts: 0,
        lastOtpSentAt: new Date()
      }
    }
  );
};

const forgotPassword = async (email) => {
  const user = await User.findOne({ email }).lean();
  if (!user) {
    return { message: 'If an account exists with this email, a reset code has been sent' };
  }

  if (user.lastPasswordResetAt) {
    const cooldownMs = OTP_COOLDOWN_SECONDS * 1000;
    const timeSinceLastReset = Date.now() - new Date(user.lastPasswordResetAt).getTime();
    if (timeSinceLastReset < cooldownMs) {
      const remainingSec = Math.ceil((cooldownMs - timeSinceLastReset) / 1000);
      throw ApiError.badRequest(`Please wait ${remainingSec} seconds before requesting a new reset code`);
    }
  }

  const otp = generateOtp();
  const hashedOtp = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await sendOtpEmail(user.email, otp, 'forgotPassword');

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordResetOtp: hashedOtp,
        passwordResetOtpExpires: expiresAt,
        passwordResetAttempts: 0,
        passwordResetResendCount: 0,
        passwordResetLockedUntil: null,
        lastPasswordResetAt: new Date()
      }
    }
  );

  return { message: 'If an account exists with this email, a reset code has been sent' };
};

const resetPassword = async (email, otp, newPassword) => {
  const user = await User.findOne({ email }).select('+passwordResetOtp');
  if (!user) {
    throw ApiError.badRequest('Invalid request');
  }

  if (user.passwordResetLockedUntil) {
    if (user.passwordResetLockedUntil > new Date()) {
      const remainingMs = user.passwordResetLockedUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      throw ApiError.badRequest(`Too many attempts. Try again in ${remainingMin} minutes`);
    }

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordResetAttempts: 0,
          passwordResetLockedUntil: null
        }
      }
    );
  }

  if (!user.passwordResetOtpExpires || user.passwordResetOtpExpires < new Date()) {
    throw ApiError.badRequest('Reset code has expired. Please request a new one');
  }

  const isValid = await verifyOtp(otp, user.passwordResetOtp);
  if (!isValid) {
    const attempts = (user.passwordResetAttempts || 0) + 1;

    const updateData = { passwordResetAttempts: attempts };

    if (attempts >= MAX_OTP_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + OTP_LOCK_HOURS * 60 * 60 * 1000);
      updateData.passwordResetLockedUntil = lockUntil;
    }

    await User.updateOne({ _id: user._id }, updateData);

    throw ApiError.badRequest('Invalid reset code');
  }

  const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        password: hashedPassword,
        passwordResetOtp: null,
        passwordResetOtpExpires: null,
        passwordResetAttempts: 0,
        passwordResetResendCount: 0,
        passwordResetLockedUntil: null,
        lastPasswordResetAt: new Date()
      }
    }
  );

  return { message: 'Password updated successfully. Please log in again using your new password.' };
};

const refreshToken = async (plainRefreshToken) => {
  const doc = await tokenService.verifyRefreshToken(plainRefreshToken);
  if (!doc) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findById(doc.user).lean();
  if (!user) {
    throw ApiError.unauthorized('User not found');
  }

  if (!user.isEmailVerified) {
    throw ApiError.forbidden('Email not verified. Please verify your email before refreshing session');
  }

  if (user.isSuspended) {
    throw ApiError.forbidden('Your account has been suspended. Please contact an administrator.');
  }

  const accessToken = tokenService.generateAccessToken(user._id, user.role, user.name);
  const { token: newRefreshToken, expiresAt } = await tokenService.rotateRefreshToken(
    plainRefreshToken,
    user._id,
    doc.rememberMe,
    doc.userAgent,
    doc.ipAddress
  );

  return { accessToken, refreshToken: newRefreshToken, expiresAt, user: sanitizeUser(user) };
};

const logout = async (plainRefreshToken, userId) => {
  const result = await tokenService.revokeRefreshToken(plainRefreshToken, userId);
  return { message: 'Logged out successfully' };
};

const sessionInfo = async (userId, exp, iat) => {
  const user = await User.findById(userId).lean();
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const expiresInMinutes = Math.max(0, Math.floor((exp * 1000 - Date.now()) / 60000));

  const latestToken = await RefreshToken.findOne(
    { user: userId, isRevoked: false, expiresAt: { $gt: new Date() } },
    { rememberMe: 1, createdAt: 1 },
    { sort: { createdAt: -1 } }
  ).lean();

  return {
    user: sanitizeUser(user),
    session: {
      issuedAt: new Date(iat * 1000).toISOString(),
      expiresInMinutes,
      rememberMe: latestToken ? latestToken.rememberMe : false,
      accountLockedUntil: user.loginLockedUntil || null
    }
  };
};

const revokeToken = async (userId, rawToken) => {
  await tokenService.revokeRefreshToken(rawToken, userId);
  return { message: 'Token revoked successfully' };
};

const logoutAll = async (userId) => {
  const revokedSessions = await tokenService.revokeAllUserTokens(userId);
  return { message: 'Logged out from all devices.', revokedSessions };
};

module.exports = { register, login, verify2fa, resend2faOtp, verifyEmail, resendOtp, forgotPassword, resetPassword, refreshToken, logout, sessionInfo, revokeToken, logoutAll };
