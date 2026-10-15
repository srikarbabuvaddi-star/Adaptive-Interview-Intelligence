const express = require('express');
const tracer = require('./tracer');
const metrics = require('./metrics');
const ApiResponse = require('../utils/apiResponse');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

// Optional authentication for public health check, required for diagnostic spans
router.get('/health', (req, res) => {
  const snapshot = metrics.getSnapshot();
  return ApiResponse.success(res, {
    status: 'healthy',
    uptime: snapshot.uptimeSeconds,
    timestamp: snapshot.timestamp,
    system: snapshot.system
  }, 'Observability service operational');
});

router.get('/metrics', authenticate, (req, res) => {
  const snapshot = metrics.getSnapshot();
  return ApiResponse.success(res, snapshot, 'System and AI metrics retrieved successfully');
});

router.get('/traces', authenticate, (req, res) => {
  const { traceId, interviewId, limit } = req.query;
  const spans = tracer.getSpans({
    traceId,
    interviewId,
    limit: limit ? parseInt(limit, 10) : 50
  });
  return ApiResponse.success(res, {
    count: spans.length,
    spans
  }, 'Diagnostic traces retrieved successfully');
});

module.exports = router;
