const express = require('express');
const jobQueue = require('./jobQueue');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate);

// Inspect status of a queued background job
router.get('/jobs/:jobId', (req, res, next) => {
  try {
    const job = jobQueue.getJob(req.params.jobId);
    if (!job) {
      throw ApiError.notFound('Queued job not found');
    }
    return ApiResponse.success(res, {
      id: job.id,
      name: job.name,
      state: job.state,
      attempts: job.attempts,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt
    }, 'Job status retrieved successfully');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
