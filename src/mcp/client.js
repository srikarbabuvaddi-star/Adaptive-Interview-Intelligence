const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { createMcpServer } = require('./server');
const { createMcpAuthToken } = require('./auth');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

class McpAgentClient {
  /**
   * @param {Object} options
   * @param {Object} [options.user] - Verified user entity ({ uid, email, role })
   * @param {string} [options.authToken] - Cryptographic session token
   * @param {Object} [options.client] - Connected MCP Client instance
   * @param {Object} [options.server] - Linked McpServer instance
   */
  constructor({ user, authToken, client, server }) {
    this.user = user || null;
    this.authToken = authToken || (user ? createMcpAuthToken(user) : null);
    this.client = client;
    this.server = server;
  }

  /**
   * Lists all available tools from the MCP server
   */
  async listTools() {
    const response = await this.client.listTools();
    return response.tools || [];
  }

  /**
   * Universal tool invoker over the MCP in-memory transport
   */
  async callTool(toolName, args = {}) {
    const payload = {
      authToken: args.authToken || this.authToken,
      ...args
    };

    if (!payload.authToken) {
      throw ApiError.unauthorized('McpAgentClient: Missing authentication token for tool call');
    }

    const response = await this.client.callTool({
      name: toolName,
      arguments: payload
    });

    if (response.isError) {
      let errorMsg = `MCP Tool '${toolName}' invocation failed`;
      let errorData = null;
      if (response.content && response.content[0] && response.content[0].text) {
        try {
          const parsed = JSON.parse(response.content[0].text);
          errorMsg = parsed.error?.message || errorMsg;
          errorData = parsed.error;
        } catch {
          errorMsg = response.content[0].text;
        }
      }
      const err = new Error(errorMsg);
      err.code = errorData?.code || 'TOOL_ERROR';
      err.status = errorData?.status || 500;
      throw err;
    }

    if (response.content && response.content[0] && response.content[0].text) {
      try {
        return JSON.parse(response.content[0].text);
      } catch {
        return response.content[0].text;
      }
    }

    return response;
  }

  // Specialized Tool Accessors

  async getCandidateSkillProfile() {
    return this.callTool('get_candidate_skill_profile', {});
  }

  async getInterviewHistory({ page = 1, limit = 5, status } = {}) {
    return this.callTool('get_interview_history', { page, limit, status });
  }

  async getInterviewEvaluation({ interviewId }) {
    return this.callTool('get_interview_evaluation', { interviewId });
  }

  async getInterviewContext({ interviewId }) {
    return this.callTool('get_interview_context', { interviewId });
  }

  async saveAnswerEvaluation({
    interviewId,
    questionId,
    score,
    feedback,
    matchedConcepts = [],
    missingConcepts = [],
    evidence = [],
    strengths = [],
    weaknesses = [],
    correctnessScore,
    completenessScore,
    compositeScore,
    status
  }) {
    return this.callTool('save_answer_evaluation', {
      interviewId,
      questionId,
      score,
      feedback,
      matchedConcepts,
      missingConcepts,
      evidence,
      strengths,
      weaknesses,
      correctnessScore,
      completenessScore,
      compositeScore,
      status
    });
  }

  async updateSkillGapAnalysis({
    interviewId,
    readinessScore,
    summary,
    demonstratedSkills = [],
    partiallyDemonstratedSkills = [],
    gapSkills = [],
    unassessedSkills = [],
    recommendedNextSkill,
    recommendedDifficulty,
    recommendationReason
  }) {
    return this.callTool('update_skill_gap_analysis', {
      interviewId,
      readinessScore,
      summary,
      demonstratedSkills,
      partiallyDemonstratedSkills,
      gapSkills,
      unassessedSkills,
      recommendedNextSkill,
      recommendedDifficulty,
      recommendationReason
    });
  }

  async generateInterviewReport({ interviewId, forceRegenerate = false }) {
    return this.callTool('generate_interview_report', { interviewId, forceRegenerate });
  }

  /**
   * Closes the MCP client session
   */
  async close() {
    try {
      if (this.client) {
        await this.client.close();
      }
      if (this.server) {
        await this.server.close();
      }
    } catch (err) {
      logger.warn(`Error closing MCP client/server: ${err.message}`);
    }
  }
}

/**
 * Creates and connects a paired In-Memory MCP Client and Server for local agent operations
 *
 * @param {Object} options
 * @param {Object} [options.user] - Authenticated user context
 * @param {string} [options.authToken] - Cryptographic session token
 * @returns {Promise<McpAgentClient>} Initialized and connected McpAgentClient
 */
async function createMcpAgentClient({ user, authToken } = {}) {
  const token = authToken || (user ? createMcpAuthToken(user) : null);
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client(
    {
      name: 'adaptive-interview-agent-client',
      version: '1.0.0'
    },
    {
      capabilities: {}
    }
  );

  await client.connect(clientTransport);

  return new McpAgentClient({
    user,
    authToken: token,
    client,
    server
  });
}

module.exports = {
  McpAgentClient,
  createMcpAgentClient
};
