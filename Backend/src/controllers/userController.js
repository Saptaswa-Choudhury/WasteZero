const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const bcrypt = require('bcrypt');
const { generateOtp, hashOtp, verifyOtp } = require('../services/otpService');
const { sendOtpEmail } = require('../services/emailService');

// Lets any authenticated user look up any other user by name/email so they can
// start a new conversation. Deliberately role-agnostic per the messaging spec.
exports.searchUsers = asyncHandler(async (req, res) => {
  const query = (req.query.q || '').trim();

  if (!query) {
    return ApiResponse.ok(res, 'Users fetched successfully', { users: [] });
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'i');

  const users = await User.find({
    _id: { $ne: req.user.id },
    $or: [{ name: regex }, { email: regex }]
  })
    .select('name email role publicKey')
    .limit(20);

  return ApiResponse.ok(res, 'Users fetched successfully', { users });
});

// Publishes/replaces the caller's end-to-end encryption public key (a
// JSON-stringified JWK). The matching private key is generated and kept
// client-side only - the server never sees it and never sees message
// plaintext, only this public key and message ciphertext.
exports.setPublicKey = asyncHandler(async (req, res) => {
  const { publicKey } = req.body;

  if (!publicKey || typeof publicKey !== 'string' || publicKey.length > 5000) {
    return res.status(400).json({ success: false, message: 'A valid publicKey is required' });
  }

  const user = await User.findByIdAndUpdate(
    req.user.id,
    { $set: { publicKey } },
    { new: true }
  ).select('-password');

  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  return ApiResponse.ok(res, 'Public key updated successfully', { publicKey: user.publicKey });
});

// Lets a client fetch another user's E2E public key before encrypting a
// message to them (e.g. when starting a brand new conversation where no
// message/user payload with an embedded publicKey has been fetched yet).
exports.getPublicKey = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId).select('publicKey');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  return ApiResponse.ok(res, 'Public key fetched successfully', { publicKey: user.publicKey || null });
});

// Stores/replaces the caller's password-wrapped private key backup so
// another device can recover the same E2EE key pair after logging in.
// The server only ever receives ciphertext + a KDF salt/params - the
// password and the KEK derived from it are never sent here.
exports.setKeyBackup = asyncHandler(async (req, res) => {
  const { ciphertext, iv, salt, kdf } = req.body;

  if (!ciphertext || typeof ciphertext !== 'string' || ciphertext.length > 20000) {
    return res.status(400).json({ success: false, message: 'A valid ciphertext is required' });
  }
  if (!iv || typeof iv !== 'string' || iv.length > 100) {
    return res.status(400).json({ success: false, message: 'A valid iv is required' });
  }
  if (!salt || typeof salt !== 'string' || salt.length > 200) {
    return res.status(400).json({ success: false, message: 'A valid salt is required' });
  }
  if (!kdf || typeof kdf !== 'object') {
    return res.status(400).json({ success: false, message: 'Valid kdf parameters are required' });
  }

  const { algorithm, memoryCost, timeCost, parallelism, hashLength } = kdf;
  if (algorithm !== 'argon2id') {
    return res.status(400).json({ success: false, message: 'Unsupported KDF algorithm' });
  }
  if (![memoryCost, timeCost, parallelism, hashLength].every((n) => Number.isInteger(n) && n > 0)) {
    return res.status(400).json({ success: false, message: 'Invalid kdf parameters' });
  }

  const user = await User.findByIdAndUpdate(
    req.user.id,
    {
      $set: {
        keyBackup: {
          ciphertext,
          iv,
          salt,
          kdf: { algorithm, memoryCost, timeCost, parallelism, hashLength },
          updatedAt: new Date()
        }
      }
    },
    { new: true }
  ).select('keyBackup');

  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  return ApiResponse.ok(res, 'Key backup saved successfully', { keyBackup: user.keyBackup });
});

// Lets the CALLER (and only the caller - this is not keyed off req.params)
// fetch their own encrypted private key backup, e.g. on a fresh device
// right after login, so it can be decrypted locally with their password and
// written into that device's IndexedDB.
exports.getKeyBackup = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('keyBackup');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const backup = user.keyBackup && user.keyBackup.ciphertext ? user.keyBackup : null;
  return ApiResponse.ok(res, 'Key backup fetched successfully', { keyBackup: backup });
});

exports.getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  return ApiResponse.ok(res, 'Profile fetched successfully', { user });
});

exports.updateProfile = asyncHandler(async (req, res) => {
  const { email, password, role, ...updateData } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { $set: updateData },
    { new: true, runValidators: true }
  ).select('-password');
  
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  return ApiResponse.ok(res, 'Profile updated successfully', { user });
});

exports.deleteAccount = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndDelete(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  return ApiResponse.ok(res, 'Account deleted successfully');
});

exports.initiatePasswordChange = asyncHandler(async (req, res) => {
  const { currentPassword } = req.body;
  
  const user = await User.findById(req.user.id).select('+password');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    return res.status(400).json({ success: false, message: 'Incorrect current password' });
  }

  const otp = generateOtp();
  const hashedOtp = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); 

  await sendOtpEmail(user.email, otp, 'forgotPassword');

  await User.findByIdAndUpdate(req.user.id, {
    $set: {
      passwordResetOtp: hashedOtp,
      passwordResetOtpExpires: expiresAt,
      passwordResetAttempts: 0
    }
  });

  return ApiResponse.ok(res, 'OTP sent to your registered email');
});

exports.confirmPasswordChange = asyncHandler(async (req, res) => {
  const { otp, newPassword } = req.body;
  const user = await User.findById(req.user.id).select('+passwordResetOtp +passwordResetOtpExpires');

  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  if (!user.passwordResetOtpExpires || user.passwordResetOtpExpires < new Date()) {
    return res.status(400).json({ success: false, message: 'OTP has expired. Please try again.' });
  }

  const isValid = await verifyOtp(otp, user.passwordResetOtp);
  if (!isValid) {
    return res.status(400).json({ success: false, message: 'Invalid OTP' });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await User.findByIdAndUpdate(req.user.id, {
    $set: {
      password: hashedPassword,
      passwordResetOtp: null,
      passwordResetOtpExpires: null,
      passwordResetAttempts: 0
    }
  });

  return ApiResponse.ok(res, 'Password updated successfully');
});