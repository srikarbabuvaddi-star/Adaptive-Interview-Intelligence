const express = require('express');
const interviewController = require('../controllers/interview.controller');
const reportController = require('../controllers/report.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const { interviewLimiter } = require('../middlewares/rateLimiter.middleware');
const validate = require('../middlewares/validate.middleware');
const { ROLES } = require('../constants/roles');
const {
  createInterviewSchema,
  submitAnswerSchema,
  endInterviewSchema
} = require('../schemas/interview.schema');
const { createIntegrityEventSchema, reviewIntegrityEventSchema } = require('../schemas/integrity.schema');

const router = express.Router();

// GET /api/interviews
router.get(
  '/',
  requireAuth,
  requireRole([ROLES.CANDIDATE, ROLES.RECRUITER]),
  interviewController.getInterviews
);

// POST /api/interviews (recruiter schedules or candidate initiates for a job)
router.post(
  '/',
  requireAuth,
  requireRole([ROLES.CANDIDATE, ROLES.RECRUITER]),
  validate(createInterviewSchema),
  interviewController.createInterview
);

// GET /api/interviews/:interviewId
router.get(
  '/:interviewId',
  requireAuth,
  requireRole([ROLES.CANDIDATE, ROLES.RECRUITER]),
  interviewController.getInterviewById
);

// POST /api/interviews/:interviewId/start (candidate starts interview session)
router.post(
  '/:interviewId/start',
  requireAuth,
  requireRole([ROLES.CANDIDATE]),
  interviewLimiter,
  interviewController.startInterview
);

// POST /api/interviews/:interviewId/answers (candidate submits answer, AI evaluates)
router.post(
  '/:interviewId/answers',
  requireAuth,
  requireRole([ROLES.CANDIDATE]),
  interviewLimiter,
  validate(submitAnswerSchema),
  interviewController.submitAnswer
);

// POST /api/interviews/:interviewId/end (candidate or recruiter ends session)
router.post(
  '/:interviewId/end',
  requireAuth,
  requireRole([ROLES.CANDIDATE, ROLES.RECRUITER]),
  validate(endInterviewSchema),
  interviewController.endInterview
);

// POST /api/interviews/:interviewId/integrity-events (proctoring log events)
router.post(
  '/:interviewId/integrity-events',
  requireAuth,
  requireRole([ROLES.CANDIDATE]),
  validate(createIntegrityEventSchema),
  interviewController.recordIntegrityEvent
);

// GET /api/interviews/:interviewId/integrity-timeline (chronological timeline & review summary)
router.get(
  '/:interviewId/integrity-timeline',
  requireAuth,
  requireRole([ROLES.CANDIDATE, ROLES.RECRUITER]),
  interviewController.getIntegrityTimeline
);

// PATCH /api/interviews/:interviewId/integrity-events/:eventId/review (recruiter reviews flag)
router.patch(
  '/:interviewId/integrity-events/:eventId/review',
  requireAuth,
  requireRole([ROLES.RECRUITER]),
  validate(reviewIntegrityEventSchema),
  interviewController.reviewIntegrityEvent
);

// GET /api/interviews/:interviewId/skill-gap (dedicated skill gap intelligence breakdown)
router.get(
  '/:interviewId/skill-gap',
  requireAuth,
  requireRole([ROLES.CANDIDATE, ROLES.RECRUITER]),
  interviewController.getSkillGapAnalysis
);

// Sub-resource: GET /api/interviews/:interviewId/report
router.get(
  '/:interviewId/report',
  requireAuth,
  requireRole([ROLES.CANDIDATE, ROLES.RECRUITER]),
  reportController.getInterviewReport
);

module.exports = router;
