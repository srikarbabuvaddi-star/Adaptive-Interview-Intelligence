const voiceService = require('../services/voice/voice.service');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');

class VoiceController {
  async transcribe(req, res, next) {
    try {
      const { interviewId, transcriptText } = req.body;
      const audioBuffer = req.file ? req.file.buffer : null;
      const mimeType = req.file ? req.file.mimetype : 'audio/webm';

      if (!interviewId) {
        throw ApiError.badRequest('interviewId is required');
      }

      const result = await voiceService.transcribeAudio({
        interviewId,
        user: req.user,
        audioBuffer,
        mimeType,
        transcriptText
      });

      return ApiResponse.success(res, result, 'Audio transcribed successfully');
    } catch (err) {
      next(err);
    }
  }

  async getSessionState(req, res, next) {
    try {
      const { interviewId } = req.params;
      const state = await voiceService.getSessionState(interviewId, req.user);
      return ApiResponse.success(res, state, 'Live session state retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  async updateSessionState(req, res, next) {
    try {
      const { interviewId } = req.params;
      const { state, metadata } = req.body;
      if (!state) {
        throw ApiError.badRequest('state is required');
      }

      const updated = voiceService.updateSessionState(interviewId, state, metadata);
      return ApiResponse.success(res, updated, 'Live voice state updated successfully');
    } catch (err) {
      next(err);
    }
  }

  async synthesize(req, res, next) {
    try {
      const { text, voice, rate } = req.body;
      const speechData = voiceService.synthesizeSpeech({ text, voice, rate });
      return ApiResponse.success(res, speechData, 'Voice synthesis parameters prepared');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new VoiceController();
