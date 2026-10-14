/**
 * Lightweight structured console logger
 */
const logger = {
  info: (msg, meta = {}) => {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[INFO] [${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? meta : '');
    }
  },
  warn: (msg, meta = {}) => {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[WARN] [${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? meta : '');
    }
  },
  error: (msg, meta = {}) => {
    console.error(`[ERROR] [${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? meta : '');
  },
  debug: (msg, meta = {}) => {
    if (process.env.DEBUG === 'true' && process.env.NODE_ENV !== 'test') {
      console.log(`[DEBUG] [${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? meta : '');
    }
  }
};

module.exports = logger;
