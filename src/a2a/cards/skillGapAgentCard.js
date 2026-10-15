const { AgentCard, A2A_PROTOCOL_VERSION } = require('@a2a-js/sdk');
const { zodToJsonSchema } = require('zod-to-json-schema');
const { skillGapAgentInputSchema, skillGapAgentOutputSchema } = require('../../services/agents/schemas');

const inputJsonSchema = zodToJsonSchema(skillGapAgentInputSchema, 'SkillGapInput');
const outputJsonSchema = zodToJsonSchema(skillGapAgentOutputSchema, 'SkillGapOutput');

const rawCard = {
  name: 'skill-gap-agent',
  displayName: 'Skill-Gap Analysis Agent',
  description: 'Specialized intelligence agent that categorizes technical skills into demonstrated, partially demonstrated, gap, and unassessed tiers. Distinguishes unverified resume claims from proven ability and recommends the next adaptive skill probe.',
  version: '1.0.0',
  protocolVersion: A2A_PROTOCOL_VERSION || '1.0',
  capabilities: {
    streaming: false,
    pushNotifications: false,
    interAgentDelegation: false
  },
  skills: [
    {
      id: 'analyze_skill_gaps',
      name: 'Analyze Skill Gaps & Readiness',
      description: 'Groups evaluations by skill, detects conceptual gaps, calculates readiness percentage, and recommends next difficulty and skill targets.',
      tags: ['skill-gap', 'adaptive-intelligence', 'readiness-scoring']
    }
  ],
  defaultInputSchema: inputJsonSchema,
  defaultOutputSchema: outputJsonSchema,
  url: '/api/a2a/agents/skill-gap-agent'
};

const skillGapAgentCard = AgentCard.fromJSON(rawCard);

module.exports = {
  rawCard,
  skillGapAgentCard,
  inputSchema: skillGapAgentInputSchema,
  outputSchema: skillGapAgentOutputSchema
};
