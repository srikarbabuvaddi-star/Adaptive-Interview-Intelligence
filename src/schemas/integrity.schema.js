const { z } = require('zod');
const { INTEGRITY_EVENT_TYPE } = require('../constants/interviewStatus');

const createIntegrityEventSchema = z.object({
  eventType: z.enum([
    INTEGRITY_EVENT_TYPE.TAB_SWITCH,
    INTEGRITY_EVENT_TYPE.WINDOW_BLUR,
    INTEGRITY_EVENT_TYPE.FULLSCREEN_EXIT,
    INTEGRITY_EVENT_TYPE.COPY_PASTE,
    INTEGRITY_EVENT_TYPE.UNUSUAL_INACTIVITY,
    INTEGRITY_EVENT_TYPE.RAPID_SUBMISSION,
    INTEGRITY_EVENT_TYPE.FAILED_SUBMISSION,
    INTEGRITY_EVENT_TYPE.SESSION_INTERRUPTION,
    INTEGRITY_EVENT_TYPE.UNEXPECTED_EXIT,
    INTEGRITY_EVENT_TYPE.MULTIPLE_FACES,
    INTEGRITY_EVENT_TYPE.NO_FACE,
    INTEGRITY_EVENT_TYPE.AUDIO_ANOMALY,
    INTEGRITY_EVENT_TYPE.SUSPICIOUS_KEYSTROKES
  ]),
  eventSource: z.string().default('browser_window'),
  details: z.record(z.any()).default({}),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  explanation: z.string().optional()
});

const reviewIntegrityEventSchema = z.object({
  reviewStatus: z.enum(['reviewed', 'flagged', 'dismissed']),
  reviewNotes: z.string().max(1000).default('')
});

module.exports = {
  createIntegrityEventSchema,
  reviewIntegrityEventSchema
};
