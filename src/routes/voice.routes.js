const express = require('express');
const multer = require('multer');
const voiceController = require('../controllers/voice.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for audio chunks
});

router.use(authenticate);

router.post('/transcribe', upload.single('audio'), (req, res, next) => voiceController.transcribe(req, res, next));
router.get('/session-state/:interviewId', (req, res, next) => voiceController.getSessionState(req, res, next));
router.post('/session-state/:interviewId', (req, res, next) => voiceController.updateSessionState(req, res, next));
router.post('/synthesize', (req, res, next) => voiceController.synthesize(req, res, next));

module.exports = router;
