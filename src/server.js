const app = require('./app');
const env = require('./config/env');
const { initFirebase } = require('./config/firebase');
const { getAIService } = require('./services/ai');
const logger = require('./utils/logger');

// Initialize dependencies
logger.info('Initializing Firebase and AI Service...');
initFirebase();
getAIService();

const { wsServer } = require('./realtime/events');

const server = app.listen(env.PORT, () => {
  // Initialize Real-time WebSocket server
  wsServer.initialize(server);

  logger.info(`=======================================================`);
  logger.info(`  Adaptive Interview Intelligence Backend Server`);
  logger.info(`  Environment: ${env.NODE_ENV}`);
  logger.info(`  Listening on: http://localhost:${env.PORT}`);
  logger.info(`  API Base URL: http://localhost:${env.PORT}/api`);
  logger.info(`  Health Check: http://localhost:${env.PORT}/api/health`);
  logger.info(`  WebSocket:    ws://localhost:${env.PORT}/ws`);
  logger.info(`=======================================================`);
});

// Graceful shutdown
const handleShutdown = (signal) => {
  logger.info(`Received ${signal}. Gracefully shutting down HTTP & WebSocket server...`);
  wsServer.close();
  server.close(() => {
    logger.info('HTTP server closed. Exiting process.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = server;
