const wsServer = require('./wsServer');
const logger = require('../utils/logger');

const REALTIME_EVENTS = {
  INTERVIEW_STATUS: 'interview:status',
  INTERVIEW_STATE_UPDATE: 'interview:state_update',
  SPEECH_PARTIAL: 'speech:live_transcript',
  QUESTION_GENERATING: 'question:generating',
  QUESTION_READY: 'question:ready',
  ANSWER_EVALUATING: 'answer:evaluating',
  EVALUATION_COMPLETED: 'evaluation:completed',
  A2A_TASK_EVENT: 'a2a:task_event',
  INTERVIEW_COMPLETED: 'interview:completed'
};

/**
 * Emits an event to an authenticated interview room
 */
function emitToInterview(interviewId, eventType, data = {}) {
  try {
    wsServer.broadcastToInterview(interviewId, eventType, data);
  } catch (err) {
    logger.warn(`[Realtime Events] Failed to emit ${eventType} to interview ${interviewId}:`, err.message);
  }
}

module.exports = {
  REALTIME_EVENTS,
  emitToInterview,
  wsServer
};
