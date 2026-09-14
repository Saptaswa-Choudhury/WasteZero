const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const notificationService = require('../services/notificationService');

const getNotifications = asyncHandler(async (req, res) => {
  const result = await notificationService.getNotifications(req.user.id, req.query);
  return ApiResponse.ok(res, 'Notifications fetched successfully', result);
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const result = await notificationService.getUnreadCount(req.user.id);
  return ApiResponse.ok(res, 'Unread count fetched successfully', result);
});

const markAsRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAsRead(req.user.id, req.params.id);
  return ApiResponse.ok(res, 'Notification marked as read', { notification });
});

const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllAsRead(req.user.id);
  return ApiResponse.ok(res, 'All notifications marked as read', result);
});

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
};
