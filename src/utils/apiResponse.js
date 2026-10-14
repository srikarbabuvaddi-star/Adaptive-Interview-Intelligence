/**
 * Standard API Response Formatter
 */
class ApiResponse {
  static success(res, data = null, message = 'Success', statusCode = 200, meta = null) {
    const payload = {
      success: true,
      message,
      data
    };
    if (meta) {
      payload.meta = meta;
    }
    return res.status(statusCode).json(payload);
  }

  static created(res, data = null, message = 'Created successfully') {
    return ApiResponse.success(res, data, message, 201);
  }

  static error(res, statusCode, message, code = 'ERROR', details = null) {
    const payload = {
      success: false,
      error: {
        code,
        message,
        details
      }
    };
    return res.status(statusCode).json(payload);
  }
}

module.exports = ApiResponse;
