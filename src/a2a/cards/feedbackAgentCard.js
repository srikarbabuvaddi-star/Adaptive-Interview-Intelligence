const { AgentCard, A2A_PROTOCOL_VERSION } = require('@a2a-js/sdk');
const { zodToJsonSchema } = require('zod-to-json-schema');
const { feedbackCoachAgentInputSchema, feedbackCoachAgentOutputSchema } = require('../../services/agents/schemas');

const inputJsonSchema = zodToJsonSchema(feedbackCoachAgentInputSchema, 'FeedbackCoachInput');
const outputJsonSchema = zodToJsonSchema(feedbackCoachAgentOutputSchema, 'FeedbackCoachOutput');

const rawCard = {
  name: 'feedback-coach-agent',
  displayName: 'Feedback & Career Coach Agent',
  description: 'Specialized report synthesis agent that compiles evaluation citations, skill gap findings, and overall performance into actionable candidate feedback and recruiter decision support.',
  version: '1.0.0',
  protocolVersion: A2A_PROTOCOL_VERSION || '1.0',
  capabilities: {
    streaming: false,
    pushNotifications: false,
    interAgentDelegation: false
  },
  skills: [
    {
      id: 'synthesize_feedback_report',
      name: 'Synthesize Evidence-Backed Feedback Report',
      description: 'Generates detailed candidate strengths, prioritized growth recommendations, and recruiter hiring support probes.',
      tags: ['feedback', 'career-coach', 'hiring-report', 'recommendations']
    }
  ],
  defaultInputSchema: inputJsonSchema,
  defaultOutputSchema: outputJsonSchema,
  url: '/api/a2a/agents/feedback-coach-agent'
};

const feedbackAgentCard = AgentCard.fromJSON(rawCard);

module.exports = {
  rawCard,
  feedbackAgentCard,
  inputSchema: feedbackCoachAgentInputSchema,
  outputSchema: feedbackCoachAgentOutputSchema
};
