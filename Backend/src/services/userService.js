const User = require('../models/User');
const ApiError = require('../utils/ApiError');

const getProfile = async (userId) => {
  const user = await User.findById(userId).lean();
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  delete user.__v;
  return user;
};

const updateProfile = async (userId, updateData) => {
  const user = await User.findByIdAndUpdate(userId, updateData, {
    returnDocument: 'after',
    runValidators: true
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  return user;
};

module.exports = { getProfile, updateProfile };
