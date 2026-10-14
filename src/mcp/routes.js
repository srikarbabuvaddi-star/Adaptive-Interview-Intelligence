const express = require('express');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { createMcpServer, ALL_TOOLS } = require('./server');
const { resolveUserFromToken, createMcpAuthToken } = require('./auth');
const { requireAuth } = require('../middlewares/auth.middleware');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

const router = express.Router();

// Active SSE transport sessions indexed by sessionId
const activeSessions = new Map();

// Periodic cleanup of stale sessions older than 30 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.createdAt > 30 * 60 * 1000) {
      logger.info(`[MCP] Cleaning up expired SSE session: ${sessionId}`);
      try {
        session.transport.close();
        session.server.close();
      } catch (err) {
        logger.warn(`[MCP] Cleanup error for session ${sessionId}: ${err.message}`);
      }
      activeSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

/**
 * Health check endpoint for MCP service
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Adaptive Interview Intelligence MCP Server',
    protocolVersion: '2024-11-05',
    activeSessions: activeSessions.size,
    toolsCount: ALL_TOOLS.length
  });
});

/**
 * Discovery endpoint: List all registered MCP tools and their schemas
 */
router.get('/tools', (req, res) => {
  const tools = ALL_TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema ? Object.keys(tool.inputSchema) : []
  }));

  res.json({
    success: true,
    protocol: 'mcp/1.0',
    count: tools.length,
    tools
  });
});

/**
 * SSE Transport endpoint: Establishes persistent MCP stream over HTTP Server-Sent Events
 * Authenticated via Authorization Bearer token header OR ?token=<jwt> query parameter
 */
router.get('/sse', async (req, res, next) => {
  try {
    const rawToken = req.headers.authorization || req.query.token;
    if (!rawToken) {
      throw ApiError.unauthorized('Authentication required: Provide Bearer token in Authorization header or token query parameter');
    }

    const token = typeof rawToken === 'string' && rawToken.startsWith('Bearer ')
      ? rawToken.slice(7).trim()
      : String(rawToken).trim();

    const user = await resolveUserFromToken(token);
    logger.info(`[MCP SSE] Authenticated user ${user.uid} (${user.role}) connecting to SSE transport`);

    // Instantiate an McpServer instance for this session
    const server = createMcpServer({
      name: `adaptive-mcp-${user.uid.slice(0, 8)}`,
      version: '1.0.0'
    });

    // Create SSE transport pointing to /api/mcp/messages
    const transport = new SSEServerTransport('/api/mcp/messages', res);
    const sessionId = transport.sessionId;

    activeSessions.set(sessionId, {
      sessionId,
      transport,
      server,
      user,
      createdAt: Date.now()
    });

    req.on('close', () => {
      logger.info(`[MCP SSE] Client disconnected from session ${sessionId}`);
      try {
        transport.close();
        server.close();
      } catch (err) {
        logger.warn(`[MCP SSE] Close error for ${sessionId}: ${err.message}`);
      }
      activeSessions.delete(sessionId);
    });

    await server.connect(transport);
    logger.info(`[MCP SSE] Session ${sessionId} established successfully`);
  } catch (err) {
    next(err);
  }
});

/**
 * SSE Transport message receiver endpoint: Handles incoming JSON-RPC calls for an active session
 */
router.post('/messages', async (req, res, next) => {
  try {
    const sessionId = req.query.sessionId;
    if (!sessionId || !activeSessions.has(sessionId)) {
      throw ApiError.notFound('MCP session not found or has expired. Please re-establish SSE connection.');
    }

    const session = activeSessions.get(sessionId);
    await session.transport.handlePostMessage(req, res, req.body);
  } catch (err) {
    next(err);
  }
});

/**
 * Direct Secure Tool Invocation endpoint (REST API adapter for authorized agents and clients)
 * POST /api/mcp/tools/:toolName
 */
router.post('/tools/:toolName', requireAuth, async (req, res, next) => {
  try {
    const { toolName } = req.params;
    const tool = ALL_TOOLS.find(t => t.name === toolName);

    if (!tool) {
      throw ApiError.notFound(`MCP Tool '${toolName}' not found`);
    }

    // Generate or use current user's session token to ensure backend derivation
    const rawAuth = req.headers.authorization;
    const token = rawAuth && rawAuth.startsWith('Bearer ')
      ? rawAuth.slice(7).trim()
      : createMcpAuthToken(req.user);

    const args = {
      ...req.body,
      authToken: token
    };

    logger.info(`[MCP REST] User ${req.user.uid} invoking tool: ${toolName}`);
    const result = await tool.handler(args);

    res.json({
      success: true,
      tool: toolName,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
