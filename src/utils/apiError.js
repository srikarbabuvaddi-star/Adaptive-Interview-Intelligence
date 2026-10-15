/**
 * Standard API error class
 */
class ApiError extends Error {
  constructor(statusCode, message, code = 'INTERNAL_SERVER_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad Request', details = null) {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }

  static validation(message = 'Validation Error', details = null) {
    return new ApiError(422, message, 'VALIDATION_ERROR', details);
  }

  static unauthorized(message = 'Unauthorized: Authentication required', details = null) {
    return new ApiError(401, message, 'UNAUTHORIZED', details);
  }

  static forbidden(message = 'Forbidden: You do not have permission to access this resource', details = null) {
    return new ApiError(403, message, 'FORBIDDEN', details);
  }

  static notFound(message = 'Resource not found', details = null) {
    return new ApiError(404, message, 'NOT_FOUND', details);
  }

  static conflict(message = 'Resource conflict', details = null) {
    return new ApiError(409, message, 'CONFLICT', details);
  }

  static aiServiceError(message = 'AI Engine service error', details = null) {
    return new ApiError(502, message, 'AI_SERVICE_ERROR', details);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable', details = null) {
    return new ApiError(503, message, 'SERVICE_UNAVAILABLE', details);
  }

  static tooManyRequests(message = 'Rate limit exceeded', details = null) {
    return new ApiError(429, message, 'TOO_MANY_REQUESTS', details);
  }

  static gatewayTimeout(message = 'Gateway timeout: Upstream agent did not respond in time', details = null) {
    return new ApiError(504, message, 'GATEWAY_TIMEOUT', details);
  }

  static internal(message = 'Internal server error', details = null) {
    return new ApiError(500, message, 'INTERNAL_SERVER_ERROR', details);
  }
}

module.exports = ApiError;
