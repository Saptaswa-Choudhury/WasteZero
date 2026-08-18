const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { validateCreateMessage } = require('../validators/messageValidator');
const messageService = require('../services/messageService');
const { getIO } = require('../sockets/socketManager');

// REST fallback for sending a message (the primary path is the 'message:send'
// socket event; this exists so the feature still works if a client's socket
// connection drops, and so it can be tested/used without a socket client).
const sendMessage = asyncHandler(async (req, res) => {
  const { error, value } = validateCreateMessage(req.body);
  if (error) {
    return ApiResponse.validationError(res, error);
  }

  const message = await messageService.createMessage({ ...value, sender: req.user.id });

  const io = getIO();
  if (io) {
    io.to(String(value.receiver)).emit('message:new', message);
    io.to(String(req.user.id)).emit('message:new', message);
  }

  return ApiResponse.created(res, 'Message sent successfully', { message });
});

const getConversations = asyncHandler(async (req, res) => {
  const conversations = await messageService.getConversationsList(req.user.id);
  return ApiResponse.ok(res, 'Conversations fetched successfully', { conversations });
});

const getConversation = asyncHandler(async (req, res) => {
  const result = await messageService.getConversation(req.user.id, req.params.userId, req.query);
  return ApiResponse.ok(res, 'Conversation fetched successfully', result);
});

const markConversationRead = asyncHandler(async (req, res) => {
  const result = await messageService.markAsRead(req.user.id, req.params.userId);

  const io = getIO();
  if (io) {
    io.to(String(req.params.userId)).emit('message:read', { by: req.user.id });
  }

  return ApiResponse.ok(res, 'Messages marked as read', result);
});

module.exports = {
  sendMessage,
  getConversations,
  getConversation,
  markConversationRead
};
