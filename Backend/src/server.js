require('dotenv').config();

const http = require('http');
const app = require('./app');
const connectDB = require('./config/database');
const logger = require('./config/logger');
const initSocket = require('./sockets');

const requiredEnvVars = ['PORT', 'MONGODB_URI', 'JWT_SECRET', 'JWT_EXPIRES_IN', 'NODE_ENV'];
const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  logger.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

if (process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
  logger.warn('JWT_SECRET is still set to default value. Change it in production.');
}

const PORT = process.env.PORT || 3000;

// Express app is wrapped in a plain http.Server so Socket.IO can attach to
// the same port and share it with the REST API (no second port to manage).
const httpServer = http.createServer(app);
initSocket(httpServer);

connectDB().then(() => {
  httpServer.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info('Socket.IO messaging is live on the same port');
  });
}).catch((error) => {
  logger.error('Failed to start server:', error.message);
  process.exit(1);
});
