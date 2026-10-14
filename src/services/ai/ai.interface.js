/**
 * AI Engine Service Interface Definition
 * Teammates implementing alternate AI interview engines must implement these methods.
 */
class IAIEngineService {
  /**
   * Generates the initial interview question based on job specifications and candidate background
   * @param {Object} params
   * @param {Object} params.job
   * @param {Object} [params.candidateProfile]
   * @returns {Promise<{ questionText: string, skill: string, difficulty: string, expectedKeyPoints: string[], context?: string }>}
   */
  async generateFirstQuestion(params) {
    throw new Error('generateFirstQuestion() must be implemented');
  }

  /**
   * Evaluates the submitted answer and dynamically generates the next adaptive question
   * @param {Object} params
   * @param {Object} params.job
   * @param {Object} params.currentQuestion
   * @param {string} params.answer
   * @param {Array} params.previousQA
   * @param {Object} params.skillScores
   * @param {number} params.questionIndex
   * @param {number} params.maxQuestions
   * @returns {Promise<{ evaluation: Object, updatedSkillScores: Object, isInterviewComplete: boolean, nextQuestion?: Object }>}
   */
  async evaluateAnswerAndGenerateNextQuestion(params) {
    throw new Error('evaluateAnswerAndGenerateNextQuestion() must be implemented');
  }

  /**
   * Synthesizes the full interview transcript, evaluations, and integrity events into final reports
   * @param {Object} params
   * @param {Object} params.job
   * @param {Object} params.interview
   * @param {Array} params.questionsWithAnswersAndEvaluations
   * @param {Array} params.integrityEvents
   * @returns {Promise<{ overallScore: number, summary: string, strengths: string[], areasForImprovement: string[], skillBreakdown: Array, skillGapReport: Object, integrityScore: number, integrityIncidentCount: number, recommendation: string }>}
   */
  async generateFinalReport(params) {
    throw new Error('generateFinalReport() must be implemented');
  }

  /**
   * Extracts structured candidate profile from raw resume text
   * @param {string} rawResumeText
   * @returns {Promise<Object>}
   */
  async extractResumeProfile(rawResumeText) {
    throw new Error('extractResumeProfile() must be implemented');
  }
}

module.exports = IAIEngineService;
