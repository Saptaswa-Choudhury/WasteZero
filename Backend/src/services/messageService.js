const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const notificationService = require('./notificationService');

const USER_PREVIEW_FIELDS = 'name email role publicKey';

const createMessage = async ({
  sender,
  receiver,
  ciphertext,
  iv,
  encryptedKeyForSender,
  encryptedKeyForReceiver,
  application = null,
  messageType
}) => {
  if (String(sender) === String(receiver)) {
    throw ApiError.badRequest('You cannot send a message to yourself');
  }

  const receiverUser = await User.findById(receiver).select('publicKey');
  if (!receiverUser) {
    throw ApiError.notFound('Recipient not found');
  }
  if (!receiverUser.publicKey) {
    // Can't happen for a client that follows the normal flow (it needs the
    // recipient's public key to have encrypted the message in the first
    // place), but guard against stale clients/direct API calls anyway.
    throw ApiError.badRequest('Recipient has not set up encrypted messaging yet');
  }

  const message = await Message.create({
    sender,
    receiver,
    ciphertext,
    iv,
    encryptedKeyForSender,
    encryptedKeyForReceiver,
    application: application || null,
    ...(messageType ? { messageType } : {})
  });

  const populated = await Message.findById(message._id)
    .populate('sender', USER_PREVIEW_FIELDS)
    .populate('receiver', USER_PREVIEW_FIELDS)
    .lean();

  // Fire-and-forget: notification delivery should never block/break message sending.
  notificationService.notifyNewMessage(populated).catch(() => {});

  return populated;
};

const getConversation = async (userId, otherUserId, { page = 1, limit = 30 } = {}) => {
  if (!mongoose.isValidObjectId(otherUserId)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const otherExists = await User.exists({ _id: otherUserId });
  if (!otherExists) {
    throw ApiError.notFound('User not found');
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 30));
  const skip = (pageNum - 1) * limitNum;

  const filter = {
    isDeleted: false,
    $or: [
      { sender: userId, receiver: otherUserId },
      { sender: otherUserId, receiver: userId }
    ]
  };

  const [messages, total] = await Promise.all([
    Message.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('sender', USER_PREVIEW_FIELDS)
      .populate('receiver', USER_PREVIEW_FIELDS)
      .lean(),
    Message.countDocuments(filter)
  ]);

  return {
    messages: messages.reverse(),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.max(1, Math.ceil(total / limitNum))
    }
  };
};

const getConversationsList = async (userId) => {
  const objectId = new mongoose.Types.ObjectId(userId);

  const conversations = await Message.aggregate([
    {
      $match: {
        isDeleted: false,
        $or: [{ sender: objectId }, { receiver: objectId }]
      }
    },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: {
          $cond: [{ $eq: ['$sender', objectId] }, '$receiver', '$sender']
        },
        lastMessage: { $first: '$$ROOT' },
        unreadCount: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$receiver', objectId] }, { $eq: ['$isRead', false] }] },
              1,
              0
            ]
          }
        }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
    { $sort: { 'lastMessage.createdAt': -1 } },
    {
      $project: {
        _id: 0,
        user: {
          _id: '$user._id',
          name: '$user.name',
          email: '$user.email',
          role: '$user.role',
          publicKey: '$user.publicKey'
        },
        lastMessage: {
          _id: '$lastMessage._id',
          ciphertext: '$lastMessage.ciphertext',
          iv: '$lastMessage.iv',
          encryptedKeyForSender: '$lastMessage.encryptedKeyForSender',
          encryptedKeyForReceiver: '$lastMessage.encryptedKeyForReceiver',
          sender: '$lastMessage.sender',
          receiver: '$lastMessage.receiver',
          createdAt: '$lastMessage.createdAt',
          isRead: '$lastMessage.isRead'
        },
        unreadCount: 1
      }
    }
  ]);

  return conversations;
};

const markAsRead = async (userId, otherUserId) => {
  if (!mongoose.isValidObjectId(otherUserId)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const result = await Message.updateMany(
    { sender: otherUserId, receiver: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  return { modifiedCount: result.modifiedCount || 0 };
};

module.exports = {
  createMessage,
  getConversation,
  getConversationsList,
  markAsRead
};
