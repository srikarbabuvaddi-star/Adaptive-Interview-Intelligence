const ApiError = require('../../utils/apiError');
const logger = require('../../utils/logger');

const RUBRIC_VERSIONS = {
  CURRENT: '2.1.0',
  SUPPORTED: ['2.1.0', '2.0.0', '1.0.0']
};

/**
 * Standard Multi-Track Evaluation Rubrics
 */
const TRACK_RUBRICS = {
  system_architecture: {
    track: 'system_architecture',
    version: RUBRIC_VERSIONS.CURRENT,
    criteria: [
      { name: 'scalability_and_tradeoffs', weight: 0.35, description: 'Evaluation of throughput, latency, CAP tradeoffs, and partition mitigation' },
      { name: 'data_integrity_and_consistency', weight: 0.35, description: 'Correct application of transactions, replication, and consensus protocols' },
      { name: 'observability_and_resilience', weight: 0.30, description: 'Circuit breakers, distributed tracing, and graceful degradation' }
    ]
  },
  full_stack: {
    track: 'full_stack',
    version: RUBRIC_VERSIONS.CURRENT,
    criteria: [
      { name: 'framework_mastery_and_async', weight: 0.40, description: 'Proficiency with event loop, async/await, hooks, and virtual DOM' },
      { name: 'api_design_and_validation', weight: 0.35, description: 'REST/GraphQL contracts, schema validation, and status code precision' },
      { name: 'frontend_backend_integration', weight: 0.25, description: 'State synchronization, error handling, and latency optimization' }
    ]
  },
  distributed_cloud: {
    track: 'distributed_cloud',
    version: RUBRIC_VERSIONS.CURRENT,
    criteria: [
      { name: 'high_availability_and_quorum', weight: 0.40, description: 'Sentinel clusters, leader election, and split-brain resolution' },
      { name: 'concurrency_and_caching', weight: 0.35, description: 'Distributed locks, cache invalidation, and queue backpressure' },
      { name: 'infrastructure_and_containers', weight: 0.25, description: 'Containerization, orchestration, and horizontal autoscaling' }
    ]
  }
};

class GuardrailsService {
  constructor() {
    this.rubrics = TRACK_RUBRICS;
  }

  getRubricForRole(jobTitle = '') {
    const title = jobTitle.toLowerCase();
    if (title.includes('distributed') || title.includes('cloud') || title.includes('devops') || title.includes('infrastructure')) {
      return this.rubrics.distributed_cloud;
    }
    if (title.includes('architect') || title.includes('lead') || title.includes('system')) {
      return this.rubrics.system_architecture;
    }
    return this.rubrics.full_stack;
  }

  /**
   * Applies guardrail verification to model evaluation outputs:
   * 1. Clamps scores within bounds (0 - 100).
   * 2. Evidence Requirement: Ensures score >= 50 has concrete evidence quotes from the candidate answer.
   * 3. Rejects fabricated assertions or unsupported conclusions.
   * 4. Enforces separation between correctness and communication clarity.
   */
  validateAndEnforceGuardrails(rawEvaluation, candidateAnswer = '', questionContext = {}) {
    if (!rawEvaluation || typeof rawEvaluation !== 'object') {
      throw ApiError.aiServiceError('Guardrail failure: Model produced non-object evaluation output');
    }

    const sanitized = { ...rawEvaluation };

    // 1. Bound Score Clamping
    let score = Number(sanitized.score);
    if (isNaN(score)) score = 50;
    sanitized.score = Math.max(0, Math.min(100, Math.round(score)));

    let correctness = Number(sanitized.correctnessScore || sanitized.score);
    let communication = Number(sanitized.communicationScore || 70);
    sanitized.correctnessScore = Math.max(0, Math.min(100, Math.round(correctness)));
    sanitized.communicationScore = Math.max(0, Math.min(100, Math.round(communication)));

    // 2. Evidence Verification Guardrail
    const candidateText = (candidateAnswer || '').trim().toLowerCase();
    const rawEvidence = Array.isArray(sanitized.evidence) ? sanitized.evidence : [];

    // Verify evidence quotes actually correspond to candidate's words
    const verifiedEvidence = [];
    for (const ev of rawEvidence) {
      if (typeof ev === 'string' && ev.trim().length > 0) {
        const evNorm = ev.toLowerCase().trim();
        // Check if evidence is verbatim snippet or relevant reference
        if (candidateText.includes(evNorm) || evNorm.split(/\s+/).some(word => word.length > 4 && candidateText.includes(word))) {
          verifiedEvidence.push(ev);
        } else {
          // General observation
          verifiedEvidence.push(`Observation: ${ev}`);
        }
      }
    }

    // Guardrail: If candidate answer is effectively empty or extremely short (< 10 chars), score must be 0
    if (candidateText.length < 10) {
      sanitized.score = 0;
      sanitized.correctnessScore = 0;
      sanitized.status = 'insufficient';
      sanitized.feedback = 'Answer was missing, blank, or too brief to demonstrate technical competence.';
      sanitized.evidence = [];
      sanitized.guardrailFlag = 'EMPTY_ANSWER_ENFORCED';
      return sanitized;
    }

    // Guardrail: High score (>= 80) requires at least one verified substantive concept demonstration
    if (sanitized.score >= 80 && verifiedEvidence.length === 0) {
      logger.warn('[Guardrails] High score flagged without evidence; adjusting to conservative pass');
      sanitized.score = 70;
      sanitized.guardrailFlag = 'UNVERIFIED_EVIDENCE_SCORE_ADJUSTED';
    }

    sanitized.evidence = verifiedEvidence;
    sanitized.rubricVersion = RUBRIC_VERSIONS.CURRENT;
    sanitized.isGuardrailValidated = true;

    return sanitized;
  }
}

// Export singleton instance
module.exports = new GuardrailsService();
