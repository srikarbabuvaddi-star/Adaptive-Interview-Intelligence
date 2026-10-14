const express = require('express');
const jobExplorerController = require('../controllers/jobExplorer.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const validate = require('../middlewares/validate.middleware');
const { ROLES } = require('../constants/roles');
const {
  searchJobsQuerySchema,
  getSalaryBenchmarkQuerySchema,
  compareSkillsBodySchema,
  prepareInterviewBodySchema
} = require('../schemas/jobExplorer.schema');

const router = express.Router();

// GET /api/job-explorer/search
router.get(
  '/search',
  requireAuth,
  requireRole([ROLES.CANDIDATE, ROLES.RECRUITER]),
  validate(searchJobsQuerySchema, 'query'),
  jobExplorerController.searchJobs
);

// GET /api/job-explorer/salary-benchmark
router.get(
  '/salary-benchmark',
  requireAuth,
  requireRole([ROLES.CANDIDATE, ROLES.RECRUITER]),
  validate(getSalaryBenchmarkQuerySchema, 'query'),
  jobExplorerController.getSalaryBenchmark
);

// GET /api/job-explorer/jobs/:jobId
router.get(
  '/jobs/:jobId',
  requireAuth,
  requireRole([ROLES.CANDIDATE, ROLES.RECRUITER]),
  jobExplorerController.getJobDetails
);

// POST /api/job-explorer/compare-skills (Candidate compares saved resume to job)
router.post(
  '/compare-skills',
  requireAuth,
  requireRole([ROLES.CANDIDATE]),
  validate(compareSkillsBodySchema, 'body'),
  jobExplorerController.compareSkills
);

// POST /api/job-explorer/prepare-interview (Candidate launches adaptive interview for selected real job)
router.post(
  '/prepare-interview',
  requireAuth,
  requireRole([ROLES.CANDIDATE]),
  validate(prepareInterviewBodySchema, 'body'),
  jobExplorerController.prepareInterview
);

module.exports = router;
