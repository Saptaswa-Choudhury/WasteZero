const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');
const messageService = require('../services/messageService');
const {
  setIO,
  addOnlineUser,
  removeOnlineUser,
  isUserOnline,
  getOnlineUserIds
} = require('./socketManager');

/**
 * Every connected socket authenticates with the same JWT the REST API uses
 * (sent as `auth: { token }` from the client) and joins a personal room named
 * after their user id. Emitting to `io.to(userId)` then reaches every tab/
 * device that user currently has open, without needing to track socket ids
 * anywhere except inside socketManager (for presence).
 */
const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  setIO(io);

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = String(decoded.userId);
      socket.userRole = decoded.role;
      next();
    } catch (error) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    socket.join(userId);
    addOnlineUser(userId, socket.id);

    logger.info(`Socket connected: user ${userId} (${socket.id})`);
    io.emit('presence:update', { userId, online: true });

    socket.emit('presence:list', { onlineUserIds: getOnlineUserIds() });

    socket.on('message:send', async (payload, callback) => {
      try {
        const { receiver, ciphertext, iv, encryptedKeyForSender, encryptedKeyForReceiver, application } =
          payload || {};
        const message = await messageService.createMessage({
          sender: userId,
          receiver,
          ciphertext,
          iv,
          encryptedKeyForSender,
          encryptedKeyForReceiver,
          application
        });

        io.to(String(receiver)).emit('message:new', message);
        io.to(userId).emit('message:new', message);

        if (typeof callback === 'function') {
          callback({ success: true, message });
        }
      } catch (error) {
        logger.error(`message:send failed for user ${userId}: ${error.message}`);
        if (typeof callback === 'function') {
          callback({ success: false, error: error.message });
        } else {
          socket.emit('message:error', { error: error.message });
        }
      }
    });

    socket.on('message:read', async ({ otherUserId } = {}) => {
      try {
        if (!otherUserId) return;
        await messageService.markAsRead(userId, otherUserId);
        io.to(String(otherUserId)).emit('message:read', { by: userId });
      } catch (error) {
        logger.error(`message:read failed for user ${userId}: ${error.message}`);
      }
    });

    socket.on('typing:start', ({ receiver } = {}) => {
      if (receiver) io.to(String(receiver)).emit('typing:start', { from: userId });
    });

    socket.on('typing:stop', ({ receiver } = {}) => {
      if (receiver) io.to(String(receiver)).emit('typing:stop', { from: userId });
    });

    socket.on('presence:check', ({ userId: targetId } = {}, callback) => {
      if (typeof callback === 'function') {
        callback({ online: isUserOnline(targetId) });
      }
    });

    socket.on('disconnect', () => {
      removeOnlineUser(userId, socket.id);
      logger.info(`Socket disconnected: user ${userId} (${socket.id})`);
      if (!isUserOnline(userId)) {
        io.emit('presence:update', { userId, online: false });
      }
    });
  });

  return io;
};

module.exports = initSocket;
