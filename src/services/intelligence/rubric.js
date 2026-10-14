/**
 * Configurable Evaluation Rubric and AI Output Validation Module
 * Provides transparent scoring criteria, dimensional weights, and resilience checks.
 */

const { ASSESSMENT_STATUS, QUESTION_DIFFICULTY } = require('../../constants/interviewStatus');

const EVALUATION_RUBRIC = {
  scale: {
    min: 0,
    max: 10,
    passingThreshold: 6.0,
    excellenceThreshold: 8.0
  },
  dimensions: {
    conceptualAccuracy: {
      name: 'Conceptual & Technical Accuracy',
      weight: 0.35,
      description: 'Correctness of technical principles, terminology, and domain semantics.'
    },
    depthAndTradeoffs: {
      name: 'Depth & Trade-off Analysis',
      weight: 0.30,
      description: 'Consideration of performance, scalability, edge-cases, and architectural alternatives.'
    },
    practicalImplementation: {
      name: 'Practical Application & Production Best Practices',
      weight: 0.20,
      description: 'Understanding of real-world implementation, error recovery, and maintainability.'
    },
    communicationClarity: {
      name: 'Communication & Problem Decomposition',
      weight: 0.15,
      description: 'Clear, structured reasoning and concise problem decomposition.'
    }
  },
  proficiencyThresholds: {
    [QUESTION_DIFFICULTY.ADVANCED]: { minScore: 8.0, label: 'Advanced / Mastery' },
    [QUESTION_DIFFICULTY.INTERMEDIATE]: { minScore: 5.5, label: 'Intermediate / Competent' },
    [QUESTION_DIFFICULTY.BEGINNER]: { minScore: 3.0, label: 'Beginner / Foundational' }
  },
  statusThresholds: {
    demonstrated: 7.0,
    partiallyDemonstrated: 4.5
  }
};

/**
 * Determines assessment status based on normalized score (0-10) and whether questions were asked
 * @param {number|null} score
 * @param {boolean} wasAssessed
 * @returns {string}
 */
function determineAssessmentStatus(score, wasAssessed) {
  if (!wasAssessed || score === null || score === undefined) {
    return ASSESSMENT_STATUS.NOT_ASSESSED;
  }
  if (score >= EVALUATION_RUBRIC.statusThresholds.demonstrated) {
    return ASSESSMENT_STATUS.DEMONSTRATED;
  }
  if (score >= EVALUATION_RUBRIC.statusThresholds.partiallyDemonstrated) {
    return ASSESSMENT_STATUS.PARTIALLY_DEMONSTRATED;
  }
  return ASSESSMENT_STATUS.NOT_DEMONSTRATED;
}

/**
 * Determines demonstrated proficiency level from score
 * @param {number|null} score
 * @returns {string|null}
 */
function scoreToProficiencyLevel(score) {
  if (score === null || score === undefined) return null;
  if (score >= 8.0) return QUESTION_DIFFICULTY.ADVANCED;
  if (score >= 5.0) return QUESTION_DIFFICULTY.INTERMEDIATE;
  return QUESTION_DIFFICULTY.BEGINNER;
}

/**
 * Validates and sanitizes AI evaluation responses to ensure no out-of-range,
 * NaN, or malformed data compromises the platform reports.
 *
 * @param {Object} rawEvaluation
 * @param {Object} currentQuestion
 * @returns {Object} Sanitized evaluation object
 */
function validateAndSanitizeEvaluation(rawEvaluation = {}, currentQuestion = {}) {
  // Normalize score
  let score = typeof rawEvaluation.score === 'number' ? rawEvaluation.score : parseFloat(rawEvaluation.score);
  if (isNaN(score) || score === null || score === undefined) {
    score = 5.0; // Default neutral score on missing value
  }
  score = Math.min(10, Math.max(0, Math.round(score * 10) / 10));

  // Dimensional scores
  const conceptualAccuracy = clampNumber(
    rawEvaluation.conceptualAccuracy,
    score,
    0,
    10
  );
  const depthScore = clampNumber(
    rawEvaluation.depthScore,
    score,
    0,
    10
  );
  const communicationScore = clampNumber(
    rawEvaluation.communicationScore,
    score,
    0,
    10
  );

  // Strings and arrays
  const feedback = (typeof rawEvaluation.feedback === 'string' && rawEvaluation.feedback.trim())
    ? rawEvaluation.feedback.trim()
    : `Candidate answered regarding ${currentQuestion.skill || 'the target skill'} with a demonstrated score of ${score}/10.`;

  const strengths = Array.isArray(rawEvaluation.strengths)
    ? rawEvaluation.strengths.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim())
    : [];
  if (strengths.length === 0 && score >= 6.0) {
    strengths.push(`Demonstrated understanding of core ${currentQuestion.skill || 'technical'} concepts`);
  }

  const weaknesses = Array.isArray(rawEvaluation.weaknesses)
    ? rawEvaluation.weaknesses.filter(w => typeof w === 'string' && w.trim()).map(w => w.trim())
    : [];

  return {
    score,
    skill: currentQuestion.skill || rawEvaluation.skill || 'General',
    feedback,
    strengths,
    weaknesses,
    conceptualAccuracy,
    depthScore,
    communicationScore,
    rubricCriteria: {
      scale: '0-10',
      passingScore: EVALUATION_RUBRIC.scale.passingThreshold,
      excellenceScore: EVALUATION_RUBRIC.scale.excellenceThreshold
    }
  };
}

function clampNumber(val, defaultVal, min, max) {
  const n = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(n)) return defaultVal;
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
}

module.exports = {
  EVALUATION_RUBRIC,
  determineAssessmentStatus,
  scoreToProficiencyLevel,
  validateAndSanitizeEvaluation
};
