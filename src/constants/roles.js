/**
 * User roles in the platform
 */
const ROLES = {
  CANDIDATE: 'candidate',
  RECRUITER: 'recruiter',
  ADMIN: 'admin'
};

const ALLOWED_ROLES = [ROLES.CANDIDATE, ROLES.RECRUITER];

module.exports = {
  ROLES,
  ALLOWED_ROLES
};
