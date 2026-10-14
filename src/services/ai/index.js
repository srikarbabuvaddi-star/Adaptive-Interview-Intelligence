const GeminiAIService = require('./gemini.service');
const env = require('../../config/env');
const logger = require('../../utils/logger');

let aiServiceInstance = null;

function getAIService() {
  if (!aiServiceInstance) {
    if (env.AI_ENGINE_PROVIDER === 'gemini') {
      aiServiceInstance = new GeminiAIService();
    } else {
      logger.info(`Using AI provider: ${env.AI_ENGINE_PROVIDER}`);
      aiServiceInstance = new GeminiAIService();
    }
  }
  return aiServiceInstance;
}

// Allows injecting a mock AI service for unit/integration tests
function setAIService(customService) {
  aiServiceInstance = customService;
}

module.exports = {
  getAIService,
  setAIService
};
