const crypto = require('crypto');
const { TWO_FA_SESSION_EXPIRY_SECONDS } = require('../constants/security');

const store = new Map();

// IP address and userAgent are stored for audit and future use only.
// Current implementation does NOT enforce strict IP/User-Agent binding
// during verify-2fa. This avoids false positives from NAT/CDN/proxy changes
// within the 5-minute session window.

const createSession = ({ userId, rememberMe, ipAddress, userAgent }) => {
  const sessionToken = crypto.randomBytes(48).toString('hex');
  const expiresAt = Date.now() + TWO_FA_SESSION_EXPIRY_SECONDS * 1000;

  store.set(sessionToken, {
    userId,
    rememberMe: !!rememberMe,
    ipAddress: ipAddress || '',
    userAgent: userAgent || '',
    expiresAt,
    createdAt: Date.now(),
    otpGeneratedAt: null,
    resendCount: 0
  });

  return { sessionToken, expiresAt };
};

const getSession = (sessionToken) => {
  const session = store.get(sessionToken);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    store.delete(sessionToken);
    return null;
  }
  return session;
};

const updateSession = (sessionToken, updates) => {
  const session = store.get(sessionToken);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    store.delete(sessionToken);
    return null;
  }
  Object.assign(session, updates);
  return session;
};

const deleteSession = (sessionToken) => {
  store.delete(sessionToken);
};

const cleanupExpiredSessions = () => {
  const now = Date.now();
  for (const [token, session] of store) {
    if (now > session.expiresAt) {
      store.delete(token);
    }
  }
};

const interval = setInterval(cleanupExpiredSessions, 60 * 1000);
interval.unref();

module.exports = { createSession, getSession, updateSession, deleteSession };
