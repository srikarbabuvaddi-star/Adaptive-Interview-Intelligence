const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const ApiResponse = require('../utils/apiResponse');

const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.NODE_ENV === 'test' ? 10000 : env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return ApiResponse.error(
      res,
      429,
      'Too many requests from this IP, please try again later.',
      'TOO_MANY_REQUESTS'
    );
  }
});

// Stricter limiter for critical actions (e.g. answer submissions, interview start)
const interviewLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: env.NODE_ENV === 'test' ? 1000 : 30, // 30 requests/minute
  handler: (req, res) => {
    return ApiResponse.error(
      res,
      429,
      'Too many interview submissions. Please slow down.',
      'TOO_MANY_REQUESTS'
    );
  }
});

module.exports = {
  apiLimiter,
  interviewLimiter
};
