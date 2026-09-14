const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  const conn = await mongoose.connect(process.env.MONGODB_URI);
  logger.info(`MongoDB connected: ${conn.connection.host}`);
  return conn;
};

module.exports = connectDB;
