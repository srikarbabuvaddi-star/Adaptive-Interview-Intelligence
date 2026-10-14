const express = require('express');
const reportController = require('../controllers/report.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const { ROLES } = require('../constants/roles');

const router = express.Router();

// GET /api/reports/interviews/:interviewId
router.get(
  '/interviews/:interviewId',
  requireAuth,
  requireRole([ROLES.CANDIDATE, ROLES.RECRUITER]),
  reportController.getInterviewReport
);

// GET /api/reports/jobs/:jobId
router.get(
  '/jobs/:jobId',
  requireAuth,
  requireRole([ROLES.RECRUITER]),
  reportController.getJobReports
);

module.exports = router;
