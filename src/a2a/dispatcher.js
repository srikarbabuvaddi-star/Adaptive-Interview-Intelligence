const { TaskState } = require('@a2a-js/sdk');
const { defaultRegistry } = require('./registry');
const { A2ATaskStore, TASK_STATES } = require('./taskStore');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class A2ADispatcher {
  constructor({ registry = defaultRegistry, taskStore = new A2ATaskStore() } = {}) {
    this.registry = registry;
    this.taskStore = taskStore;
    this.defaultTimeoutMs = 15000; // 15 seconds
    this.maxRetries = 2;
  }

  /**
   * Executes an A2A task against a registered agent with strict contract validation
   *
   * @param {Object} params
   * @param {string} params.agentId - Target agent ID (e.g. 'evaluation-agent')
   * @param {string} [params.contextId] - Interview session ID
   * @param {string} [params.correlationId] - Distributed tracing correlation ID
   * @param {Object} params.input - Input payload matching agent contract
   * @param {Object} [params.user] - Verified caller context
   * @param {Object} [params.metadata] - Extra operational metadata
   * @returns {Promise<Object>} Completed A2A Task object
   */
  async dispatchTask({
    agentId,
    contextId = '',
    correlationId = uuidv4(),
    input = {},
    user = null,
    metadata = {}
  }) {
    const startTime = Date.now();
    const agentDef = this.registry.getAgent(agentId);
    if (!agentDef) {
      throw ApiError.notFound(`A2A Agent '${agentId}' is not registered`);
    }

    // 1. Validate Input Contract
    let validatedInput;
    try {
      validatedInput = agentDef.inputSchema.parse(input);
    } catch (validationErr) {
      logger.warn(`[A2A Dispatcher] Input validation failed for ${agentId}: ${validationErr.message}`);
      throw ApiError.badRequest(`A2A Input Contract Validation Error: ${validationErr.message}`);
    }

    // 2. Initialize Task in SUBMITTED state
    const task = await this.taskStore.createTask({
      agentId,
      contextId,
      correlationId,
      input: validatedInput,
      metadata: {
        ...metadata,
        callerUid: user?.uid || 'system',
        callerRole: user?.role || 'system'
      }
    });

    logger.info(`[A2A Dispatcher] Task ${task.id} (${agentId}) SUBMITTED [Correlation: ${correlationId}]`);

    // 3. Transition to WORKING
    await this.taskStore.updateTaskStatus(task.id, {
      state: TaskState.TASK_STATE_WORKING,
      message: `Executing cognitive skill on ${agentDef.rawCard.displayName}`
    });

    // 4. Execute with bounded timeout and retries
    let attempt = 0;
    let finalResult = null;
    let lastError = null;

    while (attempt <= this.maxRetries) {
      attempt++;
      try {
        finalResult = await this._executeWithTimeout(agentDef.instance, validatedInput, this.defaultTimeoutMs);
        lastError = null;
        break; // Success
      } catch (err) {
        lastError = err;
        logger.warn(`[A2A Dispatcher] Attempt ${attempt} failed for task ${task.id} on ${agentId}: ${err.message}`);
        if (attempt <= this.maxRetries) {
          await new Promise(r => setTimeout(r, 200 * attempt)); // Bounded backoff
        }
      }
    }

    // 5. Handle Execution Failure
    if (lastError || !finalResult) {
      const durationMs = Date.now() - startTime;
      logger.error(`[A2A Dispatcher] Task ${task.id} FAILED after ${durationMs}ms: ${lastError?.message}`);
      const failedTask = await this.taskStore.updateTaskStatus(task.id, {
        state: TaskState.TASK_STATE_FAILED,
        message: lastError ? lastError.message : 'Agent returned no output',
        error: lastError
      });
      const errorToThrow = new Error(`A2A Task '${task.id}' failed on agent '${agentId}': ${lastError?.message}`);
      errorToThrow.status = lastError?.status || 500;
      errorToThrow.task = failedTask;
      throw errorToThrow;
    }

    // 6. Validate Output Contract
    let validatedOutput;
    try {
      validatedOutput = agentDef.outputSchema.parse(finalResult);
    } catch (outputValidationErr) {
      logger.error(`[A2A Dispatcher] Output contract violated by ${agentId}: ${outputValidationErr.message}`);
      await this.taskStore.updateTaskStatus(task.id, {
        state: TaskState.TASK_STATE_FAILED,
        message: `Output schema validation error: ${outputValidationErr.message}`,
        error: outputValidationErr
      });
      throw ApiError.internal(`Agent '${agentId}' produced an invalid output format: ${outputValidationErr.message}`);
    }

    // 7. Transition to COMPLETED with Artifact
    const durationMs = Date.now() - startTime;
    const completedTask = await this.taskStore.updateTaskStatus(task.id, {
      state: TaskState.TASK_STATE_COMPLETED,
      message: `Task successfully executed by ${agentId} in ${durationMs}ms`,
      output: validatedOutput
    });

    logger.info(`[A2A Dispatcher] Task ${task.id} COMPLETED in ${durationMs}ms [Correlation: ${correlationId}]`);
    return completedTask;
  }

  _executeWithTimeout(agentInstance, input, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(ApiError.gatewayTimeout(`Agent execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      agentInstance.execute(input)
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}

const defaultDispatcher = new A2ADispatcher();

module.exports = {
  A2ADispatcher,
  defaultDispatcher
};
