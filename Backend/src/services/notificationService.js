const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { NOTIFICATION_TYPE } = require('../constants/notificationType');
const { ROLES } = require('../constants/roles');
const { getIO } = require('../sockets/socketManager');

const NOTIFICATION_PREVIEW_LENGTH = 100;

const truncate = (text, max = NOTIFICATION_PREVIEW_LENGTH) => {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text;
};

// Emits the new notification plus a refreshed unread count to every tab/device
// the recipient currently has open. Safe to call even if socket.io hasn't
// been initialised yet (e.g. unit tests) - it just becomes a silent no-op.
const emitToRecipient = async (notification) => {
  const io = getIO();
  if (!io) return;

  try {
    const unreadCount = await Notification.countDocuments({
      recipient: notification.recipient,
      isRead: false
    });

    io.to(String(notification.recipient)).emit('notification:new', notification);
    io.to(String(notification.recipient)).emit('notification:unreadCount', { unreadCount });
  } catch (error) {
    logger.error(`Failed to emit notification to ${notification.recipient}: ${error.message}`);
  }
};

const createNotification = async ({ recipient, sender = null, type, title, message = '', link = null, relatedId = null }) => {
  const notification = await Notification.create({
    recipient,
    sender,
    type,
    title,
    message,
    link,
    relatedId
  });

  const plain = notification.toObject();
  delete plain.__v;

  emitToRecipient(plain).catch((error) =>
    logger.error(`Unexpected error emitting notification: ${error.message}`)
  );

  return plain;
};

// Called whenever a message is created (either via the 'message:send' socket
// event or the REST fallback) so the receiver always gets a notification,
// regardless of which path was used to deliver the message itself.
const notifyNewMessage = async (message) => {
  try {
    const sender = message.sender;
    const receiverId = typeof message.receiver === 'string' ? message.receiver : message.receiver._id;
    const senderId = typeof sender === 'string' ? sender : sender._id;
    const senderName = typeof sender === 'string' ? 'Someone' : sender.name;

    if (String(senderId) === String(receiverId)) return null;

    // Messages are end-to-end encrypted, so the server never has plaintext
    // to build a preview from - the notification body is intentionally
    // generic rather than a truncated snippet of the message.
    return await createNotification({
      recipient: receiverId,
      sender: senderId,
      type: NOTIFICATION_TYPE.MESSAGE,
      title: `New message from ${senderName}`,
      message: 'You have a new encrypted message',
      link: `/messages?user=${senderId}&name=${encodeURIComponent(senderName)}`,
      relatedId: message._id
    });
  } catch (error) {
    logger.error(`Failed to create message notification: ${error.message}`);
    return null;
  }
};

// A volunteer's structured `city.name` matches an opportunity's structured
// { city, state } location via a case-insensitive exact match on city name.
const buildLocationMatchQuery = (opportunityLocation) => {
  const city = (opportunityLocation?.city || '').trim();
  if (!city) return null;

  const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { $regex: new RegExp(`^${escaped}$`, 'i') };
};

// Called after an NGO creates a new opportunity, so every volunteer located in
// that opportunity's city gets notified about it.
const notifyMatchingVolunteers = async (opportunity) => {
  try {
    const locationQuery = buildLocationMatchQuery(opportunity.location);
    if (!locationQuery) return [];

    const matchingVolunteers = await User.find({
      role: ROLES.VOLUNTEER,
      'city.name': locationQuery
    }).select('_id');

    if (matchingVolunteers.length === 0) return [];

    const locationLabel = [opportunity.location?.city, opportunity.location?.state]
      .filter(Boolean)
      .join(', ');

    const notifications = await Promise.all(
      matchingVolunteers.map((volunteer) =>
        createNotification({
          recipient: volunteer._id,
          sender: opportunity.ngo,
          type: NOTIFICATION_TYPE.OPPORTUNITY,
          title: `New opportunity near you: ${opportunity.title}`,
          message: truncate(`A new volunteering opportunity was posted in ${locationLabel}.`),
          link: `/opportunities/${opportunity._id}`,
          relatedId: opportunity._id
        })
      )
    );

    return notifications;
  } catch (error) {
    logger.error(`Failed to notify matching volunteers: ${error.message}`);
    return [];
  }
};

const getNotifications = async (userId, { page = 1, limit = 20 } = {}) => {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const filter = { recipient: userId };

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: userId, isRead: false })
  ]);

  return {
    notifications,
    unreadCount,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.max(1, Math.ceil(total / limitNum))
    }
  };
};

const getUnreadCount = async (userId) => {
  const unreadCount = await Notification.countDocuments({ recipient: userId, isRead: false });
  return { unreadCount };
};

const markAsRead = async (userId, notificationId) => {
  if (!mongoose.isValidObjectId(notificationId)) {
    throw ApiError.badRequest('Invalid notification id');
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  ).lean();

  if (!notification) {
    throw ApiError.notFound('Notification not found');
  }

  return notification;
};

const markAllAsRead = async (userId) => {
  const result = await Notification.updateMany(
    { recipient: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  return { modifiedCount: result.modifiedCount || 0 };
};

module.exports = {
  createNotification,
  notifyNewMessage,
  notifyMatchingVolunteers,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
};
