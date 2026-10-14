const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

// Import all 7 MCP tools
const candidateSkillProfileTool = require('./tools/candidateSkillProfile');
const interviewHistoryTool = require('./tools/interviewHistory');
const interviewEvaluationTool = require('./tools/interviewEvaluation');
const interviewContextTool = require('./tools/interviewContext');
const saveAnswerEvaluationTool = require('./tools/saveAnswerEvaluation');
const updateSkillGapAnalysisTool = require('./tools/updateSkillGapAnalysis');
const generateInterviewReportTool = require('./tools/generateInterviewReport');

const ALL_TOOLS = [
  candidateSkillProfileTool,
  interviewHistoryTool,
  interviewEvaluationTool,
  interviewContextTool,
  saveAnswerEvaluationTool,
  updateSkillGapAnalysisTool,
  generateInterviewReportTool
];

/**
 * Creates and configures an MCP server instance with all tools registered
 */
function createMcpServer(options = {}) {
  const server = new McpServer({
    name: options.name || 'adaptive-interview-intelligence-mcp',
    version: options.version || '1.0.0'
  });

  // Register each tool
  for (const tool of ALL_TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema
      },
      async (args) => {
        logger.info(`[MCP] Executing tool: ${tool.name}`);
        try {
          const result = await tool.handler(args);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        } catch (err) {
          logger.error(`[MCP] Tool ${tool.name} failed: ${err.message}`, { error: err.stack });
          const statusCode = err.statusCode || (err.status) || 500;
          const errorCode = err.code || (statusCode === 403 ? 'FORBIDDEN' : (statusCode === 404 ? 'NOT_FOUND' : (statusCode === 401 ? 'UNAUTHORIZED' : 'TOOL_ERROR')));

          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: {
                    message: err.message,
                    code: errorCode,
                    status: statusCode
                  }
                })
              }
            ]
          };
        }
      }
    );
  }

  logger.info(`[MCP] Initialized McpServer with ${ALL_TOOLS.length} secure interview intelligence tools.`);
  return server;
}

module.exports = {
  createMcpServer,
  ALL_TOOLS
};
