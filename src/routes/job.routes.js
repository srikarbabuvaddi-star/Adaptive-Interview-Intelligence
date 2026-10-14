const express = require('express');
const jobController = require('../controllers/job.controller');
const applicationController = require('../controllers/application.controller');
const reportController = require('../controllers/report.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const validate = require('../middlewares/validate.middleware');
const { ROLES } = require('../constants/roles');
const {
  createJobSchema,
  updateJobSchema,
  queryJobsSchema
} = require('../schemas/job.schema');
const { applyJobSchema } = require('../schemas/application.schema');

const router = express.Router();

// GET /api/jobs
router.get(
  '/',
  requireAuth,
  requireRole([ROLES.CANDIDATE, ROLES.RECRUITER]),
  validate(queryJobsSchema, 'query'),
  jobController.getJobs
);

// POST /api/jobs (recruiter only)
router.post(
  '/',
  requireAuth,
  requireRole([ROLES.RECRUITER]),
  validate(createJobSchema),
  jobController.createJob
);

// GET /api/jobs/:jobId
router.get(
  '/:jobId',
  requireAuth,
  requireRole([ROLES.CANDIDATE, ROLES.RECRUITER]),
  jobController.getJobById
);

// PATCH /api/jobs/:jobId (recruiter only)
router.patch(
  '/:jobId',
  requireAuth,
  requireRole([ROLES.RECRUITER]),
  validate(updateJobSchema),
  jobController.updateJob
);

// DELETE /api/jobs/:jobId (recruiter only)
router.delete(
  '/:jobId',
  requireAuth,
  requireRole([ROLES.RECRUITER]),
  jobController.deleteJob
);

// --- Sub-resource: Applications for Job ---

// POST /api/jobs/:jobId/applications (candidate only)
router.post(
  '/:jobId/applications',
  requireAuth,
  requireRole([ROLES.CANDIDATE]),
  validate(applyJobSchema),
  applicationController.applyJob
);

// GET /api/jobs/:jobId/applications (recruiter only)
router.get(
  '/:jobId/applications',
  requireAuth,
  requireRole([ROLES.RECRUITER]),
  applicationController.getApplicationsByJob
);

// GET /api/jobs/:jobId/reports (recruiter only)
router.get(
  '/:jobId/reports',
  requireAuth,
  requireRole([ROLES.RECRUITER]),
  reportController.getJobReports
);

module.exports = router;
