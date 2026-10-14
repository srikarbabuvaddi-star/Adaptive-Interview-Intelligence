const express = require('express');
const applicationController = require('../controllers/application.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const validate = require('../middlewares/validate.middleware');
const { ROLES } = require('../constants/roles');
const { updateApplicationStatusSchema } = require('../schemas/application.schema');

const router = express.Router();

// GET /api/applications/me (candidate only)
router.get(
  '/me',
  requireAuth,
  requireRole([ROLES.CANDIDATE]),
  applicationController.getMyApplications
);

// GET /api/applications/:applicationId (candidate or recruiter)
router.get(
  '/:applicationId',
  requireAuth,
  requireRole([ROLES.CANDIDATE, ROLES.RECRUITER]),
  applicationController.getApplicationById
);

// PATCH /api/applications/:applicationId/status (recruiter only)
router.patch(
  '/:applicationId/status',
  requireAuth,
  requireRole([ROLES.RECRUITER]),
  validate(updateApplicationStatusSchema),
  applicationController.updateStatus
);

module.exports = router;
