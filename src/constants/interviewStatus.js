/**
 * Lifecycle states for an interview session
 */
const INTERVIEW_STATUS = {
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  TERMINATED: 'terminated',
  EXPIRED: 'expired'
};

const APPLICATION_STATUS = {
  PENDING: 'pending',
  REVIEWING: 'reviewing',
  INTERVIEW_INVITED: 'interview_invited',
  INTERVIEW_COMPLETED: 'interview_completed',
  REJECTED: 'rejected',
  ACCEPTED: 'accepted'
};

const JOB_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  CLOSED: 'closed'
};

const QUESTION_DIFFICULTY = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced'
};

const INTEGRITY_EVENT_TYPE = {
  TAB_SWITCH: 'tab_switch',
  WINDOW_BLUR: 'window_blur',
  FULLSCREEN_EXIT: 'fullscreen_exit',
  COPY_PASTE: 'copy_paste',
  UNUSUAL_INACTIVITY: 'unusual_inactivity',
  RAPID_SUBMISSION: 'rapid_submission',
  FAILED_SUBMISSION: 'failed_submission',
  SESSION_INTERRUPTION: 'session_interruption',
  UNEXPECTED_EXIT: 'unexpected_exit',
  MULTIPLE_FACES: 'multiple_faces',
  NO_FACE: 'no_face',
  AUDIO_ANOMALY: 'audio_anomaly',
  SUSPICIOUS_KEYSTROKES: 'suspicious_keystrokes'
};

const ASSESSMENT_STATUS = {
  DEMONSTRATED: 'demonstrated',
  PARTIALLY_DEMONSTRATED: 'partially_demonstrated',
  NOT_DEMONSTRATED: 'not_demonstrated',
  NOT_ASSESSED: 'not_assessed'
};

const REVIEW_STATUS = {
  UNREVIEWED: 'unreviewed',
  FLAGGED: 'flagged',
  REVIEWED: 'reviewed',
  DISMISSED: 'dismissed'
};

module.exports = {
  INTERVIEW_STATUS,
  APPLICATION_STATUS,
  JOB_STATUS,
  QUESTION_DIFFICULTY,
  INTEGRITY_EVENT_TYPE,
  ASSESSMENT_STATUS,
  REVIEW_STATUS
};
