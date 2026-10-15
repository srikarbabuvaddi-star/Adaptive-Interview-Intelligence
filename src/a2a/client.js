const { defaultDispatcher } = require('./dispatcher');
const { defaultRegistry } = require('./registry');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class A2AClient {
  /**
   * @param {Object} options
   * @param {Object} [options.dispatcher] - A2ADispatcher instance
   * @param {Object} [options.registry] - A2AAgentRegistry instance
   * @param {Object} [options.user] - Verified user entity ({ uid, email, role })
   * @param {string} [options.authToken] - Cryptographic session token
   */
  constructor({ dispatcher = defaultDispatcher, registry = defaultRegistry, user = null, authToken = null } = {}) {
    this.dispatcher = dispatcher;
    this.registry = registry;
    this.user = user;
    this.authToken = authToken;
  }

  /**
   * Submits a task to any A2A agent using protocol message structure
   */
  async submitTask(agentId, { contextId = '', correlationId = uuidv4(), input = {}, metadata = {} }) {
    logger.debug(`[A2A Client] Submitting task to ${agentId} (context: ${contextId})`);
    const task = await this.dispatcher.dispatchTask({
      agentId,
      contextId,
      correlationId,
      input,
      user: this.user,
      metadata: {
        ...metadata,
        authToken: this.authToken ? 'present' : 'none'
      }
    });

    return task;
  }

  /**
   * Dispatches task and unwraps the output directly
   */
  async execute(agentId, { contextId = '', correlationId = uuidv4(), input = {} }) {
    const task = await this.submitTask(agentId, { contextId, correlationId, input });
    return task.output;
  }

  // Typed Agent Delegations

  /**
   * Delegates answer evaluation to evaluation-agent
   */
  async evaluateAnswer({ contextId, correlationId, question, answer, job, candidateProfile, previousQA = [] }) {
    return this.execute('evaluation-agent', {
      contextId,
      correlationId,
      input: {
        question,
        answer,
        job,
        candidateProfile,
        previousQA
      }
    });
  }

  /**
   * Delegates skill gap analysis to skill-gap-agent
   */
  async analyzeSkillGaps({ contextId, correlationId, job, candidateProfile, evaluations = [], roundNumber = 1, totalRounds = 5 }) {
    return this.execute('skill-gap-agent', {
      contextId,
      correlationId,
      input: {
        job,
        candidateProfile,
        evaluations,
        roundNumber,
        totalRounds
      }
    });
  }

  /**
   * Delegates question formulation to interviewer-agent
   */
  async generateAdaptiveQuestion({
    contextId,
    correlationId,
    job,
    candidateProfile,
    stage = 'initial',
    history = [],
    skillEvidence = {},
    questionIndex = 1,
    maxQuestions = 5
  }) {
    return this.execute('interviewer-agent', {
      contextId,
      correlationId,
      input: {
        job,
        candidateProfile,
        stage,
        history,
        skillEvidence,
        questionIndex,
        maxQuestions
      }
    });
  }

  /**
   * Delegates feedback report synthesis to feedback-coach-agent
   */
  async synthesizeFeedbackReport({ contextId, correlationId, interview, job, candidateProfile, evaluations = [], skillGapReport = {} }) {
    return this.execute('feedback-coach-agent', {
      contextId,
      correlationId,
      input: {
        interview,
        job,
        candidateProfile,
        evaluations,
        skillGapReport
      }
    });
  }

  /**
   * Fetches task status by taskId
   */
  async getTask(taskId) {
    return this.dispatcher.taskStore.getTask(taskId);
  }

  /**
   * Cancels a running task
   */
  async cancelTask(taskId, reason) {
    return this.dispatcher.taskStore.cancelTask(taskId, reason);
  }

  /**
   * Retrieves agent card
   */
  getAgentCard(agentId) {
    return this.registry.getAgentCard(agentId);
  }

  /**
   * Lists directory of all registered A2A agents
   */
  listDirectory() {
    return this.registry.getDirectory();
  }
}

function createA2AClient({ user = null, authToken = null } = {}) {
  return new A2AClient({ user, authToken });
}

module.exports = {
  A2AClient,
  createA2AClient
};
