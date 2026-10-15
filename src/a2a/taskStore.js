const { TaskState } = require('@a2a-js/sdk');
const { COLLECTIONS, getCollection, toTimestamp } = require('../services/db/firestore.service');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const TASK_STATES = {
  SUBMITTED: 'TASK_STATE_SUBMITTED',
  WORKING: 'TASK_STATE_WORKING',
  COMPLETED: 'TASK_STATE_COMPLETED',
  FAILED: 'TASK_STATE_FAILED',
  CANCELED: 'TASK_STATE_CANCELED'
};

class A2ATaskStore {
  constructor() {
    this.memoryTasks = new Map();
  }

  /**
   * Creates a new A2A task in SUBMITTED state
   */
  async createTask({
    agentId,
    contextId = '',
    correlationId = uuidv4(),
    input = {},
    metadata = {}
  }) {
    const taskId = `task_${uuidv4()}`;
    const now = new Date().toISOString();

    const task = {
      id: taskId,
      contextId,
      agentId,
      correlationId,
      status: {
        state: TaskState.TASK_STATE_SUBMITTED,
        stateName: TASK_STATES.SUBMITTED,
        message: 'Task submitted and awaiting agent execution',
        timestamp: now
      },
      input,
      artifacts: [],
      history: [
        {
          role: 'user',
          parts: [{ text: typeof input === 'string' ? input : JSON.stringify(input) }],
          timestamp: now
        }
      ],
      metadata: {
        ...metadata,
        agentId,
        correlationId,
        createdAt: now,
        updatedAt: now
      }
    };

    this.memoryTasks.set(taskId, task);

    // Asynchronously cache into Firestore if available
    try {
      await getCollection('a2a_tasks').doc(taskId).set({
        ...task,
        createdAt: toTimestamp(),
        updatedAt: toTimestamp()
      });
    } catch (err) {
      logger.debug(`[A2A TaskStore] In-memory fallback for ${taskId}: ${err.message}`);
    }

    return task;
  }

  /**
   * Retrieves a task by its unique taskId
   */
  async getTask(taskId) {
    if (this.memoryTasks.has(taskId)) {
      return this.memoryTasks.get(taskId);
    }

    try {
      const snap = await getCollection('a2a_tasks').doc(taskId).get();
      if (snap.exists) {
        const task = snap.data();
        this.memoryTasks.set(taskId, task);
        return task;
      }
    } catch (err) {
      logger.debug(`[A2A TaskStore] Fetch error for ${taskId}: ${err.message}`);
    }

    return null;
  }

  /**
   * Updates task status and optional output artifacts
   */
  async updateTaskStatus(taskId, {
    state,
    message = '',
    artifacts = null,
    output = null,
    error = null
  }) {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task '${taskId}' not found`);
    }

    const now = new Date().toISOString();
    let stateEnum = state;
    if (typeof state === 'string') {
      stateEnum = TaskState[state] ?? TaskState.TASK_STATE_WORKING;
    }

    task.status = {
      state: stateEnum,
      stateName: Object.keys(TaskState).find(k => TaskState[k] === stateEnum) || 'TASK_STATE_WORKING',
      message: message || (error ? error.message : ''),
      timestamp: now
    };

    if (artifacts && Array.isArray(artifacts)) {
      task.artifacts = artifacts;
    } else if (output) {
      task.artifacts = [
        {
          id: `artifact_${uuidv4()}`,
          name: `${task.agentId}_result`,
          mimeType: 'application/json',
          data: output
        }
      ];
    }

    if (output) {
      task.output = output;
      task.history.push({
        role: 'agent',
        parts: [{ text: JSON.stringify(output) }],
        timestamp: now
      });
    }

    if (error) {
      task.error = {
        message: error.message,
        code: error.code || 'AGENT_ERROR',
        status: error.status || 500
      };
    }

    task.metadata.updatedAt = now;
    this.memoryTasks.set(taskId, task);

    try {
      await getCollection('a2a_tasks').doc(taskId).set({
        ...task,
        updatedAt: toTimestamp()
      }, { merge: true });
    } catch (err) {
      logger.debug(`[A2A TaskStore] Sync error for ${taskId}: ${err.message}`);
    }

    return task;
  }

  /**
   * Cancels an active task
   */
  async cancelTask(taskId, reason = 'Canceled by user or orchestrator') {
    return this.updateTaskStatus(taskId, {
      state: TaskState.TASK_STATE_CANCELED,
      message: reason
    });
  }

  /**
   * Lists tasks filtered by contextId (interviewId) or agentId
   */
  async listTasks({ contextId, agentId, limit = 50 } = {}) {
    const results = [];

    for (const task of this.memoryTasks.values()) {
      if (contextId && task.contextId !== contextId) continue;
      if (agentId && task.agentId !== agentId) continue;
      results.push(task);
    }

    results.sort((a, b) => new Date(b.metadata.createdAt) - new Date(a.metadata.createdAt));
    return results.slice(0, limit);
  }
}

module.exports = {
  A2ATaskStore,
  TASK_STATES
};
