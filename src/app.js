const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler.middleware');
const { apiLimiter } = require('./middlewares/rateLimiter.middleware');
const ApiResponse = require('./utils/apiResponse');

const app = express();

// Security headers
app.use(helmet());

// Cross-Origin Resource Sharing (React frontend integration)
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, server-to-server) or matching frontend URL
    if (!origin || origin === env.FRONTEND_URL || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive in dev/hackathon, restrict in strict prod
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

// HTTP Request logging
if (env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Body parsing
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Root A2A Discovery Protocol Endpoint
const { registry: a2aRegistry } = require('./a2a');
app.get(['/.well-known/agent.json', '/.well-known/agents/:agentId.json'], (req, res) => {
  const { agentId } = req.params;
  if (agentId) {
    const card = a2aRegistry.getAgentCard(agentId);
    if (!card) return res.status(404).json({ error: 'Agent not found' });
    return res.json(card);
  }
  return res.json(a2aRegistry.getDirectory());
});

// Apply rate limiter to /api
app.use('/api', apiLimiter);

// Mount main API routes
app.use('/api', routes);

// Serve static frontend bundle if built
const path = require('path');
const fs = require('fs');
const frontendDist = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// 404 Not Found handler for unmatched API routes
app.use((req, res) => {
  return ApiResponse.error(res, 404, `Route ${req.method} ${req.originalUrl} not found`, 'NOT_FOUND');
});

// Centralized error handling middleware
app.use(errorHandler);

module.exports = app;
