class ApiResponse {
  static success(res, statusCode, message, data = {}) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  static created(res, message, data = {}) {
    return ApiResponse.success(res, 201, message, data);
  }

  static ok(res, message, data = {}) {
    return ApiResponse.success(res, 200, message, data);
  }

  static validationError(res, error) {
    const messages = error.details.map((d) => d.message);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: messages,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = ApiResponse;
