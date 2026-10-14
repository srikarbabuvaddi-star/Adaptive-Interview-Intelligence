const { getDb } = require('../../config/firebase');

const COLLECTIONS = {
  USERS: 'users',
  JOBS: 'jobs',
  APPLICATIONS: 'applications',
  INTERVIEWS: 'interviews',
  INTERVIEW_QUESTIONS: 'interview_questions',
  INTERVIEW_ANSWERS: 'interview_answers',
  SKILL_EVALUATIONS: 'skill_evaluations',
  INTEGRITY_EVENTS: 'integrity_events',
  SKILL_GAP_REPORTS: 'skill_gap_reports',
  INTERVIEW_REPORTS: 'interview_reports',
  RESUMES: 'resumes',
  RESUME_VERSIONS: 'resume_versions'
};

const getCollection = (collectionName) => {
  return getDb().collection(collectionName);
};

const toTimestamp = (date = new Date()) => {
  return date.toISOString();
};

module.exports = {
  COLLECTIONS,
  getCollection,
  toTimestamp
};
