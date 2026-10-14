const ApiError = require('../utils/apiError');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err instanceof ApiError) {
    logger.warn(`API Error: ${err.message} (${err.code})`, {
      path: req.originalUrl,
      method: req.method,
      statusCode: err.statusCode,
      details: err.details
    });
    return ApiResponse.error(res, err.statusCode, err.message, err.code, err.details);
  }

  // Handle syntax error in JSON body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return ApiResponse.error(res, 400, 'Malformed JSON in request body', 'BAD_REQUEST');
  }

  // Unexpected internal errors
  logger.error(`Unhandled Server Error: ${err.message}`, {
    stack: err.stack,
    path: req.originalUrl,
    method: req.method
  });

  return ApiResponse.error(
    res,
    500,
    process.env.NODE_ENV === 'production'
      ? 'An internal server error occurred'
      : err.message,
    'INTERNAL_SERVER_ERROR'
  );
};

module.exports = errorHandler;
