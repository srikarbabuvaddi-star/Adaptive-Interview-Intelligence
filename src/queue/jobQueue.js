const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

const JOB_STATES = {
  QUEUED: 'queued',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

class BackgroundJobQueue {
  constructor() {
    this.jobs = new Map(); // jobId -> { id, name, data, state, result, error, attempts, maxRetries, createdAt, completedAt }
    this.handlers = new Map(); // jobName -> handlerFn
    this.isProcessing = false;
    this.pollInterval = null;
    this._startWorker();
  }

  /**
   * Registers a worker handler for a specific job type
   */
  registerHandler(jobName, handlerFn) {
    this.handlers.set(jobName, handlerFn);
    logger.info(`[JobQueue] Registered background job handler for: ${jobName}`);
  }

  /**
   * Enqueues a new background job with idempotency checking
   */
  async enqueue(jobName, data = {}, { idempotencyKey = null, maxRetries = 3 } = {}) {
    if (!this.handlers.has(jobName)) {
      throw ApiError.badRequest(`No background job worker registered for job type: ${jobName}`);
    }

    // Check idempotency: If existing job is active or completed with same key, return it
    if (idempotencyKey) {
      for (const [id, job] of this.jobs.entries()) {
        if (job.idempotencyKey === idempotencyKey && (job.state === JOB_STATES.ACTIVE || job.state === JOB_STATES.COMPLETED)) {
          logger.info(`[JobQueue] Idempotency match for key ${idempotencyKey}; returning existing job ${id}`);
          return job;
        }
      }
    }

    const jobId = `job_${uuidv4()}`;
    const job = {
      id: jobId,
      name: jobName,
      data,
      idempotencyKey,
      state: JOB_STATES.QUEUED,
      attempts: 0,
      maxRetries,
      result: null,
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null
    };

    this.jobs.set(jobId, job);
    logger.info(`[JobQueue] Enqueued job ${jobId} (${jobName})`);
    return job;
  }

  /**
   * Worker loop to process queued jobs
   */
  _startWorker() {
    this.pollInterval = setInterval(async () => {
      if (this.isProcessing) return;

      const nextJob = this._findNextQueuedJob();
      if (!nextJob) return;

      this.isProcessing = true;
      await this._processJob(nextJob);
      this.isProcessing = false;
    }, 100);
  }

  _findNextQueuedJob() {
    for (const job of this.jobs.values()) {
      if (job.state === JOB_STATES.QUEUED) {
        return job;
      }
    }
    return null;
  }

  async _processJob(job) {
    const handler = this.handlers.get(job.name);
    if (!handler) {
      job.state = JOB_STATES.FAILED;
      job.error = `Handler not found for ${job.name}`;
      return;
    }

    job.state = JOB_STATES.ACTIVE;
    job.startedAt = Date.now();
    job.attempts += 1;

    try {
      logger.info(`[JobQueue] Processing job ${job.id} (${job.name}), attempt ${job.attempts}`);
      const result = await handler(job.data, job);
      job.state = JOB_STATES.COMPLETED;
      job.result = result;
      job.completedAt = Date.now();
      logger.info(`[JobQueue] Completed job ${job.id} in ${job.completedAt - job.startedAt}ms`);
    } catch (err) {
      logger.error(`[JobQueue] Error in job ${job.id}:`, err.message);
      if (job.attempts < job.maxRetries) {
        // Retry with backoff
        job.state = JOB_STATES.QUEUED;
        logger.warn(`[JobQueue] Scheduling retry for job ${job.id} (${job.attempts}/${job.maxRetries})`);
      } else {
        job.state = JOB_STATES.FAILED;
        job.error = err.message;
        job.completedAt = Date.now();
      }
    }
  }

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  stop() {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }
}

// Export singleton instance
module.exports = new BackgroundJobQueue();
