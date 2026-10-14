const ApiError = require('../utils/apiError');

/**
 * Middleware factory for role-based authorization
 * @param {string[]} allowedRoles - Array of roles allowed to access the route
 */
const requireRole = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    if (!req.user.isRegistered || !req.user.role) {
      return next(
        ApiError.forbidden('Registration required: Please complete your profile registration first')
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Forbidden: Access denied. Role '${req.user.role}' is not authorized to access this resource`
        )
      );
    }

    next();
  };
};

module.exports = {
  requireRole
};
