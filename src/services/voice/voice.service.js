const { getCollection, COLLECTIONS, toTimestamp } = require('../db/firestore.service');
const { getAIService } = require('../ai');
const ApiError = require('../../utils/apiError');
const logger = require('../../utils/logger');
const { emitToInterview, REALTIME_EVENTS } = require('../../realtime/events');

class VoiceService {
  constructor() {
    // In-memory mutex locks to prevent concurrent answer submissions & race conditions
    this.sessionLocks = new Map(); // interviewId -> { lockedAt, ownerUid }
    this.liveStates = new Map(); // interviewId -> { state, questionId, lastUpdated }
  }

  /**
   * Acquires exclusive lock for interview operations (prevents duplicate submissions)
   */
  acquireLock(interviewId, userUid) {
    const existing = this.sessionLocks.get(interviewId);
    if (existing) {
      const lockAgeMs = Date.now() - existing.lockedAt;
      // Expire stale lock after 45 seconds if an operation crashed
      if (lockAgeMs < 45000) {
        throw ApiError.conflict('An answer evaluation or question generation is currently in progress for this interview session. Please wait.');
      }
    }
    this.sessionLocks.set(interviewId, { lockedAt: Date.now(), ownerUid: userUid });
    return true;
  }

  /**
   * Releases exclusive interview lock
   */
  releaseLock(interviewId) {
    this.sessionLocks.delete(interviewId);
  }

  /**
   * Checks if session is currently locked
   */
  isLocked(interviewId) {
    const lock = this.sessionLocks.get(interviewId);
    if (!lock) return false;
    if (Date.now() - lock.lockedAt > 45000) {
      this.sessionLocks.delete(interviewId);
      return false;
    }
    return true;
  }

  /**
   * Updates and broadcasts live interview state
   */
  updateSessionState(interviewId, state, metadata = {}) {
    this.liveStates.set(interviewId, {
      state,
      metadata,
      lastUpdated: Date.now()
    });

    emitToInterview(interviewId, REALTIME_EVENTS.INTERVIEW_STATE_UPDATE, {
      state,
      metadata,
      timestamp: Date.now()
    });

    return { interviewId, state, metadata };
  }

  /**
   * Retrieves active live session state for reconnection / refresh recovery
   */
  async getSessionState(interviewId, user) {
    const interviewDoc = await getCollection(COLLECTIONS.INTERVIEWS).doc(interviewId).get();
    if (!interviewDoc.exists) {
      throw ApiError.notFound('Interview not found');
    }
    const interview = interviewDoc.data();

    // Verify ownership
    if (interview.candidateId !== user.uid && interview.recruiterId !== user.uid) {
      throw ApiError.forbidden('Forbidden: You do not have access to this interview session');
    }

    const memoryState = this.liveStates.get(interviewId);

    // Fetch current question details if active
    let currentQuestion = null;
    if (interview.currentQuestionId) {
      const qDoc = await getCollection(COLLECTIONS.INTERVIEW_QUESTIONS).doc(interview.currentQuestionId).get();
      if (qDoc.exists) {
        currentQuestion = { id: qDoc.id, ...qDoc.data() };
      }
    }

    return {
      interviewId,
      status: interview.status,
      currentQuestionIndex: interview.currentQuestionIndex,
      totalQuestions: interview.totalQuestions,
      currentQuestion,
      isLocked: this.isLocked(interviewId),
      liveVoiceState: memoryState?.state || 'READY',
      adaptiveState: interview.adaptiveState || {},
      lastUpdated: memoryState?.lastUpdated || Date.now()
    };
  }

  /**
   * Transcribes candidate spoken audio or validates speech transcripts
   */
  async transcribeAudio({ interviewId, user, audioBuffer, mimeType = 'audio/webm', transcriptText }) {
    // If client supplied direct browser speech recognition transcript
    if (transcriptText && transcriptText.trim().length > 0) {
      return {
        transcript: transcriptText.trim(),
        confidence: 0.95,
        source: 'speech_recognition_api',
        durationMs: null
      };
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      throw ApiError.badRequest('No audio data or transcript text received for transcription');
    }

    // Process audio buffer through Gemini multimodal transcription if available
    try {
      const aiService = getAIService();
      if (aiService && typeof aiService.transcribeAudio === 'function') {
        const result = await aiService.transcribeAudio(audioBuffer, mimeType);
        return {
          transcript: result.transcript,
          confidence: result.confidence || 0.9,
          source: 'gemini_multimodal_stt',
          durationMs: result.durationMs || null
        };
      }

      // If speech recognition fallback is required without fake audio
      throw ApiError.aiServiceError('Audio transcription service is currently unavailable. Please use browser speech-to-text or provide transcript text.');
    } catch (err) {
      logger.error('[VoiceService] Transcription error:', err.message);
      if (err instanceof ApiError) throw err;
      throw ApiError.aiServiceError(`Speech transcription failed: ${err.message}`);
    }
  }

  /**
   * Generates or formats text-to-speech payload for conversational playback
   */
  synthesizeSpeech({ text, voice = 'en-US-Standard-C', rate = 1.0 }) {
    if (!text || !text.trim()) {
      throw ApiError.badRequest('Text is required for voice synthesis');
    }

    return {
      text: text.trim(),
      voice,
      rate,
      clientInstruction: 'use_speech_synthesis_api',
      estimatedDurationSeconds: Math.ceil(text.trim().split(/\s+/).length / 2.5) // ~150 words per minute
    };
  }
}

// Export singleton instance
module.exports = new VoiceService();
