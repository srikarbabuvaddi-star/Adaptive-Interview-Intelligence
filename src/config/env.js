const dotenv = require('dotenv');
const path = require('path');

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5000,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Firebase
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || '',
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : '',
  FIREBASE_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',

  // Gemini & AI Engine
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  AI_ENGINE_PROVIDER: process.env.AI_ENGINE_PROVIDER || 'gemini',
  AI_ENGINE_URL: process.env.AI_ENGINE_URL || '',
  AI_ENGINE_API_KEY: process.env.AI_ENGINE_API_KEY || '',

  JWT_SECRET: process.env.JWT_SECRET || '',

  // Job Market Data Providers (JSearch / Adzuna)
  JOB_DATA_PROVIDER: process.env.JOB_DATA_PROVIDER || 'jsearch',
  JSEARCH_API_KEY: process.env.JSEARCH_API_KEY || '',
  JSEARCH_API_HOST: process.env.JSEARCH_API_HOST || 'jsearch.p.rapidapi.com',
  ADZUNA_APP_ID: process.env.ADZUNA_APP_ID || '',
  ADZUNA_APP_KEY: process.env.ADZUNA_APP_KEY || '',
  JOB_CACHE_TTL_MS: parseInt(process.env.JOB_CACHE_TTL_MS, 10) || 15 * 60 * 1000, // 15 mins

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 mins
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100
};

module.exports = env;
