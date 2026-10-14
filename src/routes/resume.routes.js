const express = require('express');
const resumeController = require('../controllers/resume.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { uploadResumeMiddleware } = require('../middlewares/upload.middleware');

const router = express.Router();

// Candidate endpoints
router.post('/upload', requireAuth, uploadResumeMiddleware, resumeController.uploadResume);
router.get('/me', requireAuth, resumeController.getMyResume);
router.get('/me/versions', requireAuth, resumeController.getMyResumeVersions);
router.get('/me/download', requireAuth, resumeController.downloadMyResume);
router.post('/me/reprocess', requireAuth, resumeController.reprocessMyResume);

// Recruiter endpoints (with multi-tenant pipeline checks)
router.get('/candidate/:candidateId', requireAuth, resumeController.getCandidateResume);
router.get('/candidate/:candidateId/download', requireAuth, resumeController.downloadCandidateResume);

module.exports = router;
