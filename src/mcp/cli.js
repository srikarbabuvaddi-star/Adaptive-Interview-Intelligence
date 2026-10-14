#!/usr/bin/env node
/**
 * Standalone stdio MCP Server runner for Adaptive Interview Intelligence
 *
 * Usage:
 *   node src/mcp/cli.js
 * Or with pre-configured token:
 *   MCP_AUTH_TOKEN=<session_token> node src/mcp/cli.js
 *
 * NOTE: All diagnostics are printed to stderr to keep stdout strictly for JSON-RPC messages.
 */

require('dotenv').config();
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { createMcpServer } = require('./server');

async function main() {
  process.stderr.write('[MCP Stdio Server] Initializing Adaptive Interview Intelligence MCP Server...\n');

  const server = createMcpServer({
    name: 'adaptive-interview-intelligence-stdio',
    version: '1.0.0'
  });

  const transport = new StdioServerTransport();

  process.on('SIGINT', async () => {
    process.stderr.write('[MCP Stdio Server] Received SIGINT, shutting down...\n');
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    process.stderr.write('[MCP Stdio Server] Received SIGTERM, shutting down...\n');
    await server.close();
    process.exit(0);
  });

  await server.connect(transport);
  process.stderr.write('[MCP Stdio Server] Connected to stdio transport. Ready for JSON-RPC messages.\n');
}

main().catch((err) => {
  process.stderr.write(`[MCP Stdio Server Error] Fatal error: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
