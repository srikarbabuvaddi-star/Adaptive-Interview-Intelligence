const { AgentCard, A2A_PROTOCOL_VERSION } = require('@a2a-js/sdk');
const { zodToJsonSchema } = require('zod-to-json-schema');
const { interviewerAgentInputSchema, interviewerAgentOutputSchema } = require('../../services/agents/schemas');

const inputJsonSchema = zodToJsonSchema(interviewerAgentInputSchema, 'InterviewerInput');
const outputJsonSchema = zodToJsonSchema(interviewerAgentOutputSchema, 'InterviewerOutput');

const rawCard = {
  name: 'interviewer-agent',
  displayName: 'Adaptive Interviewer Agent',
  description: 'Specialized interviewer agent that analyzes candidate history, job requirements, and skill-gap recommendations to formulate calibrated interview questions with explicit rubrics and concept benchmarks.',
  version: '1.0.0',
  protocolVersion: A2A_PROTOCOL_VERSION || '1.0',
  capabilities: {
    streaming: false,
    pushNotifications: false,
    interAgentDelegation: false
  },
  skills: [
    {
      id: 'generate_adaptive_question',
      name: 'Generate Next Adaptive Question',
      description: 'Formulates difficulty-calibrated scenario or system design questions to probe recommended skills.',
      tags: ['interviewer', 'adaptive-questioning', 'difficulty-calibration']
    }
  ],
  defaultInputSchema: inputJsonSchema,
  defaultOutputSchema: outputJsonSchema,
  url: '/api/a2a/agents/interviewer-agent'
};

const interviewerAgentCard = AgentCard.fromJSON(rawCard);

module.exports = {
  rawCard,
  interviewerAgentCard,
  inputSchema: interviewerAgentInputSchema,
  outputSchema: interviewerAgentOutputSchema
};
