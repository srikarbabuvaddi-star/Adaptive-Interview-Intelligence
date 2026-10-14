const { GoogleGenAI } = require('@google/genai');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const ApiError = require('../../utils/apiError');

class GeminiCaller {
  constructor() {
    this.client = null;
    this.modelName = env.GEMINI_MODEL || 'gemini-2.5-flash';
    if (env.GEMINI_API_KEY) {
      try {
        this.client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        logger.info(`GeminiCaller initialized with model ${this.modelName}`);
      } catch (err) {
        logger.error(`Failed to initialize Google GenAI SDK in GeminiCaller: ${err.message}`);
      }
    }
  }

  isAvailable() {
    return Boolean(this.client && env.GEMINI_API_KEY);
  }

  /**
   * Executes a call to Gemini requesting structured JSON
   */
  async callJson(systemInstruction, userPrompt, { temperature = 0.2, fallbackFn = null } = {}) {
    if (!this.client) {
      if (typeof fallbackFn === 'function' && process.env.NODE_ENV !== 'production') {
        logger.debug('No GEMINI_API_KEY configured. Utilizing deterministic agent engine for offline/test environment.');
        return fallbackFn();
      }
      throw ApiError.aiServiceError('GEMINI_API_KEY is not configured. Live AI agent operations require a valid Gemini API key.');
    }

    try {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${systemInstruction}\n\nIMPORTANT: Respond with pure JSON only, matching the exact requested structure. No markdown formatting, no backticks, no comments.\n\n${userPrompt}`
              }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          temperature
        }
      });

      const rawText = response.text || '';
      const cleaned = rawText
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      if (!cleaned) {
        throw new Error('Gemini returned an empty response');
      }

      return JSON.parse(cleaned);
    } catch (err) {
      logger.error(`Gemini agent prompt execution failed: ${err.message}`);
      if (typeof fallbackFn === 'function' && process.env.NODE_ENV !== 'production') {
        logger.warn(`Live Gemini call failed (${err.message}). Using deterministic fallback for test.`);
        return fallbackFn();
      }
      throw ApiError.aiServiceError(`Agent AI call failed: ${err.message}. Please retry.`);
    }
  }
}

// Export singleton instance
module.exports = new GeminiCaller();
