const express = require('express');
const { defaultRegistry } = require('./registry');
const { defaultDispatcher } = require('./dispatcher');
const { requireAuth } = require('../middlewares/auth.middleware');
const { COLLECTIONS, getCollection } = require('../services/db/firestore.service');
const { enforceInterviewOwnership } = require('../mcp/auth');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

/**
 * Helper to enforce interview ownership when contextId is an interviewId
 */
async function verifyContextOwnership(contextId, user) {
  if (!contextId || !user) return;

  try {
    const intSnap = await getCollection(COLLECTIONS.INTERVIEWS).doc(contextId).get();
    if (intSnap.exists) {
      enforceInterviewOwnership(user, intSnap.data());
    }
  } catch (err) {
    if (err.statusCode === 403 || err.statusCode === 404) {
      throw err;
    }
    logger.debug(`Context check for ${contextId}: ${err.message}`);
  }
}

/**
 * Public Discovery: Agent Directory
 * GET /api/a2a/directory or GET /api/a2a/
 */
router.get(['/', '/directory', '/.well-known/agent.json'], (req, res) => {
  const directory = defaultRegistry.getDirectory();
  res.json({
    success: true,
    ...directory
  });
});

/**
 * Public Discovery: Individual Agent Card
 * GET /api/a2a/agents/:agentId/card or GET /api/a2a/agents/:agentId/.well-known/agent.json
 */
router.get(['/agents/:agentId/card', '/agents/:agentId/.well-known/agent.json'], (req, res, next) => {
  const { agentId } = req.params;
  const card = defaultRegistry.getAgentCard(agentId);

  if (!card) {
    return next(ApiError.notFound(`A2A Agent '${agentId}' not found in directory`));
  }

  res.json({
    success: true,
    agentCard: card
  });
});

/**
 * Task Submission Endpoint: Execute an A2A task against an agent
 * POST /api/a2a/agents/:agentId/tasks
 */
router.post('/agents/:agentId/tasks', requireAuth, async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const { contextId, correlationId = uuidv4(), input = {}, metadata = {} } = req.body;

    if (!input || typeof input !== 'object') {
      throw ApiError.badRequest('Missing task input payload');
    }

    // Verify multi-tenant interview ownership
    if (contextId) {
      await verifyContextOwnership(contextId, req.user);
    }

    const task = await defaultDispatcher.dispatchTask({
      agentId,
      contextId,
      correlationId,
      input,
      user: req.user,
      metadata
    });

    res.status(201).json({
      success: true,
      task
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Task Status & Artifact Retrieval
 * GET /api/a2a/agents/:agentId/tasks/:taskId or GET /api/a2a/tasks/:taskId
 */
router.get(['/agents/:agentId/tasks/:taskId', '/tasks/:taskId'], requireAuth, async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const task = await defaultDispatcher.taskStore.getTask(taskId);

    if (!task) {
      throw ApiError.notFound(`Task '${taskId}' not found`);
    }

    // Verify multi-tenant authorization
    if (task.contextId) {
      await verifyContextOwnership(task.contextId, req.user);
    }

    res.json({
      success: true,
      task
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Task Cancellation Endpoint
 * POST /api/a2a/agents/:agentId/tasks/:taskId/cancel
 */
router.post('/agents/:agentId/tasks/:taskId/cancel', requireAuth, async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { reason = 'Canceled by user' } = req.body;
    const task = await defaultDispatcher.taskStore.getTask(taskId);

    if (!task) {
      throw ApiError.notFound(`Task '${taskId}' not found`);
    }

    if (task.contextId) {
      await verifyContextOwnership(task.contextId, req.user);
    }

    const canceled = await defaultDispatcher.taskStore.cancelTask(taskId, reason);

    res.json({
      success: true,
      task: canceled
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Task Listing Endpoint
 * GET /api/a2a/tasks?contextId=:interviewId
 */
router.get('/tasks', requireAuth, async (req, res, next) => {
  try {
    const { contextId, agentId, limit } = req.query;

    if (contextId) {
      await verifyContextOwnership(contextId, req.user);
    }

    const tasks = await defaultDispatcher.taskStore.listTasks({
      contextId,
      agentId,
      limit: limit ? parseInt(limit, 10) : 50
    });

    res.json({
      success: true,
      count: tasks.length,
      tasks
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Standard A2A JSON-RPC 2.0 Handler
 * POST /api/a2a/agents/:agentId/rpc
 */
router.post('/agents/:agentId/rpc', requireAuth, async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const { jsonrpc, id, method, params = {} } = req.body;

    if (jsonrpc !== '2.0' || !id || !method) {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: id || null,
        error: { code: -32600, message: 'Invalid JSON-RPC 2.0 Request' }
      });
    }

    // JSON-RPC Method Dispatcher
    switch (method) {
      case 'getAgentCard': {
        const card = defaultRegistry.getAgentCard(agentId);
        if (!card) {
          return res.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Agent '${agentId}' not found` }
          });
        }
        return res.json({ jsonrpc: '2.0', id, result: card });
      }

      case 'sendMessage':
      case 'submitTask': {
        const { contextId, correlationId = uuidv4(), input = {}, metadata = {} } = params;
        if (contextId) {
          await verifyContextOwnership(contextId, req.user);
        }
        const task = await defaultDispatcher.dispatchTask({
          agentId,
          contextId,
          correlationId,
          input,
          user: req.user,
          metadata
        });
        return res.json({ jsonrpc: '2.0', id, result: task });
      }

      case 'getTask': {
        const { taskId } = params;
        const task = await defaultDispatcher.taskStore.getTask(taskId);
        if (!task) {
          return res.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Task '${taskId}' not found` }
          });
        }
        if (task.contextId) {
          await verifyContextOwnership(task.contextId, req.user);
        }
        return res.json({ jsonrpc: '2.0', id, result: task });
      }

      case 'cancelTask': {
        const { taskId, reason } = params;
        const task = await defaultDispatcher.taskStore.getTask(taskId);
        if (!task) {
          return res.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Task '${taskId}' not found` }
          });
        }
        if (task.contextId) {
          await verifyContextOwnership(task.contextId, req.user);
        }
        const canceled = await defaultDispatcher.taskStore.cancelTask(taskId, reason);
        return res.json({ jsonrpc: '2.0', id, result: canceled });
      }

      case 'listTasks': {
        const { contextId } = params;
        if (contextId) {
          await verifyContextOwnership(contextId, req.user);
        }
        const tasks = await defaultDispatcher.taskStore.listTasks({ contextId, agentId });
        return res.json({ jsonrpc: '2.0', id, result: { tasks } });
      }

      default:
        return res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method '${method}' not supported` }
        });
    }
  } catch (err) {
    const statusCode = err.statusCode || err.status || 500;
    res.json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: {
        code: statusCode === 403 ? -32003 : (statusCode === 404 ? -32602 : -32000),
        message: err.message
      }
    });
  }
});

module.exports = router;
