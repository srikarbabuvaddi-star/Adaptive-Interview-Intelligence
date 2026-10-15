const evaluationCardDef = require('./cards/evaluationAgentCard');
const skillGapCardDef = require('./cards/skillGapAgentCard');
const interviewerCardDef = require('./cards/interviewerAgentCard');
const feedbackCardDef = require('./cards/feedbackAgentCard');

const AnswerEvaluationAgent = require('../services/agents/evaluation.agent');
const SkillGapAgent = require('../services/agents/skillGap.agent');
const InterviewerAgent = require('../services/agents/interviewer.agent');
const FeedbackCoachAgent = require('../services/agents/feedbackCoach.agent');
const logger = require('../utils/logger');

class A2AAgentRegistry {
  constructor() {
    this.agents = new Map();
    this._initializeDefaultAgents();
  }

  _initializeDefaultAgents() {
    // 1. Evaluation Agent
    this.registerAgent('evaluation-agent', {
      agentId: 'evaluation-agent',
      card: evaluationCardDef.evaluationAgentCard,
      rawCard: evaluationCardDef.rawCard,
      instance: new AnswerEvaluationAgent(),
      inputSchema: evaluationCardDef.inputSchema,
      outputSchema: evaluationCardDef.outputSchema
    });

    // 2. Skill-Gap Agent
    this.registerAgent('skill-gap-agent', {
      agentId: 'skill-gap-agent',
      card: skillGapCardDef.skillGapAgentCard,
      rawCard: skillGapCardDef.rawCard,
      instance: new SkillGapAgent(),
      inputSchema: skillGapCardDef.inputSchema,
      outputSchema: skillGapCardDef.outputSchema
    });

    // 3. Interviewer Agent
    this.registerAgent('interviewer-agent', {
      agentId: 'interviewer-agent',
      card: interviewerCardDef.interviewerAgentCard,
      rawCard: interviewerCardDef.rawCard,
      instance: new InterviewerAgent(),
      inputSchema: interviewerCardDef.inputSchema,
      outputSchema: interviewerCardDef.outputSchema
    });

    // 4. Feedback Coach Agent
    this.registerAgent('feedback-coach-agent', {
      agentId: 'feedback-coach-agent',
      card: feedbackCardDef.feedbackAgentCard,
      rawCard: feedbackCardDef.rawCard,
      instance: new FeedbackCoachAgent(),
      inputSchema: feedbackCardDef.inputSchema,
      outputSchema: feedbackCardDef.outputSchema
    });

    logger.info(`[A2A Registry] Initialized ${this.agents.size} specialized A2A agents.`);
  }

  registerAgent(agentId, agentDef) {
    this.agents.set(agentId, agentDef);
  }

  getAgent(agentId) {
    return this.agents.get(agentId) || null;
  }

  getAgentCard(agentId) {
    const entry = this.agents.get(agentId);
    return entry ? entry.rawCard : null;
  }

  listAgents() {
    return Array.from(this.agents.values()).map(e => ({
      agentId: e.agentId,
      name: e.rawCard.name,
      displayName: e.rawCard.displayName,
      description: e.rawCard.description,
      skills: e.rawCard.skills,
      url: e.rawCard.url
    }));
  }

  getDirectory() {
    return {
      protocol: 'a2a',
      version: '1.0',
      agentsCount: this.agents.size,
      agents: this.listAgents()
    };
  }
}

const defaultRegistry = new A2AAgentRegistry();

module.exports = {
  A2AAgentRegistry,
  defaultRegistry
};
