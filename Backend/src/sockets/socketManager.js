// Small singleton so REST controllers (which don't have direct access to the
// socket.io server instance) can still emit real-time events, and so the
// online-user presence map is available in one place.

let io = null;

// userId (string) -> Set of socket ids. A user can have several open tabs/devices.
const onlineUsers = new Map();

const setIO = (ioInstance) => {
  io = ioInstance;
};

const getIO = () => io;

const addOnlineUser = (userId, socketId) => {
  const key = String(userId);
  if (!onlineUsers.has(key)) {
    onlineUsers.set(key, new Set());
  }
  onlineUsers.get(key).add(socketId);
};

const removeOnlineUser = (userId, socketId) => {
  const key = String(userId);
  const sockets = onlineUsers.get(key);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    onlineUsers.delete(key);
  }
};

const isUserOnline = (userId) => onlineUsers.has(String(userId));

const getOnlineUserIds = () => Array.from(onlineUsers.keys());

module.exports = {
  setIO,
  getIO,
  addOnlineUser,
  removeOnlineUser,
  isUserOnline,
  getOnlineUserIds
};
