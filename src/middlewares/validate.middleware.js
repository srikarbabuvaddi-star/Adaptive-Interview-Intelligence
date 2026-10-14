const ApiResponse = require('../utils/apiResponse');

/**
 * Middleware factory for validating request data with a Zod schema
 * @param {import('zod').ZodSchema} schema
 * @param {'body' | 'query' | 'params'} source
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[source]);
      req[source] = parsed;
      next();
    } catch (err) {
      if (err.errors) {
        const formattedErrors = err.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message
        }));
        return ApiResponse.error(
          res,
          422,
          'Validation failed',
          'VALIDATION_ERROR',
          formattedErrors
        );
      }
      return ApiResponse.error(res, 400, err.message, 'BAD_REQUEST');
    }
  };
};

module.exports = validate;
