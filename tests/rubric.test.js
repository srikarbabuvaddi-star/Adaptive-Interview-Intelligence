const {
  EVALUATION_RUBRIC,
  determineAssessmentStatus,
  scoreToProficiencyLevel,
  validateAndSanitizeEvaluation
} = require('../src/services/intelligence/rubric');
const { ASSESSMENT_STATUS, QUESTION_DIFFICULTY } = require('../src/constants/interviewStatus');

describe('Evaluation Rubric & AI Output Validation Unit Tests', () => {
  describe('Rubric Assessment Status Mapping', () => {
    it('should map score >= 7.0 to demonstrated', () => {
      expect(determineAssessmentStatus(8.5, true)).toBe(ASSESSMENT_STATUS.DEMONSTRATED);
      expect(determineAssessmentStatus(7.0, true)).toBe(ASSESSMENT_STATUS.DEMONSTRATED);
    });

    it('should map score between 4.5 and 6.9 to partially_demonstrated', () => {
      expect(determineAssessmentStatus(6.0, true)).toBe(ASSESSMENT_STATUS.PARTIALLY_DEMONSTRATED);
      expect(determineAssessmentStatus(4.5, true)).toBe(ASSESSMENT_STATUS.PARTIALLY_DEMONSTRATED);
    });

    it('should map score < 4.5 to not_demonstrated', () => {
      expect(determineAssessmentStatus(4.0, true)).toBe(ASSESSMENT_STATUS.NOT_DEMONSTRATED);
      expect(determineAssessmentStatus(1.0, true)).toBe(ASSESSMENT_STATUS.NOT_DEMONSTRATED);
    });

    it('should map unassessed or null score to not_assessed', () => {
      expect(determineAssessmentStatus(null, false)).toBe(ASSESSMENT_STATUS.NOT_ASSESSED);
      expect(determineAssessmentStatus(8.0, false)).toBe(ASSESSMENT_STATUS.NOT_ASSESSED);
      expect(determineAssessmentStatus(undefined, true)).toBe(ASSESSMENT_STATUS.NOT_ASSESSED);
    });
  });

  describe('Proficiency Level Conversion', () => {
    it('should accurately convert scores to proficiency levels', () => {
      expect(scoreToProficiencyLevel(9.0)).toBe(QUESTION_DIFFICULTY.ADVANCED);
      expect(scoreToProficiencyLevel(6.5)).toBe(QUESTION_DIFFICULTY.INTERMEDIATE);
      expect(scoreToProficiencyLevel(3.5)).toBe(QUESTION_DIFFICULTY.BEGINNER);
      expect(scoreToProficiencyLevel(null)).toBeNull();
    });
  });

  describe('AI Output Validation and Sanitization', () => {
    const mockQuestion = {
      skill: 'PostgreSQL',
      questionText: 'Explain query indexing and vacuuming.'
    };

    it('should sanitize valid AI evaluation correctly', () => {
      const rawAi = {
        score: 8.5,
        skill: 'PostgreSQL',
        feedback: 'Excellent explanation of b-tree indexes.',
        strengths: ['Clear indexing trade-offs'],
        weaknesses: ['Could mention partial indexes'],
        conceptualAccuracy: 9.0,
        depthScore: 8.0,
        communicationScore: 8.5
      };

      const sanitized = validateAndSanitizeEvaluation(rawAi, mockQuestion);
      expect(sanitized.score).toBe(8.5);
      expect(sanitized.conceptualAccuracy).toBe(9.0);
      expect(sanitized.strengths).toEqual(['Clear indexing trade-offs']);
      expect(sanitized.rubricCriteria).toBeDefined();
    });

    it('should clamp out-of-range AI scores (> 10 or < 0)', () => {
      const outOfRangeHigh = validateAndSanitizeEvaluation({ score: 15.0 }, mockQuestion);
      expect(outOfRangeHigh.score).toBe(10.0);

      const outOfRangeLow = validateAndSanitizeEvaluation({ score: -5.0 }, mockQuestion);
      expect(outOfRangeLow.score).toBe(0.0);
    });

    it('should handle malformed, NaN, or non-numeric AI scores safely', () => {
      const nanScore = validateAndSanitizeEvaluation({ score: 'INVALID_SCORE' }, mockQuestion);
      expect(nanScore.score).toBe(5.0); // Safe fallback neutral score

      const nullScore = validateAndSanitizeEvaluation({ score: null }, mockQuestion);
      expect(nullScore.score).toBe(5.0);
    });

    it('should provide default feedback and strengths if AI returns empty or non-string values', () => {
      const emptyAi = validateAndSanitizeEvaluation({}, mockQuestion);
      expect(emptyAi.feedback).toBeTruthy();
      expect(emptyAi.skill).toBe('PostgreSQL');
      expect(Array.isArray(emptyAi.strengths)).toBe(true);
      expect(Array.isArray(emptyAi.weaknesses)).toBe(true);
    });
  });
});
