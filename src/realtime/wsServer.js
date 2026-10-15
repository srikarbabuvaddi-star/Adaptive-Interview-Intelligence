const { WebSocketServer, WebSocket } = require('ws');
const url = require('url');
const { resolveUserFromToken } = require('../middlewares/auth.middleware');
const { getCollection, COLLECTIONS } = require('../services/db/firestore.service');
const logger = require('../utils/logger');

class InterviewWebSocketServer {
  constructor() {
    this.wss = null;
    this.rooms = new Map(); // Map<string (roomId), Set<WebSocket>>
    this.clientMeta = new Map(); // Map<WebSocket, { user, roomId, isAlive, connectedAt }>
    this.heartbeatInterval = null;
  }

  /**
   * Initializes WebSocket Server attached to an existing HTTP server
   */
  initialize(httpServer) {
    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', async (request, socket, head) => {
      try {
        const parsedUrl = url.parse(request.url, true);
        const pathname = parsedUrl.pathname;

        if (pathname !== '/ws' && pathname !== '/api/ws') {
          return; // Ignore other upgrade requests
        }

        // Authenticate from query parameter or authorization header
        const authHeader = request.headers['authorization'];
        const queryToken = parsedUrl.query.token;
        const token = queryToken || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

        if (!token) {
          logger.warn('[WebSocket] Upgrade rejected: Missing authentication token');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        const user = await resolveUserFromToken(token);
        if (!user) {
          logger.warn('[WebSocket] Upgrade rejected: Invalid token');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request, user);
        });
      } catch (err) {
        logger.error('[WebSocket] Upgrade error:', err.message);
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws, request, user) => {
      this._handleConnection(ws, user);
    });

    // Start heartbeat monitor
    this._startHeartbeat();
    logger.info('[WebSocket] Interview Realtime Server initialized on /ws');
  }

  /**
   * Internal connection setup
   */
  _handleConnection(ws, user) {
    this.clientMeta.set(ws, {
      user,
      roomId: null,
      isAlive: true,
      connectedAt: Date.now()
    });

    logger.info(`[WebSocket] Client connected: UID=${user.uid} (${user.email || user.role})`);

    // Send initial welcome
    this._send(ws, {
      type: 'connection:ready',
      payload: {
        userId: user.uid,
        role: user.role,
        timestamp: new Date().toISOString()
      }
    });

    ws.on('pong', () => {
      const meta = this.clientMeta.get(ws);
      if (meta) meta.isAlive = true;
    });

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this._handleMessage(ws, message);
      } catch (err) {
        logger.warn('[WebSocket] Malformed message received:', err.message);
        this._send(ws, { type: 'error', payload: { message: 'Malformed JSON payload' } });
      }
    });

    ws.on('close', () => {
      this._handleDisconnection(ws);
    });

    ws.on('error', (err) => {
      logger.error('[WebSocket] Socket error:', err.message);
    });
  }

  /**
   * Processes client incoming messages with strict ownership authorization
   */
  async _handleMessage(ws, message) {
    const meta = this.clientMeta.get(ws);
    if (!meta) return;

    const { type, payload = {} } = message;

    switch (type) {
      case 'ping':
        this._send(ws, { type: 'pong', payload: { timestamp: Date.now() } });
        break;

      case 'join_interview': {
        const { interviewId } = payload;
        if (!interviewId) {
          return this._send(ws, { type: 'error', payload: { message: 'interviewId is required' } });
        }

        // Authorize interview ownership
        const isAuthorized = await this._verifyInterviewOwnership(interviewId, meta.user);
        if (!isAuthorized) {
          logger.warn(`[WebSocket] User ${meta.user.uid} denied access to interview ${interviewId}`);
          return this._send(ws, {
            type: 'error',
            payload: { code: 'FORBIDDEN', message: 'You do not have permission to join this interview room' }
          });
        }

        // Leave previous room if any
        if (meta.roomId) {
          this._leaveRoom(ws, meta.roomId);
        }

        const roomName = `interview:${interviewId}`;
        this._joinRoom(ws, roomName);
        meta.roomId = roomName;
        meta.interviewId = interviewId;

        // Fetch current interview state
        const interviewDoc = await getCollection(COLLECTIONS.INTERVIEWS).doc(interviewId).get();
        const interviewData = interviewDoc.exists ? interviewDoc.data() : null;

        this._send(ws, {
          type: 'interview:joined',
          payload: {
            interviewId,
            status: interviewData?.status || 'UNKNOWN',
            currentQuestionIndex: interviewData?.currentQuestionIndex || 0,
            totalQuestions: interviewData?.totalQuestions || 5,
            timestamp: new Date().toISOString()
          }
        });
        logger.info(`[WebSocket] User ${meta.user.uid} joined room ${roomName}`);
        break;
      }

      case 'speech:partial': {
        // Stream partial transcript to the room
        if (!meta.roomId) return;
        const { transcript, isFinal } = payload;
        this.broadcastToRoom(meta.roomId, {
          type: 'speech:live_transcript',
          payload: {
            speaker: meta.user.uid,
            transcript: transcript || '',
            isFinal: Boolean(isFinal),
            timestamp: Date.now()
          }
        }, ws);
        break;
      }

      case 'voice:state_change': {
        if (!meta.roomId) return;
        const { state } = payload;
        this.broadcastToRoom(meta.roomId, {
          type: 'interview:state_update',
          payload: {
            interviewId: meta.interviewId,
            state, // 'LISTENING' | 'EVALUATING' | 'GENERATING' | 'SPEAKING'
            timestamp: Date.now()
          }
        });
        break;
      }

      default:
        this._send(ws, { type: 'error', payload: { message: `Unknown message type: ${type}` } });
    }
  }

  /**
   * Verifies that the authenticated user owns or manages the requested interview session
   */
  async _verifyInterviewOwnership(interviewId, user) {
    try {
      const interviewDoc = await getCollection(COLLECTIONS.INTERVIEWS).doc(interviewId).get();
      if (!interviewDoc.exists) return false;
      const data = interviewDoc.data();
      return data.candidateId === user.uid || data.recruiterId === user.uid;
    } catch (err) {
      logger.error(`[WebSocket] Ownership check failed:`, err.message);
      return false;
    }
  }

  _joinRoom(ws, roomName) {
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Set());
    }
    this.rooms.get(roomName).add(ws);
  }

  _leaveRoom(ws, roomName) {
    if (this.rooms.has(roomName)) {
      const room = this.rooms.get(roomName);
      room.delete(ws);
      if (room.size === 0) {
        this.rooms.delete(roomName);
      }
    }
  }

  _handleDisconnection(ws) {
    const meta = this.clientMeta.get(ws);
    if (meta) {
      if (meta.roomId) {
        this._leaveRoom(ws, meta.roomId);
      }
      this.clientMeta.delete(ws);
      logger.info(`[WebSocket] Client disconnected: UID=${meta.user?.uid}`);
    }
  }

  /**
   * Broadcasts an event to all connected clients in a specific room
   */
  broadcastToRoom(roomName, event, excludeWs = null) {
    const room = this.rooms.get(roomName);
    if (!room) return;

    const payloadStr = JSON.stringify(event);
    for (const client of room) {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        client.send(payloadStr);
      }
    }
  }

  /**
   * Broadcast helper by interview ID
   */
  broadcastToInterview(interviewId, eventType, payload) {
    const roomName = `interview:${interviewId}`;
    this.broadcastToRoom(roomName, {
      type: eventType,
      payload: {
        interviewId,
        ...payload,
        broadcastAt: new Date().toISOString()
      }
    });
  }

  _send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  _startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) return;
      for (const [ws, meta] of this.clientMeta.entries()) {
        if (!meta.isAlive) {
          logger.warn(`[WebSocket] Terminating inactive connection for UID=${meta.user?.uid}`);
          ws.terminate();
          this._handleDisconnection(ws);
        } else {
          meta.isAlive = false;
          ws.ping();
        }
      }
    }, 30000);
  }

  close() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.wss) {
      if (this.wss.clients) {
        for (const client of this.wss.clients) {
          try { client.terminate(); } catch {}
        }
      }
      this.wss.close();
    }
  }
}

// Export singleton instance
module.exports = new InterviewWebSocketServer();
