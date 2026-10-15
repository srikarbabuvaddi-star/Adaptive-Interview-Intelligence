const express = require('express');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const jobRoutes = require('./job.routes');
const applicationRoutes = require('./application.routes');
const interviewRoutes = require('./interview.routes');
const reportRoutes = require('./report.routes');
const resumeRoutes = require('./resume.routes');
const jobExplorerRoutes = require('./jobExplorer.routes');
const mcpRoutes = require('../mcp/routes');
const { a2aRoutes } = require('../a2a');
const voiceRoutes = require('./voice.routes');
const observabilityRoutes = require('../observability/routes');
const queueRoutes = require('../queue/routes');
const ApiResponse = require('../utils/apiResponse');

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  return ApiResponse.success(res, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Adaptive Interview Intelligence API',
    version: '1.0.0'
  }, 'API Service is running smoothly');
});

// Mount module routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/jobs', jobRoutes);
router.use('/applications', applicationRoutes);
router.use('/interviews', interviewRoutes);
router.use('/reports', reportRoutes);
router.use('/resumes', resumeRoutes);
router.use('/job-explorer', jobExplorerRoutes);
router.use('/mcp', mcpRoutes);
router.use('/a2a', a2aRoutes);
router.use('/voice', voiceRoutes);
router.use('/observability', observabilityRoutes);
router.use('/queue', queueRoutes);

module.exports = router;
