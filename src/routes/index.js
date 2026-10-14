const express = require('express');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const jobRoutes = require('./job.routes');
const applicationRoutes = require('./application.routes');
const interviewRoutes = require('./interview.routes');
const reportRoutes = require('./report.routes');
const resumeRoutes = require('./resume.routes');
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

module.exports = router;
