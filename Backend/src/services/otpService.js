const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { OTP_LENGTH, SALT_ROUNDS } = require('../constants/security');

const generateOtp = () => {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return crypto.randomInt(min, max).toString();
};

const hashOtp = async (otp) => {
  return bcrypt.hash(otp, SALT_ROUNDS);
};

const verifyOtp = async (plainOtp, hashedOtp) => {
  if (!hashedOtp) return false;
  return bcrypt.compare(plainOtp, hashedOtp);
};

module.exports = { generateOtp, hashOtp, verifyOtp };
