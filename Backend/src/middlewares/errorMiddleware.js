const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

const errorMiddleware = (err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
      timestamp: new Date().toISOString()
    });
  }

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: messages,
      timestamp: new Date().toISOString()
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: 'Duplicate field value',
      errors: ['A record with this value already exists'],
      timestamp: new Date().toISOString()
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format',
      errors: ['The provided ID is not valid'],
      timestamp: new Date().toISOString()
    });
  }

  logger.error('Unhandled error:', err);

  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    errors: ['Something went wrong'],
    timestamp: new Date().toISOString()
  });
};

module.exports = errorMiddleware;
