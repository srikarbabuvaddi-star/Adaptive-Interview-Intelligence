# Build stage & Runtime
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Set node environment
ENV NODE_ENV=production

# Install dependencies first for layer caching
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose default port
EXPOSE 5000

# Start server
CMD ["node", "src/server.js"]
