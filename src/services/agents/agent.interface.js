const logger = require('../../utils/logger');
const ApiError = require('../../utils/apiError');

/**
 * Base Abstract Agent for Adaptive Interview Intelligence Multi-Agent System
 * Enforces contract validation on input and output using Zod schemas
 */
class BaseAgent {
  constructor(name, inputSchema, outputSchema) {
    this.name = name;
    this.inputSchema = inputSchema;
    this.outputSchema = outputSchema;
  }

  /**
   * Main entry point for agent execution.
   * Validates input against schema, executes domain logic, and validates output against schema.
   *
   * @param {Object} input - Unchecked agent input
   * @returns {Promise<Object>} Validated and sanitized agent output
   */
  async execute(input) {
    // 1. Strict input validation
    const parsedInput = this.validateInput(input);

    logger.debug(`[${this.name}] Executing with validated input`);

    // 2. Domain logic execution
    let rawOutput;
    try {
      rawOutput = await this._process(parsedInput);
    } catch (err) {
      logger.error(`[${this.name}] Agent execution error: ${err.message}`);
      if (err.isOperational || err.statusCode) {
        throw err;
      }
      throw ApiError.aiServiceError(`[${this.name}] Processing failed: ${err.message}`);
    }

    // 3. Strict output validation
    const validatedOutput = this.validateOutput(rawOutput);

    logger.debug(`[${this.name}] Execution completed and output validated`);
    return validatedOutput;
  }

  /**
   * Validates input data against agent's input Zod schema
   */
  validateInput(input) {
    if (!this.inputSchema) return input;
    const result = this.inputSchema.safeParse(input);
    if (!result.success) {
      const issueDetails = result.error.issues.map(i => `${i.path.join('.') || 'root'}: ${i.message}`).join(', ');
      logger.warn(`[${this.name}] Input validation failed: ${issueDetails}`);
      throw ApiError.badRequest(`[${this.name}] Invalid agent input: ${issueDetails}`);
    }
    return result.data;
  }

  /**
   * Validates output data against agent's output Zod schema
   */
  validateOutput(output) {
    if (!this.outputSchema) return output;
    const result = this.outputSchema.safeParse(output);
    if (!result.success) {
      const issueDetails = result.error.issues.map(i => `${i.path.join('.') || 'root'}: ${i.message}`).join(', ');
      logger.error(`[${this.name}] Output schema violation: ${issueDetails}`);
      throw ApiError.aiServiceError(`[${this.name}] Generated response failed contract validation: ${issueDetails}`);
    }
    return result.data;
  }

  /**
   * Core logic to be implemented by specific agents
   */
  async _process(input) {
    throw new Error(`_process() must be implemented by ${this.name}`);
  }
}

module.exports = BaseAgent;
