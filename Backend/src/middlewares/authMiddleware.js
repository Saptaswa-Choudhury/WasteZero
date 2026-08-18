const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('No token provided'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.userId,
      role: decoded.role,
      exp: decoded.exp,
      iat: decoded.iat
    };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Token expired'));
    }
    return next(ApiError.unauthorized('Invalid token'));
  }
};

module.exports = authMiddleware;
