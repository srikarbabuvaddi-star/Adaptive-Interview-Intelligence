const { AgentCard, A2A_PROTOCOL_VERSION } = require('@a2a-js/sdk');
const { zodToJsonSchema } = require('zod-to-json-schema');
const { answerEvaluationAgentInputSchema, answerEvaluationAgentOutputSchema } = require('../../services/agents/schemas');

const inputJsonSchema = zodToJsonSchema(answerEvaluationAgentInputSchema, 'AnswerEvaluationInput');
const outputJsonSchema = zodToJsonSchema(answerEvaluationAgentOutputSchema, 'AnswerEvaluationOutput');

const rawCard = {
  name: 'evaluation-agent',
  displayName: 'Answer Evaluation Agent',
  description: 'Specialized cognitive agent that rigorously assesses candidate answers against technical questions, extracting verbatim transcript evidence, calculating composite scores (0-10), and identifying matched vs missing concepts.',
  version: '1.0.0',
  protocolVersion: A2A_PROTOCOL_VERSION || '1.0',
  capabilities: {
    streaming: false,
    pushNotifications: false,
    interAgentDelegation: false
  },
  skills: [
    {
      id: 'evaluate_answer',
      name: 'Evaluate Candidate Answer',
      description: 'Extracts quotes, evaluates correctness and completeness, and scores technical answers against rubric standards.',
      tags: ['evaluation', 'scoring', 'evidence-extraction', 'interview']
    }
  ],
  defaultInputSchema: inputJsonSchema,
  defaultOutputSchema: outputJsonSchema,
  url: '/api/a2a/agents/evaluation-agent'
};

const evaluationAgentCard = AgentCard.fromJSON(rawCard);

module.exports = {
  rawCard,
  evaluationAgentCard,
  inputSchema: answerEvaluationAgentInputSchema,
  outputSchema: answerEvaluationAgentOutputSchema
};
